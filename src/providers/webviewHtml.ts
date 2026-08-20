export function buildMainPanelHtml(scriptUri: string, styleUri: string, cspSource: string, nonce: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Agmen Stream Inspector</title>
</head>
<body>
    <div id="app">
        <aside class="options-pane" id="optionsPane">
            <div id="streamSelectorStatus" class="status-text-small" aria-live="polite"></div>
            <div id="statusText" class="status-text" aria-live="polite"></div>
        </aside>
        <main class="content-area">
            <div class="split-container" id="splitContainer">
                <div class="results-panel" id="resultsPanel">
                    <div class="results-list" id="resultsList" role="listbox" aria-label="Search results"></div>
                </div>
                <div class="splitter" id="splitter" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize results and message panels"></div>
                <div class="viewer-panel" id="viewerPanel">
                    <pre id="rawMessage" class="raw-message"></pre>
                </div>
            </div>
        </main>
    </div>
    <div id="filterHelpModal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="filterHelpTitle" style="display:none;">
        <div class="modal-content">
            <h3 id="filterHelpTitle">Advanced Filters - Help</h3>
            <button id="filterHelpCloseBtn" class="btn btn-primary">Close</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function buildManageProfilesHtml(scriptUri: string, styleUri: string, cspSource: string, nonce: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Manage Profiles</title>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-body">
            <div id="devList" class="profile-list"></div>
            <div id="testList" class="profile-list"></div>
            <div id="prodList" class="profile-list"></div>
        </div>
        <div class="sr-only">Move up</div>
        <div class="sr-only">Move down</div>
        <div class="dialog-footer">
            <button id="btnDone" class="btn">Done</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function buildReplayDialogHtml(scriptUri: string, styleUri: string, cspSource: string, nonce: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Replay target</title>
</head>
<body>
    <div class="dialog-container">
        <p class="dialog-message" id="dialogMessage">Select the target server:</p>
        <p id="replayWarning">Replay writes to the selected Redis server immediately.</p>
        <select id="profileSelect" class="input-field" aria-describedby="replayWarning">
            <option value="">Choose a server...</option>
        </select>
        <div class="dialog-footer">
            <button id="btnCancel" class="btn btn-secondary">Cancel</button>
            <button id="btnSend" class="btn" disabled>Send</button>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function buildSidebarHtml(scriptUri: string, cspSource: string, nonce: string): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="8" ry="3"/>
            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
            <line x1="9" y1="10" x2="15" y2="10"/>
            <polyline points="13,8 15,10 13,12"/>
        </svg>
    </div>
    <h3>Agmen Stream Inspector</h3>
    <p class="subtitle">Search, monitor &amp; replay Redis Streams</p>

    <button class="primary" id="openInspectorBtn" type="button">Open Inspector</button>
    <button class="secondary" id="addConnectionBtn" type="button">Add Connection</button>

    <p class="shortcut"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> to open</p>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
