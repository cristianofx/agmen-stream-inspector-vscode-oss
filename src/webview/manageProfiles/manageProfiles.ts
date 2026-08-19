/**
 * Manage Profiles webview script.
 * Supports drag-and-drop reordering of profiles within environment groups.
 */

interface VsCodeApi {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

interface ProfileData {
    id: string;
    name: string;
    environment: number; // 0=Dev, 1=Test, 2=Prod
    sortOrder: number;
}

let profiles: ProfileData[] = [];

const devList = document.getElementById('devList') as HTMLDivElement;
const testList = document.getElementById('testList') as HTMLDivElement;
const prodList = document.getElementById('prodList') as HTMLDivElement;
const btnDone = document.getElementById('btnDone') as HTMLButtonElement;

btnDone.addEventListener('click', () => {
    vscode.postMessage({ type: 'done', payload: { profiles } });
});

function getListForEnv(env: number): HTMLDivElement {
    switch (env) {
        case 1: return testList;
        case 2: return prodList;
        default: return devList;
    }
}

function renderProfiles(): void {
    devList.innerHTML = '';
    testList.innerHTML = '';
    prodList.innerHTML = '';

    // Group by environment and sort by sortOrder
    const grouped: Record<number, ProfileData[]> = { 0: [], 1: [], 2: [] };
    for (const p of profiles) {
        const env = p.environment ?? 0;
        if (!grouped[env]) { grouped[env] = []; }
        grouped[env].push(p);
    }

    for (const env of [0, 1, 2]) {
        const list = getListForEnv(env);
        const items = grouped[env].sort((a, b) => a.sortOrder - b.sortOrder);

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No profiles';
            list.appendChild(empty);
            continue;
        }

        for (const p of items) {
            const div = document.createElement('div');
            div.className = 'profile-item';
            div.setAttribute('draggable', 'true');
            div.setAttribute('data-id', p.id);
            div.innerHTML = `<span class="drag-handle">&#9776;</span><span class="profile-name">${escapeHtml(p.name)}</span>`;

            // Drag events
            div.addEventListener('dragstart', (e) => {
                div.classList.add('dragging');
                e.dataTransfer!.effectAllowed = 'move';
                e.dataTransfer!.setData('text/plain', p.id);
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
                clearDropIndicators();
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer!.dropEffect = 'move';
                const rect = div.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                // Show a visual cue
                div.style.borderTop = e.clientY < midY ? '2px solid var(--vscode-focusBorder, #007fd4)' : '';
                div.style.borderBottom = e.clientY >= midY ? '2px solid var(--vscode-focusBorder, #007fd4)' : '';
            });

            div.addEventListener('dragleave', () => {
                div.style.borderTop = '';
                div.style.borderBottom = '';
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.style.borderTop = '';
                div.style.borderBottom = '';

                const draggedId = e.dataTransfer!.getData('text/plain');
                if (draggedId === p.id) { return; }

                const rect = div.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const insertBefore = e.clientY < midY;

                reorderProfile(draggedId, p.id, insertBefore, p.environment);
            });

            list.appendChild(div);
        }
    }
}

function reorderProfile(draggedId: string, targetId: string, insertBefore: boolean, targetEnv: number): void {
    const draggedIdx = profiles.findIndex(p => p.id === draggedId);
    if (draggedIdx < 0) { return; }

    // Move profile to target environment if different
    profiles[draggedIdx].environment = targetEnv;

    // Get profiles in this environment group
    const envProfiles = profiles.filter(p => p.environment === targetEnv);
    const targetIdx = envProfiles.findIndex(p => p.id === targetId);
    if (targetIdx < 0) { return; }

    // Remove dragged from env list
    const envWithoutDragged = envProfiles.filter(p => p.id !== draggedId);
    const adjustedTargetIdx = envWithoutDragged.findIndex(p => p.id === targetId);

    // Insert at correct position
    const insertIdx = insertBefore ? adjustedTargetIdx : adjustedTargetIdx + 1;
    envWithoutDragged.splice(insertIdx, 0, profiles[draggedIdx]);

    // Update sortOrder
    envWithoutDragged.forEach((p, i) => { p.sortOrder = i; });

    renderProfiles();
}

function clearDropIndicators(): void {
    document.querySelectorAll('.profile-item').forEach(el => {
        (el as HTMLElement).style.borderTop = '';
        (el as HTMLElement).style.borderBottom = '';
    });
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Incoming messages
window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    switch (msg.type) {
        case 'loadProfiles':
            profiles = msg.payload;
            renderProfiles();
            break;
    }
});

// Signal ready
vscode.postMessage({ type: 'ready' });
