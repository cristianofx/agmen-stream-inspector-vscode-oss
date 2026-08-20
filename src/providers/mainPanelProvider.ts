import * as vscode from 'vscode';
import Redis from 'ioredis';
import { ConnectionService } from '../services/connectionService';
import { ConnectionProfileStore } from '../services/connectionProfileStore';
import { SearchHit } from '../core/models/searchHit';
import { ConnectionProfile } from '../core/models/connectionProfile';
import { createSearchOptions } from '../core/models/searchOptions';
import { SearchRunner, NoStreamsFoundError } from '../core/services/searchRunner';
import { StreamWatcher } from '../core/services/streamWatcher';
import { discoverStreamsAsync } from '../core/services/streamDiscoveryService';
import { buildRedisOptions } from '../core/services/redisConnectionBuilder';
import { SshTunnel } from '../core/services/sshTunnel';
import { parseRedisEndpoint } from '../core/services/redisEndpoint';
import { validateMainPanelMessage } from '../core/security/webviewMessageValidator';
import { ResultBuffer } from '../core/services/resultBuffer';
import { WebviewToExtension, ExtensionToWebview, SearchOptionsDto } from '../webview/shared/messageProtocol';
import { EditConnectionProvider } from './editConnectionProvider';
import { ReplayDialogProvider } from './replayDialogProvider';
import { ManageProfilesProvider } from './manageProfilesProvider';
import { ReplayExecutionError, ReplayService } from '../core/services/replayService';
import { verifySshHostKey } from '../core/services/sshHostKeyVerifier';
import { getEnvironmentName } from '../core/models/profileEnvironment';

export class MainPanelProvider implements vscode.Disposable {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _results: SearchHit[] = [];
    private _abortController: AbortController | undefined;
    private _profiles: ConnectionProfile[] = [];
    private _selectedProfileId: string | undefined;
    private _redis: Redis | undefined;
    private _sshTunnel: SshTunnel | undefined;
    private readonly _outputChannel = vscode.window.createOutputChannel('Agmen Stream Inspector');
    private _editConnectionProvider: EditConnectionProvider;
    private _replayDialogProvider: ReplayDialogProvider;
    private _manageProfilesProvider: ManageProfilesProvider;
    private _resultRetentionLimit = 1000;
    private readonly _replayService = new ReplayService();

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _connectionService: ConnectionService,
        private readonly _profileStore: ConnectionProfileStore,
    ) {
        this._editConnectionProvider = new EditConnectionProvider(_extensionUri, _connectionService);
        this._replayDialogProvider = new ReplayDialogProvider(_extensionUri);
        this._manageProfilesProvider = new ManageProfilesProvider(_extensionUri, _connectionService);
    }

    openPanel(): void {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            'redisInspector.mainPanel',
            'Agmen Stream Inspector',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
                    vscode.Uri.joinPath(this._extensionUri, 'resources'),
                ],
            }
        );

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.webview.onDidReceiveMessage(
            (msg: WebviewToExtension) => this._handleMessage(msg),
            undefined,
            this._disposables
        );

        this._panel.onDidDispose(() => {
            this._panel = undefined;
            this._cancel();
        }, undefined, this._disposables);

        this._loadProfiles();
    }

    async addConnection(): Promise<void> {
        const saved = await this._editConnectionProvider.openAsync();
        if (saved) {
            await this._loadProfiles();
            this._selectedProfileId = saved.id;
            this._sendToWebview({ type: 'selectProfileAfterSave', payload: { profileId: saved.id } });
        }
    }

    async editConnection(profileId: string): Promise<void> {
        const profile = this._profiles.find(p => p.id === profileId);
        if (!profile) { return; }
        const saved = await this._editConnectionProvider.openAsync(profile);
        if (saved) {
            await this._loadProfiles();
        }
    }

    async exportJson(): Promise<void> {
        if (this._results.length === 0) {
            vscode.window.showInformationMessage('No results to export.');
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`results_${timestamp()}.json`),
            filters: { 'JSON Files': ['json'] },
        });
        if (!uri) { return; }

        const json = JSON.stringify(this._results, null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
        vscode.window.showInformationMessage(`Exported ${this._results.length} results to JSON.`);
    }

    async exportCsv(): Promise<void> {
        if (this._results.length === 0) {
            vscode.window.showInformationMessage('No results to export.');
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`results_${timestamp()}.csv`),
            filters: { 'CSV Files': ['csv'] },
        });
        if (!uri) { return; }

        const lines = ['Stream,Id,DateTime,RawMessage'];
        for (const hit of this._results) {
            const raw = (hit.rawMessage ?? '').replace(/"/g, '""');
            lines.push(`"${hit.stream}","${hit.id}","${hit.idDateTimeFormatted ?? ''}","${raw}"`);
        }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(lines.join('\n'), 'utf-8'));
        vscode.window.showInformationMessage(`Exported ${this._results.length} results to CSV.`);
    }

    dispose(): void {
        this._cancel();
        this._cleanupConnection();
        this._panel?.dispose();
        this._outputChannel.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }

    // --- Message Handler ---

    private async _handleMessage(msg: WebviewToExtension): Promise<void> {
        const validated = validateMainPanelMessage(msg);
        if (!validated.ok) {
            this._outputChannel.appendLine(`Rejected malformed message: ${validated.error}`);
            this._sendToWebview({ type: 'error', payload: { message: 'Invalid request from webview.' } });
            return;
        }

        switch (msg.type) {
            case 'ready':
                await this._onWebviewReady();
                break;
            case 'selectConnection':
                if (this._isKnownProfileId(msg.payload.profileId)) {
                    this._selectedProfileId = msg.payload.profileId;
                } else {
                    this._sendToWebview({ type: 'error', payload: { message: 'Unknown connection profile.' } });
                }
                break;
            case 'fetchStreams':
                await this._fetchStreams(msg.payload.profileId);
                break;
            case 'startSearch':
                await this._startSearch(msg.payload);
                break;
            case 'startWatch':
                await this._startWatch(msg.payload);
                break;
            case 'cancel':
                this._cancel();
                this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Canceled', statusType: 'canceled' } });
                break;
            case 'addConnection':
                await this.addConnection();
                break;
            case 'editConnection':
                await this.editConnection(msg.payload.profileId);
                break;
            case 'deleteConnection':
                await this._deleteConnection(msg.payload.profileId);
                break;
            case 'manageProfiles': {
                const updated = await this._manageProfilesProvider.openAsync(this._profiles);
                if (updated) { await this._loadProfiles(); }
                break;
            }
            case 'exportJson':
                await this.exportJson();
                break;
            case 'exportCsv':
                await this.exportCsv();
                break;
            case 'replay':
                await this._replay(msg.payload.hitIndices);
                break;
            case 'replayAll':
                await this._replay(this._results.map((_, i) => i));
                break;
            case 'selectResult':
                if (msg.payload.index < this._results.length) {
                    this._onSelectResult(msg.payload.index);
                } else {
                    this._sendToWebview({ type: 'error', payload: { message: 'Selected result is no longer available.' } });
                }
                break;
        }
    }

    // --- Core Operations ---

    private async _fetchStreams(profileId: string): Promise<void> {
        this._cancel();
        this._cleanupConnection();
        this._selectedProfileId = profileId;
        const profile = this._profiles.find(p => p.id === profileId);
        if (!profile || !profile.redisUrl) {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Select a connection first', statusType: 'error' } });
            return;
        }

        this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Fetching streams...', statusType: 'connecting' } });
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        try {
            const connResult = await this._connectToRedis(profile);
            this._redis = connResult.redis;
            this._sshTunnel = connResult.tunnel;

            const streams = await discoverStreamsAsync(this._redis, undefined, signal);
            this._sendToWebview({ type: 'streamsDiscovered', payload: streams });
            this._sendToWebview({ type: 'statusUpdate', payload: { status: `Found ${streams.length} streams`, statusType: 'done' } });
        } catch (ex: unknown) {
            if (!signal.aborted) {
                const msg = ex instanceof Error ? ex.message : String(ex);
                this._outputChannel.appendLine(`Fetch streams failed: ${msg}`);
                this._sendToWebview({ type: 'error', payload: { message: `Error fetching streams: ${msg}` } });
            }
        } finally {
            this._cleanupConnection();
            this._abortController = undefined;
        }
    }

    private async _startSearch(dto: SearchOptionsDto): Promise<void> {
        this._cancel();
        this._cleanupConnection();

        if (dto.streams.length === 0) {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Please select streams.', statusType: 'error' } });
            return;
        }

        const profile = this._profiles.find(p => p.id === this._selectedProfileId);
        if (!profile) {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Select a connection first', statusType: 'error' } });
            return;
        }

        this._abortController = new AbortController();
        const signal = this._abortController.signal;
        const retentionMax = this._getResultRetentionLimit();
        this._resultRetentionLimit = retentionMax;
        this._results = [];
        this._sendToWebview({
            type: 'stateUpdate',
            payload: {
                results: this._results,
                profiles: this._profiles,
                resultRetentionLimit: this._resultRetentionLimit,
            },
        });

        this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Connecting...', statusType: 'connecting' } });

        try {
            const connResult = await this._connectToRedis(profile);
            this._redis = connResult.redis;
            this._sshTunnel = connResult.tunnel;

            const opts = createSearchOptions({
                streams: dto.streams,
                findField: dto.findField || undefined,
                findEq: dto.findEq || undefined,
                jsonField: dto.jsonField || 'message',
                findLast: dto.findLast ?? 0,
                findMax: dto.findMax ?? Number.MAX_SAFE_INTEGER,
                newestFirst: dto.newestFirst,
                findCaseInsensitive: dto.caseInsensitive,
                messageOnly: true,
                conditionalFilter: dto.conditionalFilter,
            });

            const runner = new SearchRunner(this._redis, opts);
            const startTime = Date.now();
            let count = 0;
            const buffer = new ResultBuffer(retentionMax);

            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Searching...', statusType: 'searching' } });

            for await (const hit of runner.runAsync(signal)) {
                if (signal.aborted) { break; }
                buffer.push(hit);
                this._results = [...buffer.items];
                count++;
                this._sendToWebview({ type: 'searchResult', payload: hit });
            }

            const elapsedMs = Date.now() - startTime;
            this._sendToWebview({
                type: 'searchComplete',
                payload: { count, elapsedMs },
            });
            this._sendToWebview({
                type: 'statusUpdate',
                payload: {
                    status: count === 0
                        ? 'No matches'
                        : buffer.droppedCount > 0
                            ? `Done (retained latest ${this._results.length} of ${count} results)`
                            : 'Done',
                    statusType: count === 0 ? 'noMatches' : 'done',
                },
            });

        } catch (ex: unknown) {
            if (signal.aborted) {
                this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Canceled', statusType: 'canceled' } });
            } else if (ex instanceof NoStreamsFoundError) {
                this._sendToWebview({ type: 'statusUpdate', payload: { status: `Error: ${ex.message}`, statusType: 'error' } });
            } else {
                const msg = ex instanceof Error ? ex.message : String(ex);
                this._sendToWebview({ type: 'error', payload: { message: msg } });
                this._sendToWebview({ type: 'statusUpdate', payload: { status: `Error: ${msg}`, statusType: 'error' } });
            }
        } finally {
            this._cleanupConnection();
        }
    }

    private async _startWatch(dto: SearchOptionsDto): Promise<void> {
        this._cancel();
        this._cleanupConnection();

        if (dto.streams.length === 0) {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Please select streams.', statusType: 'error' } });
            return;
        }

        const profile = this._profiles.find(p => p.id === this._selectedProfileId);
        if (!profile) {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Select a connection first', statusType: 'error' } });
            return;
        }

        this._abortController = new AbortController();
        const signal = this._abortController.signal;
        this._results = [];

        this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Connecting for Watch...', statusType: 'connecting' } });

        try {
            const connResult = await this._connectToRedis(profile);
            this._redis = connResult.redis;
            this._sshTunnel = connResult.tunnel;

            const pollInterval = vscode.workspace.getConfiguration('redisInspector').get<number>('pollIntervalMs', 100);
            const retentionMax = this._getResultRetentionLimit();
            this._resultRetentionLimit = retentionMax;
            this._sendToWebview({
                type: 'stateUpdate',
                payload: {
                    results: this._results,
                    profiles: this._profiles,
                    resultRetentionLimit: this._resultRetentionLimit,
                },
            });

            const opts = createSearchOptions({
                streams: dto.streams,
                findField: dto.findField || undefined,
                findEq: dto.findEq || undefined,
                jsonField: dto.jsonField || 'message',
                findLast: dto.findLast ?? 0,
                findMax: dto.findMax ?? Number.MAX_SAFE_INTEGER,
                newestFirst: dto.newestFirst,
                findCaseInsensitive: dto.caseInsensitive,
                messageOnly: true,
                conditionalFilter: dto.conditionalFilter,
            });

            const watcher = new StreamWatcher(this._redis, opts, pollInterval, (error, stream, phase) => {
                const prefix = phase === 'initialize' ? 'initializing' : 'polling';
                this._outputChannel.appendLine(`Watch ${prefix} issue for '${stream}': ${error.message}; retrying.`);
                this._sendToWebview({
                    type: 'statusUpdate',
                    payload: { status: `Watch connection issue for '${stream}'; retrying...`, statusType: 'watching' },
                });
            });
            const buffer = new ResultBuffer(retentionMax);
            let emitted = 0;

            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Watching...', statusType: 'watching' } });

            for await (const hit of watcher.watchAsync(signal)) {
                if (signal.aborted) { break; }
                emitted += 1;
                buffer.push(hit);
                this._results = [...buffer.items];
                this._sendToWebview({ type: 'searchResult', payload: hit });
                if (buffer.droppedCount > 0) {
                    this._sendToWebview({
                        type: 'statusUpdate',
                        payload: {
                            status: `Watching... retained ${this._results.length} results, dropped ${buffer.droppedCount}`,
                            statusType: 'watching',
                        },
                    });
                }
                if (emitted >= opts.findMax) {
                    this._sendToWebview({
                        type: 'statusUpdate',
                        payload: { status: `Watch reached limit of ${opts.findMax} result(s)`, statusType: 'done' },
                    });
                    this._cancel();
                    break;
                }
            }
        } catch (ex: unknown) {
            if (!signal.aborted) {
                const msg = ex instanceof Error ? ex.message : String(ex);
                this._outputChannel.appendLine(`Watch failed: ${msg}`);
                this._sendToWebview({ type: 'error', payload: { message: msg } });
                this._sendToWebview({ type: 'statusUpdate', payload: { status: `Error: ${msg}`, statusType: 'error' } });
            }
        } finally {
            if (signal.aborted) {
                this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Watch stopped', statusType: 'canceled' } });
            }
            this._cleanupConnection();
        }
    }

    private async _replay(hitIndices: number[]): Promise<void> {
        const hits = hitIndices
            .filter((index, position, indices) => Number.isInteger(index) && index >= 0 && index < this._results.length && indices.indexOf(index) === position)
            .map((index) => this._results[index]);
        if (hits.length === 0) {
            vscode.window.showInformationMessage('No results to replay.');
            return;
        }

        const currentProfile = this._profiles.find(p => p.id === this._selectedProfileId);
        const targetProfile = await this._replayDialogProvider.openAsync(
            currentProfile,
            this._profiles,
            hits.length,
        );

        if (!targetProfile) { return; }
        if (!await this._confirmReplayTarget(currentProfile, targetProfile, hits)) {
            return;
        }

        let redis: Redis | undefined;
        let tunnel: SshTunnel | undefined;

        this._cancel();
        this._cleanupConnection();
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        try {
            this._sendToWebview({ type: 'statusUpdate', payload: { status: 'Connecting to target...', statusType: 'connecting' } });

            const connResult = await this._connectToRedis(targetProfile);
            redis = connResult.redis;
            tunnel = connResult.tunnel;
            this._redis = redis;
            this._sshTunnel = tunnel;

            this._sendToWebview({ type: 'statusUpdate', payload: { status: `Replaying ${hits.length} message(s)...`, statusType: 'connecting' } });
            const report = await this._replayService.replayAsync(redis as never, hits, { batchSize: 50, signal });
            if (report.canceled) {
                this._sendToWebview({
                    type: 'statusUpdate',
                    payload: { status: `Replay canceled after ${report.succeeded} success(es) and ${report.failed} failure(s)`, statusType: 'canceled' },
                });
            } else if (report.failed > 0) {
                this._sendToWebview({
                    type: 'statusUpdate',
                    payload: { status: `Replay finished with ${report.succeeded} success(es) and ${report.failed} failure(s)`, statusType: 'error' },
                });
                this._outputChannel.appendLine(`Replay manifest: ${JSON.stringify(report.entries)}`);
            } else {
                this._sendToWebview({ type: 'statusUpdate', payload: { status: `Replayed ${report.succeeded} message(s) to ${targetProfile.name}`, statusType: 'done' } });
            }
        } catch (ex: unknown) {
            const report = ex instanceof ReplayExecutionError ? ex.report : undefined;
            const msg = ex instanceof Error ? ex.message : String(ex);
            if (report) {
                this._outputChannel.appendLine(`Replay partial manifest: ${JSON.stringify(report.entries)}`);
            }
            this._outputChannel.appendLine(`Replay failed after ${report?.succeeded ?? 0} success(es): ${msg}`);
            this._sendToWebview({ type: 'statusUpdate', payload: { status: `Replay failed: ${msg}`, statusType: 'error' } });
        } finally {
            this._cleanupConnection();
            this._abortController = undefined;
        }
    }

    private async _deleteConnection(profileId: string): Promise<void> {
        const profile = this._profiles.find(p => p.id === profileId);
        if (!profile) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Delete connection "${profile.name}"?`, 'Yes', 'No'
        );
        if (confirm !== 'Yes') { return; }

        await this._connectionService.deleteProfile(profileId);
        await this._loadProfiles();
    }

    // --- Helpers ---

    private async _connectToRedis(profile: ConnectionProfile): Promise<{ redis: Redis; tunnel?: SshTunnel }> {
        let tunnel: SshTunnel | undefined;

        if (profile.sshHost) {
            const endpoint = parseRedisEndpoint(profile.redisUrl);
            const sshPassword = await this._connectionService.getDecryptedSshPassword(profile.id);
            const sshKeyPassphrase = await this._connectionService.getDecryptedSshKeyPassphrase(profile.id);

            tunnel = await SshTunnel.open({
                sshHost: profile.sshHost,
                sshPort: profile.sshPort || 22,
                sshUser: profile.sshUser || '',
                sshPassword: sshPassword,
                sshKeyPath: profile.sshKeyPath || undefined,
                sshKeyPassphrase: sshKeyPassphrase || undefined,
                sshHostKeyFingerprint: profile.sshHostKeyFingerprint || undefined,
                hostKeyVerifier: async ({ host, port, fingerprint }) => {
                    const decision = await verifySshHostKey({
                        profileId: profile.id,
                        host,
                        port,
                        fingerprint,
                        getStoredFingerprint: (profileId) => this._connectionService.getStoredSshHostFingerprint(profileId),
                        persistFingerprint: async (profileId, acceptedFingerprint) => {
                            await this._connectionService.persistSshHostFingerprint(profileId, acceptedFingerprint);
                            const inMemoryProfile = this._profiles.find((candidate) => candidate.id === profileId);
                            if (inMemoryProfile) {
                                inMemoryProfile.sshHostKeyFingerprint = acceptedFingerprint;
                            }
                        },
                        confirmFingerprint: async ({ fingerprint: candidateFingerprint }) => {
                            const choice = await vscode.window.showWarningMessage(
                                `Trust SSH host ${host}:${port} with fingerprint ${candidateFingerprint}? This fingerprint will be saved for future connections.`,
                                { modal: true },
                                'Trust',
                                'Cancel',
                            );
                            return choice === 'Trust';
                        },
                    });

                    return {
                        accepted: decision.accepted,
                        trustedFingerprint: fingerprint,
                        errorMessage: decision.reason === 'mismatch'
                            ? `SSH host key mismatch for ${host}:${port}.`
                            : 'SSH host fingerprint was not trusted.',
                    };
                },
                remoteHost: endpoint.host,
                remotePort: endpoint.port,
            });
        }

        const redisPassword = await this._connectionService.getDecryptedRedisPassword(profile.id);
        const redisOpts = buildRedisOptions(
            profile.redisUrl,
            tunnel ? { localHost: tunnel.localHost, localPort: tunnel.localPort } : undefined,
            undefined,
            undefined,
            undefined,
            profile.redisUser || undefined,
            redisPassword || undefined,
        );

        const redis = new Redis(redisOpts);
        await redis.connect();
        return { redis, tunnel };
    }

    private _cleanupConnection(): void {
        try { this._redis?.disconnect(); } catch { /* ignore */ }
        this._redis = undefined;
        try { this._sshTunnel?.dispose(); } catch { /* ignore */ }
        this._sshTunnel = undefined;
    }

    private _cancel(): void {
        this._abortController?.abort();
        this._cleanupConnection();
        this._abortController = undefined;
    }

    private async _onWebviewReady(): Promise<void> {
        await this._loadProfiles();
        this._sendToWebview({
            type: 'stateUpdate',
            payload: {
                results: this._results,
                profiles: this._profiles,
                resultRetentionLimit: this._resultRetentionLimit,
            },
        });
    }

    private async _loadProfiles(): Promise<void> {
        this._profiles = await this._connectionService.loadAllProfiles();
        if (this._profiles.length > 0 && !this._selectedProfileId) {
            this._selectedProfileId = this._profiles[0].id;
        }
        this._sendToWebview({
            type: 'connectionProfiles',
            payload: this._profiles,
        });
    }

    private _onSelectResult(index: number): void {
        if (index >= 0 && index < this._results.length) {
            const hit = this._results[index];
            this._sendToWebview({
                type: 'resultSelected',
                payload: {
                    index,
                    formattedMessage: hit.formattedRawMessage ?? hit.rawMessage ?? '',
                },
            });
        }
    }

    private _sendToWebview(msg: ExtensionToWebview): void {
        this._panel?.webview.postMessage(msg);
    }

    private _isKnownProfileId(profileId: string): boolean {
        return this._profiles.some((profile) => profile.id === profileId);
    }

    private _getResultRetentionLimit(): number {
        const configured = vscode.workspace.getConfiguration('redisInspector').get<number>('resultRetentionMaxResults', 1000);
        return Number.isInteger(configured) && configured >= 100 && configured <= 10000
            ? configured
            : 1000;
    }

    private async _confirmReplayTarget(
        currentProfile: ConnectionProfile | undefined,
        targetProfile: ConnectionProfile,
        hits: SearchHit[],
    ): Promise<boolean> {
        const targetEndpoint = parseRedisEndpoint(targetProfile.redisUrl).redactedUrl;
        const uniqueStreams = Array.from(new Set(hits.map((hit) => hit.stream))).sort();
        const currentTargetWarning = currentProfile?.id === targetProfile.id
            ? 'Warning: the selected replay target is also the current source connection.'
            : undefined;
        const summary = [
            `Replay ${hits.length} message(s) to ${targetProfile.name} [${getEnvironmentName(targetProfile.environment)}]?`,
            `Endpoint: ${targetEndpoint}`,
            `Source streams (${uniqueStreams.length}): ${uniqueStreams.join(', ')}`,
            currentTargetWarning,
            hits.length > 10
                ? 'This replay is larger than 10 messages and may create significant load.'
                : 'Replay writes immediately to the selected Redis server.',
        ].filter(Boolean).join('\n');
        const confirm = await vscode.window.showWarningMessage(
            summary,
            { modal: true },
            'Replay',
            'Cancel',
        );
        return confirm === 'Replay';
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.css')
        );
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src ${webview.cspSource} 'unsafe-inline';
                   script-src 'nonce-${nonce}';
                   font-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Agmen Stream Inspector</title>
</head>
<body>
    <div id="app">
        <div class="app-container">
            <!-- Left Pane (collapsible) -->
            <aside class="options-pane" id="optionsPane">
                <section class="section connection-section">
                    <label class="section-label">Connection</label>
                    <select id="connectionSelect" class="input-field"></select>
                    <div class="button-row">
                        <button id="btnAddConn" class="btn btn-small" title="Add Connection">+ Add</button>
                        <button id="btnEditConn" class="btn btn-small" title="Edit Connection">Edit</button>
                        <button id="btnDeleteConn" class="btn btn-small" title="Delete Connection">Delete</button>
                        <button id="btnManageProfiles" class="btn btn-small" title="Manage Profiles">Manage</button>
                    </div>
                </section>

                <section class="section streams-section">
                    <label class="section-label">Streams</label>
                    <div class="button-row">
                        <button id="btnFetchStreams" class="btn btn-small btn-primary">Fetch</button>
                        <button id="btnSelectAll" class="btn btn-small">All</button>
                        <button id="btnDeselectAll" class="btn btn-small">None</button>
                    </div>
                    <input type="text" id="streamFilter" class="input-field" placeholder="Filter streams..." />
                    <div id="streamList" class="stream-list"></div>
                    <div id="streamSelectorStatus" class="status-text-small" aria-live="polite"></div>
                </section>

                <section class="section search-section">
                    <div class="section-heading-row">
                        <label class="section-label">Search Options</label>
                        <button id="btnResetFilters" class="btn btn-small" title="Reset all search and stream filters">Reset Filters</button>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Find Field</label>
                        <input type="text" id="findField" class="input-field" placeholder="Field name" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Find Equals</label>
                        <input type="text" id="findEq" class="input-field" placeholder="Value to match" />
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="useAdvancedFilters" />
                            Use Advanced Filters
                        </label>
                    </div>

                    <div id="advancedFiltersSection" style="display: none; border: 1px solid #555; padding: 8px; margin-top: 8px; border-radius: 4px; background: rgba(0,0,0,0.2);">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                            <span style="font-weight: 600; font-size: 12px;">Filter Conditions</span>
                            <span class="info-icon" title="Conditions at the root level are combined using the top-level operator (AND/OR).&#10;Use Groups to nest conditions with a different operator.&#10;Example: to match &quot;A AND (B OR C)&quot;, add A as a root condition with AND, then create an OR group containing B and C.">&#9432;</span>
                            <button id="filterHelpBtn" class="btn btn-small" style="font-size: 10px; padding: 1px 6px;">? Help</button>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <label class="form-label" style="display: block; margin-bottom: 4px;">Combine with:</label>
                            <select id="rootOperator" class="input-field" style="width: 100%;">
                                <option value="And">AND</option>
                                <option value="Or">OR</option>
                            </select>
                        </div>

                        <div id="conditionsList" style="margin-bottom: 8px;"></div>
                        <div id="nestedGroupsList" style="margin-bottom: 8px;"></div>

                        <div style="display: flex; gap: 4px; flex-direction: column;">
                            <button id="addConditionBtn" class="btn btn-small btn-primary" style="width: 100%;">+ Add Condition</button>
                            <button id="addGroupBtn" class="btn btn-small" style="width: 100%;">+ Add Group</button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Message Key</label>
                        <input type="text" id="jsonField" class="input-field" value="message" />
                    </div>
                    <div class="form-row">
                        <div class="form-group half">
                            <label class="form-label">Find Last</label>
                            <input type="number" id="findLast" class="input-field" min="1" value="100" />
                        </div>
                        <div class="form-group half">
                            <label class="form-label">Find Max</label>
                            <input type="number" id="findMax" class="input-field" min="1" />
                        </div>
                    </div>
                    <div class="checkbox-row">
                        <label><input type="checkbox" id="newestFirst" /> Newest First</label>
                        <label><input type="checkbox" id="caseInsensitive" /> Case Insensitive</label>
                    </div>
                </section>

                <section class="section actions-section">
                    <div class="button-row">
                        <button id="btnSearch" class="btn btn-primary">Find</button>
                        <button id="btnWatch" class="btn">Watch</button>
                        <button id="btnCancel" class="btn" disabled>Cancel</button>
                    </div>
                    <div class="button-row">
                        <button id="btnExportJson" class="btn btn-small">JSON</button>
                        <button id="btnExportCsv" class="btn btn-small">CSV</button>
                    </div>
                </section>

                <div id="statusText" class="status-text" aria-live="polite"></div>
            </aside>

            <!-- Right Content -->
            <main class="content-area">
                <div class="toolbar">
                    <button id="btnToggleOptions" class="btn btn-icon" title="Toggle Options">&#9776;</button>
                    <span id="summaryText" class="summary-text"></span>
                    <span class="toolbar-spacer"></span>
                    <button id="btnReplay" class="btn btn-small" title="Replay selected" disabled>Replay</button>
                    <button id="btnReplayAll" class="btn btn-small" title="Replay all" disabled>Replay All</button>
                </div>
                <div class="split-container" id="splitContainer">
                    <div class="results-panel" id="resultsPanel">
                        <div class="results-list" id="resultsList" role="listbox" aria-label="Search results"></div>
                    </div>
                    <div class="splitter" id="splitter" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize results and message panels"></div>
                    <div class="viewer-panel" id="viewerPanel">
                        <div class="find-bar" id="findBar" style="display:none;">
                            <input type="text" id="findInput" class="input-field find-input" placeholder="Find in message..." />
                            <label><input type="checkbox" id="findMatchCase" /> Aa</label>
                            <label><input type="checkbox" id="findWholeWord" /> W</label>
                            <button id="btnFindPrev" class="btn btn-icon" title="Previous">&uarr;</button>
                            <button id="btnFindNext" class="btn btn-icon" title="Next">&darr;</button>
                            <span id="findStatus" class="find-status"></span>
                            <button id="btnFindClose" class="btn btn-icon" title="Close">&times;</button>
                        </div>
                        <pre id="rawMessage" class="raw-message"></pre>
                    </div>
                </div>
            </main>
        </div>
    </div>
    <!-- Filter Help Modal -->
    <div id="filterHelpModal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="filterHelpTitle" style="display:none;">
        <div class="modal-content">
            <h3 id="filterHelpTitle" style="margin-bottom: 12px;">Advanced Filters - Help</h3>

            <h4>How it works</h4>
            <p>Each condition checks a JSON field in the message against a value. Conditions at the root level are combined using the top-level operator (AND or OR). Groups let you nest conditions with a different operator, so you can build expressions like "A AND (B OR C)".</p>

            <h4>Operators</h4>
            <ul>
                <li><strong>Equals</strong> &mdash; field value must match exactly</li>
                <li><strong>Not Equals</strong> &mdash; field value must not match</li>
                <li><strong>Contains</strong> &mdash; field value must contain the text</li>
                <li><strong>Exists</strong> &mdash; field must be present (value is ignored)</li>
            </ul>

            <h4>Examples</h4>

            <div class="help-example">
                <strong>1. Single condition</strong>
                <p class="help-desc">Find all entries where status is "active".</p>
                <code>status  Equals  active</code>
            </div>

            <div class="help-example">
                <strong>2. Multiple conditions (AND)</strong>
                <p class="help-desc">Find entries where status is "active" and region is "us-east". Set the top-level combinator to AND, then add both as root conditions.</p>
                <code>Combine with: AND<br/>status  Equals  active<br/>region  Equals  us-east</code>
            </div>

            <div class="help-example">
                <strong>3. AND with OR group</strong>
                <p class="help-desc">Find entries where status is "active" AND the type is either "error" or "warning". Add "status" as a root condition, then create an OR group containing both type conditions.</p>
                <code>Combine with: AND<br/>status  Equals  active<br/>Group (OR):<br/>&nbsp;&nbsp;type  Equals  error<br/>&nbsp;&nbsp;type  Equals  warning</code>
                <p class="help-result">Result: status = "active" AND (type = "error" OR type = "warning")</p>
            </div>

            <div class="help-example">
                <strong>4. Contains operator</strong>
                <p class="help-desc">Find entries where the message field contains the word "timeout".</p>
                <code>message  Contains  timeout</code>
            </div>

            <div class="help-example">
                <strong>5. Basic search + advanced filters</strong>
                <p class="help-desc">The basic search (Find Field / Find Equals) is always applied first. Advanced filters are then applied on top. For example, to find entries where enabled = "true" and either category is "network" or category is "storage":</p>
                <code class="help-basic">Find Field:   enabled<br/>Find Equals:   true</code>
                <code>Combine with: AND<br/>Group (OR):<br/>&nbsp;&nbsp;category  Equals  network<br/>&nbsp;&nbsp;category  Equals  storage</code>
                <p class="help-result">Result: enabled = "true" AND (category = "network" OR category = "storage")</p>
                <p class="help-tip"><em>Important: Put all OR conditions inside a group. If you leave them as root conditions, they are joined by the top-level combinator (AND), not OR.</em></p>
            </div>

            <div class="help-tip-box">
                <strong>Tip:</strong> The top-level combinator joins root conditions with groups. Conditions inside a group use the group's own combinator. To build "A AND (B OR C)", keep A at the root (AND), and put B and C inside an OR group.
            </div>

            <div style="text-align: right; margin-top: 12px;">
                <button id="filterHelpCloseBtn" class="btn btn-primary">Close</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

// --- Utility Functions ---

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
