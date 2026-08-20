/**
 * Replay Dialog webview script.
 * Allows user to select a target server for replaying messages.
 */

interface VsCodeApi {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const profileSelect = document.getElementById('profileSelect') as HTMLSelectElement;
const showTest = document.getElementById('showTest') as HTMLInputElement;
const showProd = document.getElementById('showProd') as HTMLInputElement;
const btnSend = document.getElementById('btnSend') as HTMLButtonElement;
const btnCancel = document.getElementById('btnCancel') as HTMLButtonElement;

interface ProfileItem {
    id: string;
    name: string;
    environment: number; // 0=Dev, 1=Test, 2=Prod
    isCurrent: boolean;
}

let allProfiles: ProfileItem[] = [];

function refreshFilteredProfiles(): void {
    const showTestChecked = showTest.checked;
    const showProdChecked = showProd.checked;

    const filtered = allProfiles.filter(p => {
        if (p.environment === 0) { return true; } // Dev always visible
        if (p.environment === 1) { return showTestChecked; }
        if (p.environment === 2) { return showProdChecked; }
        return true;
    });

    // Sort: current first, then by environment, then alphabetically
    filtered.sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) { return -1; }
        if (!a.isCurrent && b.isCurrent) { return 1; }
        if (a.environment !== b.environment) { return a.environment - b.environment; }
        return a.name.localeCompare(b.name);
    });

    const prevValue = profileSelect.value;
    profileSelect.innerHTML = '';

    // Placeholder
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a server...';
    profileSelect.appendChild(placeholder);

    const envNames = ['Dev', 'Test', 'Prod'];
    for (const p of filtered) {
        const opt = document.createElement('option');
        opt.value = p.id;
        const prefix = p.isCurrent ? '\u2605 ' : '';
        const suffix = p.isCurrent ? ' (current)' : '';
        opt.textContent = `${prefix}[${envNames[p.environment] ?? 'Dev'}] ${p.name}${suffix}`;
        if (p.environment === 1) { opt.className = 'env-test'; }
        if (p.environment === 2) { opt.className = 'env-prod'; }
        profileSelect.appendChild(opt);
    }

    // Restore selection
    if (prevValue && profileSelect.querySelector(`option[value="${prevValue}"]`)) {
        profileSelect.value = prevValue;
    } else {
        profileSelect.value = '';
    }

    updateCanSend();
}

function updateCanSend(): void {
    btnSend.disabled = !profileSelect.value;
}

// Event listeners
showTest.addEventListener('change', refreshFilteredProfiles);
showProd.addEventListener('change', refreshFilteredProfiles);
profileSelect.addEventListener('change', updateCanSend);

btnCancel.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
});

btnSend.addEventListener('click', () => {
    const selectedId = profileSelect.value;
    if (selectedId) {
        vscode.postMessage({ type: 'send', payload: { profileId: selectedId } });
    }
});

// Incoming messages from extension
window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    switch (msg.type) {
        case 'loadProfiles': {
            allProfiles = msg.payload.profiles;
            (document.getElementById('dialogMessage') as HTMLElement).textContent = msg.payload.message;
            refreshFilteredProfiles();
            break;
        }
    }
});

// Signal ready
vscode.postMessage({ type: 'ready' });

export {};
