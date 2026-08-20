declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

document.getElementById('openInspectorBtn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'openInspector' });
});

document.getElementById('addConnectionBtn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'addConnection' });
});

export {};
