import * as vscode from 'vscode';
import { ConnectionProfile } from '../core/models/connectionProfile';
import { validateReplayDialogMessage } from '../core/security/webviewMessageValidator';

/**
 * Manages the Replay Dialog webview panel.
 * Lets user select a target server to replay messages to.
 * Resolves with the selected profile or undefined if canceled.
 */
export class ReplayDialogProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _resolve: ((profile: ConnectionProfile | undefined) => void) | undefined;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

    async openAsync(
        currentProfile: ConnectionProfile | undefined,
        allProfiles: ConnectionProfile[],
        messageCount: number,
    ): Promise<ConnectionProfile | undefined> {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Two);
            return undefined;
        }

        return new Promise<ConnectionProfile | undefined>((resolve) => {
            this._resolve = resolve;

            const title = messageCount === 1 ? 'Replay Message' : `Replay ${messageCount} Messages`;

            this._panel = vscode.window.createWebviewPanel(
                'redisInspector.replayDialog',
                title,
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

            const profileItems = allProfiles.map(p => ({
                id: p.id,
                name: p.name,
                environment: p.environment,
                isCurrent: p.id === currentProfile?.id,
            }));

            const message = messageCount === 1
                ? 'Select the target server to replay this message:'
                : `Select the target server to replay ${messageCount} messages:`;

            this._panel.webview.onDidReceiveMessage(async (msg) => {
                const validated = validateReplayDialogMessage(msg);
                if (!validated.ok) {
                    return;
                }
                switch (msg.type) {
                    case 'ready':
                        this._panel?.webview.postMessage({
                            type: 'loadProfiles',
                            payload: { profiles: profileItems, message },
                        });
                        break;
                    case 'send': {
                        const selected = allProfiles.find(p => p.id === msg.payload.profileId);
                        this._close(selected);
                        break;
                    }
                    case 'cancel':
                        this._close(undefined);
                        break;
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

    private _close(result: ConnectionProfile | undefined): void {
        if (this._resolve) {
            this._resolve(result);
            this._resolve = undefined;
        }
        this._panel?.dispose();
        this._panel = undefined;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'replayDialog.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'replayDialog.css')
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
    <title>Replay</title>
</head>
<body>
    <div class="dialog-container">
        <p class="dialog-message" id="dialogMessage">Select the target server:</p>
        <p id="replayWarning">Replay writes immediately to the selected Redis server.</p>
        <select id="profileSelect" class="input-field" aria-describedby="replayWarning">
            <option value="">Choose a server...</option>
        </select>
        <div class="checkbox-row">
            <label><input type="checkbox" id="showTest" /> Show Test profiles</label>
            <label><input type="checkbox" id="showProd" /> Show Prod profiles</label>
        </div>
        <div class="dialog-footer">
            <button id="btnCancel" class="btn btn-secondary">Cancel</button>
            <button id="btnSend" class="btn" disabled>Send</button>
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
