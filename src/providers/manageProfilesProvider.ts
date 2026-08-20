import * as vscode from 'vscode';
import { ConnectionProfile } from '../core/models/connectionProfile';
import { ConnectionService } from '../services/connectionService';
import { validateManageProfilesMessage } from '../core/security/webviewMessageValidator';

/**
 * Manages the Manage Profiles webview panel.
 * Provides drag-and-drop reordering of profiles grouped by environment.
 */
export class ManageProfilesProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _resolve: ((updated: boolean) => void) | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _connectionService: ConnectionService,
    ) {}

    /**
     * Opens the manage profiles dialog.
     * @returns true if profiles were reordered, false if canceled.
     */
    async openAsync(profiles: ConnectionProfile[]): Promise<boolean> {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Two);
            return false;
        }

        return new Promise<boolean>((resolve) => {
            this._resolve = resolve;

            this._panel = vscode.window.createWebviewPanel(
                'redisInspector.manageProfiles',
                'Manage Profiles',
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
                const validated = validateManageProfilesMessage(msg);
                if (!validated.ok) {
                    return;
                }
                switch (msg.type) {
                    case 'ready':
                        this._panel?.webview.postMessage({
                            type: 'loadProfiles',
                            payload: profiles.map(p => ({
                                id: p.id,
                                name: p.name,
                                environment: p.environment,
                                sortOrder: p.sortOrder,
                            })),
                        });
                        break;
                    case 'done':
                        await this._onDone(profiles, msg.payload.profiles);
                        break;
                }
            });

            this._panel.onDidDispose(() => {
                this._panel = undefined;
                if (this._resolve) {
                    this._resolve(false);
                    this._resolve = undefined;
                }
            });
        });
    }

    private async _onDone(
        originals: ConnectionProfile[],
        updates: Array<{ id: string; environment: number; sortOrder: number }>,
    ): Promise<void> {
        // Apply sortOrder and environment changes
        for (const update of updates) {
            const profile = originals.find(p => p.id === update.id);
            if (profile) {
                profile.environment = update.environment;
                profile.sortOrder = update.sortOrder;
                await this._connectionService.saveProfile(profile);
            }
        }
        this._close(true);
    }

    private _close(result: boolean): void {
        if (this._resolve) {
            this._resolve(result);
            this._resolve = undefined;
        }
        this._panel?.dispose();
        this._panel = undefined;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'manageProfiles.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'manageProfiles.css')
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
    <title>Manage Profiles</title>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-body">
            <div class="env-group">
                <div class="env-group-header">Dev</div>
                <div class="profile-list" id="devList"></div>
            </div>
            <div class="env-group">
                <div class="env-group-header env-test">Test</div>
                <div class="profile-list" id="testList"></div>
            </div>
            <div class="env-group">
                <div class="env-group-header env-prod">Prod</div>
                <div class="profile-list" id="prodList"></div>
            </div>
        </div>
        <p class="sr-only">Use Move up, Move down, and Environment controls to reorder profiles without drag and drop.</p>
        <div class="dialog-footer">
            <button id="btnDone" class="btn">Done</button>
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
