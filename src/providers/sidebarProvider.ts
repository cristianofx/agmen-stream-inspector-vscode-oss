import * as vscode from 'vscode';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'redisInspector.welcome';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage((msg) => {
            if (msg.type === 'openInspector') {
                vscode.commands.executeCommand('redisInspector.open');
            } else if (msg.type === 'addConnection') {
                vscode.commands.executeCommand('redisInspector.addConnection');
            }
        });
    }

    private _getHtml(): string {
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body {
        padding: 12px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
    }
    .logo {
        text-align: center;
        margin-bottom: 16px;
    }
    .logo svg {
        width: 48px;
        height: 48px;
        stroke: var(--vscode-foreground);
        opacity: 0.7;
    }
    h3 {
        text-align: center;
        margin: 0 0 4px 0;
        font-weight: 600;
    }
    .subtitle {
        text-align: center;
        opacity: 0.7;
        font-size: 0.9em;
        margin-bottom: 20px;
    }
    button {
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 8px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 13px;
        font-family: var(--vscode-font-family);
    }
    .primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }
    .primary:hover {
        background: var(--vscode-button-hoverBackground);
    }
    .secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }
    .shortcut {
        text-align: center;
        margin-top: 16px;
        font-size: 0.85em;
        opacity: 0.6;
    }
    kbd {
        padding: 2px 6px;
        border-radius: 3px;
        background: var(--vscode-keybindingLabel-background);
        border: 1px solid var(--vscode-keybindingLabel-border);
        color: var(--vscode-keybindingLabel-foreground);
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
    }
</style>
</head>
<body>
    <div class="logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="8" ry="3"/>
            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
            <line x1="9" y1="10" x2="15" y2="10"/>
            <polyline points="13,8 15,10 13,12"/>
        </svg>
    </div>
    <h3>Agmen Stream Inspector</h3>
    <p class="subtitle">Search, monitor &amp; replay Redis Streams</p>

    <button class="primary" onclick="send('openInspector')">Open Inspector</button>
    <button class="secondary" onclick="send('addConnection')">Add Connection</button>

    <p class="shortcut"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> to open</p>

    <script>
        const vscode = acquireVsCodeApi();
        function send(type) { vscode.postMessage({ type }); }
    </script>
</body>
</html>`;
    }
}
