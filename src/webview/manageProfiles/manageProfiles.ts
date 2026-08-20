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
            div.innerHTML = `<span class="drag-handle" aria-hidden="true">&#9776;</span>
                <span class="profile-name">${escapeHtml(p.name)}</span>
                <div class="profile-actions">
                    <button type="button" class="move-up-btn btn btn-small" aria-label="Move up ${escapeHtml(p.name)}">Move up</button>
                    <button type="button" class="move-down-btn btn btn-small" aria-label="Move down ${escapeHtml(p.name)}">Move down</button>
                    <select class="env-select input-field" aria-label="Move ${escapeHtml(p.name)} to environment">
                        <option value="0"${p.environment === 0 ? ' selected' : ''}>Dev</option>
                        <option value="1"${p.environment === 1 ? ' selected' : ''}>Test</option>
                        <option value="2"${p.environment === 2 ? ' selected' : ''}>Prod</option>
                    </select>
                </div>`;

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

            (div.querySelector('.move-up-btn') as HTMLButtonElement).addEventListener('click', () => {
                moveProfileWithinEnvironment(p.id, -1);
            });
            (div.querySelector('.move-down-btn') as HTMLButtonElement).addEventListener('click', () => {
                moveProfileWithinEnvironment(p.id, 1);
            });
            (div.querySelector('.env-select') as HTMLSelectElement).addEventListener('change', (event) => {
                const target = event.target as HTMLSelectElement;
                moveProfileToEnvironment(p.id, parseInt(target.value, 10));
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

function moveProfileWithinEnvironment(profileId: string, direction: -1 | 1): void {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) { return; }

    const envProfiles = profiles
        .filter((candidate) => candidate.environment === profile.environment)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = envProfiles.findIndex((candidate) => candidate.id === profileId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= envProfiles.length) { return; }

    const [moved] = envProfiles.splice(index, 1);
    envProfiles.splice(targetIndex, 0, moved);
    envProfiles.forEach((candidate, order) => {
        candidate.sortOrder = order;
    });
    renderProfiles();
}

function moveProfileToEnvironment(profileId: string, environment: number): void {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) { return; }

    profile.environment = environment;
    const envProfiles = profiles
        .filter((candidate) => candidate.environment === environment && candidate.id !== profileId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    envProfiles.push(profile);
    envProfiles.forEach((candidate, order) => {
        candidate.sortOrder = order;
    });
    renderProfiles();
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

export {};
