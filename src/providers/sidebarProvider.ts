import * as vscode from 'vscode';
import { validateSidebarMessage } from '../core/security/webviewMessageValidator';
import { buildSidebarHtml } from './webviewHtml';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'redisInspector.welcome';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const nonce = getNonce();
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview, nonce);

        webviewView.webview.onDidReceiveMessage((msg) => {
            const validated = validateSidebarMessage(msg);
            if (!validated.ok) {
                return;
            }
            if (msg.type === 'openInspector') {
                vscode.commands.executeCommand('redisInspector.open');
            } else if (msg.type === 'addConnection') {
                vscode.commands.executeCommand('redisInspector.addConnection');
            }
        });
    }

    private _getHtml(webview: vscode.Webview, nonce: string): string {
        const html = buildSidebarHtml(webview.cspSource, nonce);
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sidebar.js')
        ).toString();
        return html.replace('sidebar.js', scriptUri);
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
