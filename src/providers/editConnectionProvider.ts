import * as vscode from 'vscode';
import Redis from 'ioredis';
import { ConnectionProfile, createDefaultProfile } from '../core/models/connectionProfile';
import { ConnectionService } from '../services/connectionService';
import { buildRedisOptions } from '../core/services/redisConnectionBuilder';
import { SshTunnel } from '../core/services/sshTunnel';
import { parseRedisEndpoint } from '../core/services/redisEndpoint';
import { validateEditConnectionMessage } from '../core/security/webviewMessageValidator';
import { verifySshHostKey } from '../core/services/sshHostKeyVerifier';

/**
 * Manages the Edit Connection webview panel.
 * Opens as a separate panel; resolves with the saved profile or undefined if canceled.
 */
export class EditConnectionProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _resolve: ((profile: ConnectionProfile | undefined) => void) | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _connectionService: ConnectionService,
    ) {}

    /**
     * Opens the edit connection dialog.
     * @param existingProfile If provided, edits this profile. Otherwise creates a new one.
     * @returns The saved profile, or undefined if canceled.
     */
    async openAsync(existingProfile?: ConnectionProfile): Promise<ConnectionProfile | undefined> {
        // If panel already open, reveal it
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Two);
            return undefined;
        }

        const isEdit = !!existingProfile;
        const profile = existingProfile
            ? { ...existingProfile }
            : createDefaultProfile();

        return new Promise<ConnectionProfile | undefined>(async (resolve) => {
            this._resolve = resolve;

            this._panel = vscode.window.createWebviewPanel(
                'redisInspector.editConnection',
                isEdit ? `Edit: ${profile.name}` : 'New Connection',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
                    ],
                }
            );

            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

            this._panel.webview.onDidReceiveMessage(async (msg) => {
                try {
                    const validated = validateEditConnectionMessage(msg);
                    if (!validated.ok) {
                        this._postTestResult(false, validated.error);
                        return;
                    }

                    switch (msg.type) {
                        case 'ready':
                            await this._sendProfile(profile, isEdit);
                            break;
                        case 'save':
                            await this._onSave(msg.payload);
                            break;
                        case 'cancel':
                            this._close(undefined);
                            break;
                        case 'testConnection':
                            await this._testConnection(msg.payload);
                            break;
                        case 'browseSshKey':
                            await this._browseSshKey();
                            break;
                    }
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    this._postTestResult(false, `Operation failed: ${message}`);
                }
            });

            this._panel.onDidDispose(() => {
                this._panel = undefined;
                if (this._resolve) {
                    this._resolve(undefined);
                    this._resolve = undefined;
                }
            });
        });
    }

    private async _sendProfile(profile: ConnectionProfile, isEdit: boolean): Promise<void> {
        // For edit mode, load passwords from secret storage
        let redisPass = '';
        let sshPass = '';
        let sshKeyPassphrase = '';
        if (isEdit) {
            redisPass = await this._connectionService.getDecryptedRedisPassword(profile.id) || '';
            sshPass = await this._connectionService.getDecryptedSshPassword(profile.id) || '';
            sshKeyPassphrase = await this._connectionService.getDecryptedSshKeyPassphrase(profile.id) || '';
        }

        this._panel?.webview.postMessage({
            type: 'loadProfile',
            payload: {
                ...profile,
                redisPass,
                sshPass,
                sshKeyPassphrase,
            },
        });
    }

    private async _onSave(payload: ConnectionProfile): Promise<void> {
        await this._connectionService.saveProfile(payload);
        this._close(payload);
    }

    private _postTestResult(success: boolean, message: string): void {
        this._panel?.webview.postMessage({
            type: 'testResult',
            payload: { success, message },
        });
    }

    private async _testConnection(payload: {
        id?: string;
        redisUrl: string;
        redisUser: string;
        redisPass: string;
        sshHost: string;
        sshPort: number;
        sshUser: string;
        sshPass: string;
        sshKeyPath: string;
        sshKeyPassphrase: string;
        sshHostKeyFingerprint: string;
    }): Promise<void> {
        this._panel?.webview.postMessage({ type: 'testStarted' });

        let redis: Redis | undefined;
        let tunnel: SshTunnel | undefined;

        try {
            // Set up SSH tunnel if configured
            if (payload.sshHost) {
                const endpoint = parseRedisEndpoint(payload.redisUrl);
                tunnel = await SshTunnel.open({
                    sshHost: payload.sshHost,
                    sshPort: payload.sshPort || 22,
                    sshUser: payload.sshUser || '',
                    sshPassword: payload.sshPass || undefined,
                    sshKeyPath: payload.sshKeyPath || undefined,
                    sshKeyPassphrase: payload.sshKeyPassphrase || undefined,
                    sshHostKeyFingerprint: payload.sshHostKeyFingerprint || undefined,
                    hostKeyVerifier: async ({ host, port, fingerprint, configuredFingerprint }) => {
                        const decision = await verifySshHostKey({
                            profileId: payload.id || 'unsaved-profile',
                            host,
                            port,
                            fingerprint,
                            getStoredFingerprint: async () => configuredFingerprint,
                            persistFingerprint: async (_profileId, acceptedFingerprint) => {
                                this._panel?.webview.postMessage({
                                    type: 'sshFingerprintLearned',
                                    payload: { fingerprint: acceptedFingerprint },
                                });
                            },
                            confirmFingerprint: async ({ fingerprint: candidateFingerprint }) => {
                                const choice = await vscode.window.showWarningMessage(
                                    `Trust SSH host ${host}:${port} with fingerprint ${candidateFingerprint}? This fingerprint will be saved to the connection profile.`,
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

            const opts = buildRedisOptions(
                payload.redisUrl,
                tunnel ? { localHost: tunnel.localHost, localPort: tunnel.localPort } : undefined,
                undefined,
                5000,
                undefined,
                payload.redisUser || undefined,
                payload.redisPass || undefined,
            );

            redis = new Redis(opts);
            await redis.connect();
            const pong = await redis.ping();

            this._panel?.webview.postMessage({
                type: 'testResult',
                payload: {
                    success: true,
                    message: `Connected successfully! PING → ${pong}`,
                },
            });
        } catch (ex: unknown) {
            const msg = ex instanceof Error ? ex.message : String(ex);
            this._panel?.webview.postMessage({
                type: 'testResult',
                payload: {
                    success: false,
                    message: `Connection failed: ${msg}`,
                },
            });
        } finally {
            try { redis?.disconnect(); } catch { /* ignore */ }
            try { tunnel?.dispose(); } catch { /* ignore */ }
        }
    }

    private _close(result: ConnectionProfile | undefined): void {
        if (this._resolve) {
            this._resolve(result);
            this._resolve = undefined;
        }
        this._panel?.dispose();
        this._panel = undefined;
    }

    private async _browseSshKey(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select SSH Private Key',
        });
        const selectedPath = result?.[0]?.fsPath;
        if (selectedPath) {
            this._panel?.webview.postMessage({
                type: 'sshKeySelected',
                payload: { path: selectedPath },
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'editConnection.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'editConnection.css')
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
    <title>Edit Connection</title>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-body">
            <!-- Name + Environment -->
            <div class="form-row">
                <div class="form-group flex-1">
                    <label class="form-label" for="connName">Name</label>
                    <input type="text" id="connName" class="input-field" placeholder="e.g., staging-redis" autocomplete="off" />
                </div>
                <div class="form-group flex-shrink">
                    <label class="form-label" for="connEnv">Environment</label>
                    <select id="connEnv" class="input-field">
                        <option value="0">Dev</option>
                        <option value="1">Test</option>
                        <option value="2">Prod</option>
                    </select>
                </div>
            </div>

            <div class="separator"></div>

            <!-- Redis URL -->
            <div class="form-group">
                <label class="form-label" for="redisUrl">Redis URL</label>
                <input type="text" id="redisUrl" class="input-field" value="redis://localhost:6379" autocomplete="off" />
                <div id="redisUrlError" class="validation-error"></div>
            </div>

            <!-- Redis Authentication (collapsible) -->
            <div class="section-header" id="redisAuthHeader">
                <span class="chevron" id="redisAuthChevron">&#9654;</span>
                <span>Redis Authentication</span>
            </div>
            <div class="section-content" id="redisAuthContent">
                <div class="form-group">
                    <label class="form-label" for="redisUser">Redis Username</label>
                    <input type="text" id="redisUser" class="input-field" placeholder="leave empty if not required" autocomplete="off" />
                </div>
                <div class="form-group">
                    <label class="form-label" for="redisPass">Redis Password</label>
                    <input type="password" id="redisPass" class="input-field" placeholder="leave empty if not required" autocomplete="off" />
                </div>
            </div>

            <div class="separator"></div>

            <!-- SSH Tunnel (collapsible) -->
            <div class="section-header" id="sshHeader">
                <span class="chevron" id="sshChevron">&#9654;</span>
                <span>SSH Tunnel</span>
            </div>
            <div class="section-content" id="sshContent">
                <div class="form-row">
                    <div class="form-group flex-1">
                        <label class="form-label" for="sshHost">SSH Host</label>
                        <input type="text" id="sshHost" class="input-field" placeholder="bastion.example.com" autocomplete="off" />
                    </div>
                    <div class="form-group ssh-port-group">
                        <label class="form-label" for="sshPort">Port</label>
                        <input type="number" id="sshPort" class="input-field" value="22" min="1" max="65535" />
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="sshUser">SSH Username</label>
                    <input type="text" id="sshUser" class="input-field" autocomplete="off" />
                </div>
                <div class="form-group">
                    <label class="form-label" for="sshPass">SSH Password</label>
                    <input type="password" id="sshPass" class="input-field" placeholder="password" autocomplete="off" />
                </div>
                <div class="form-group">
                    <label class="form-label" for="sshKeyPath">SSH Private Key</label>
                    <div class="form-row">
                        <input type="text" id="sshKeyPath" class="input-field flex-1" placeholder="/path/to/id_ed25519" autocomplete="off" />
                        <button id="btnBrowseSshKey" class="btn btn-secondary" type="button">Browse</button>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="sshKeyPassphrase">Key Passphrase</label>
                    <input type="password" id="sshKeyPassphrase" class="input-field" placeholder="leave empty if not required" autocomplete="off" />
                </div>
                <div class="form-group">
                    <label class="form-label" for="sshHostKeyFingerprint">SSH Host Fingerprint</label>
                    <input type="text" id="sshHostKeyFingerprint" class="input-field" placeholder="SHA256:..." autocomplete="off" />
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
            <div class="test-area">
                <div class="test-spinner" id="testSpinner"></div>
                <span class="test-result" id="testResult"></span>
            </div>
            <button id="btnTestConnection" class="btn btn-secondary" disabled>Test Connection</button>
            <span style="flex:1"></span>
            <button id="btnCancel" class="btn btn-secondary">Cancel</button>
            <button id="btnOk" class="btn" disabled>OK</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
