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

export function buildSidebarHtml(cspSource: string, nonce: string): string {
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
</style>
</head>
<body>
    <button class="primary" id="openInspectorBtn">Open Inspector</button>
    <button class="secondary" id="addConnectionBtn">Add Connection</button>
    <script nonce="${nonce}" src="sidebar.js"></script>
</body>
</html>`;
}
