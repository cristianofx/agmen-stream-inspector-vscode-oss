// Acquire the VS Code API
const vscode = acquireVsCodeApi();

// --- State ---
let selectedResultIndex = -1;
let resultCount = 0;

// --- DOM References ---
const connectionSelect = document.getElementById('connectionSelect') as HTMLSelectElement;
const streamList = document.getElementById('streamList') as HTMLDivElement;
const streamFilter = document.getElementById('streamFilter') as HTMLInputElement;
const resultsList = document.getElementById('resultsList') as HTMLDivElement;
const rawMessage = document.getElementById('rawMessage') as HTMLPreElement;
const statusText = document.getElementById('statusText') as HTMLDivElement;
const summaryText = document.getElementById('summaryText') as HTMLSpanElement;
const findBar = document.getElementById('findBar') as HTMLDivElement;
const findInput = document.getElementById('findInput') as HTMLInputElement;
const findStatus = document.getElementById('findStatus') as HTMLSpanElement;
const optionsPane = document.getElementById('optionsPane') as HTMLElement;
const resultsPanel = document.getElementById('resultsPanel') as HTMLDivElement;
const viewerPanel = document.getElementById('viewerPanel') as HTMLDivElement;
const splitter = document.getElementById('splitter') as HTMLDivElement;

// --- Button bindings ---
function bindClick(id: string, handler: () => void) {
    document.getElementById(id)?.addEventListener('click', handler);
}

bindClick('btnAddConn', () => vscode.postMessage({ type: 'addConnection' }));
bindClick('btnEditConn', () => {
    const profileId = connectionSelect.value;
    if (profileId) { vscode.postMessage({ type: 'editConnection', payload: { profileId } }); }
});
bindClick('btnDeleteConn', () => {
    const profileId = connectionSelect.value;
    if (profileId) { vscode.postMessage({ type: 'deleteConnection', payload: { profileId } }); }
});
bindClick('btnManageProfiles', () => vscode.postMessage({ type: 'manageProfiles' }));

bindClick('btnFetchStreams', () => {
    const profileId = connectionSelect.value;
    if (profileId) { vscode.postMessage({ type: 'fetchStreams', payload: { profileId } }); }
});
bindClick('btnSelectAll', () => selectAllStreams(true));
bindClick('btnDeselectAll', () => selectAllStreams(false));

bindClick('btnSearch', () => sendSearchCommand('startSearch'));
bindClick('btnWatch', () => sendSearchCommand('startWatch'));
bindClick('btnCancel', () => vscode.postMessage({ type: 'cancel' }));

bindClick('btnExportJson', () => vscode.postMessage({ type: 'exportJson' }));
bindClick('btnExportCsv', () => vscode.postMessage({ type: 'exportCsv' }));

bindClick('btnReplay', () => {
    if (selectedResultIndex >= 0) {
        vscode.postMessage({ type: 'replay', payload: { hitIndices: [selectedResultIndex] } });
    }
});
bindClick('btnReplayAll', () => vscode.postMessage({ type: 'replayAll' }));

bindClick('btnToggleOptions', () => {
    optionsPane.classList.toggle('collapsed');
});

// Find bar
bindClick('btnFindNext', () => findInMessage(1));
bindClick('btnFindPrev', () => findInMessage(-1));
bindClick('btnFindClose', () => { findBar.style.display = 'none'; });

connectionSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'selectConnection', payload: { profileId: connectionSelect.value } });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        findBar.style.display = 'flex';
        findInput.focus();
    }
    if (e.key === 'F3') {
        e.preventDefault();
        findInMessage(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape' && findBar.style.display !== 'none') {
        findBar.style.display = 'none';
    }
});

findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        findInMessage(e.shiftKey ? -1 : 1);
    }
});

// --- Resizable splitter ---
(function initSplitter() {
    let isDragging = false;
    let startY = 0;
    let startTopHeight = 0;

    splitter.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        startY = e.clientY;
        startTopHeight = resultsPanel.getBoundingClientRect().height;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) { return; }
        const delta = e.clientY - startY;
        const newHeight = Math.max(60, startTopHeight + delta);
        const containerHeight = resultsPanel.parentElement!.getBoundingClientRect().height - splitter.offsetHeight;
        const clampedHeight = Math.min(newHeight, containerHeight - 60);
        resultsPanel.style.flex = 'none';
        resultsPanel.style.height = `${clampedHeight}px`;
        viewerPanel.style.flex = '1';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
})();

// --- Stream filter ---
streamFilter.addEventListener('input', () => {
    const filterValue = streamFilter.value.toLowerCase();
    const items = streamList.querySelectorAll('.stream-item');
    items.forEach((item) => {
        const name = item.getAttribute('data-name')?.toLowerCase() ?? '';
        (item as HTMLElement).style.display = name.includes(filterValue) ? '' : 'none';
    });
});

// --- Functions ---

function selectAllStreams(selected: boolean) {
    const checkboxes = streamList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = selected; });
}

function getSelectedStreams(): string[] {
    const streams: string[] = [];
    const checkboxes = streamList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        const name = cb.getAttribute('data-stream');
        if (name) { streams.push(name); }
    });
    return streams;
}

// --- Conditional Filter Functions ---

let conditionIdCounter = 0;
let groupIdCounter = 0;

// Toggle advanced filters section
const useAdvancedFiltersCheckbox = document.getElementById('useAdvancedFilters') as HTMLInputElement;
const advancedFiltersSection = document.getElementById('advancedFiltersSection') as HTMLDivElement;

if (useAdvancedFiltersCheckbox) {
    useAdvancedFiltersCheckbox.addEventListener('change', () => {
        if (advancedFiltersSection) {
            advancedFiltersSection.style.display = useAdvancedFiltersCheckbox.checked ? 'block' : 'none';
        }
    });
}

// Filter help modal
const filterHelpModal = document.getElementById('filterHelpModal') as HTMLDivElement;
const filterHelpBtn = document.getElementById('filterHelpBtn') as HTMLButtonElement;
const filterHelpCloseBtn = document.getElementById('filterHelpCloseBtn') as HTMLButtonElement;

if (filterHelpBtn && filterHelpModal) {
    filterHelpBtn.addEventListener('click', () => {
        filterHelpModal.style.display = 'flex';
    });
}
if (filterHelpCloseBtn && filterHelpModal) {
    filterHelpCloseBtn.addEventListener('click', () => {
        filterHelpModal.style.display = 'none';
    });
}
if (filterHelpModal) {
    filterHelpModal.addEventListener('click', (e) => {
        if (e.target === filterHelpModal) {
            filterHelpModal.style.display = 'none';
        }
    });
}

// Add condition to root or nested group
function addCondition(parentId: string) {
    const id = `condition-${conditionIdCounter++}`;
    const container = parentId === 'root'
        ? document.getElementById('conditionsList')
        : document.getElementById(`${parentId}-conditions`);

    if (!container) { return; }

    const div = document.createElement('div');
    div.id = id;
    div.className = 'condition-row';
    div.style.cssText = 'margin-bottom: 8px; padding: 6px; border: 1px solid #444; border-radius: 3px; background: rgba(255,255,255,0.03);';

    div.innerHTML = `
        <div style="margin-bottom: 4px;">
            <input type="text" placeholder="field name" class="cond-field input-field" style="width: 100%; box-sizing: border-box;" />
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
            <select class="cond-operator input-field" style="flex: 1; min-width: 0;">
                <option value="Equals">Equals</option>
                <option value="NotEquals">Not Equals</option>
                <option value="Contains">Contains</option>
                <option value="Exists">Exists</option>
            </select>
            <button class="remove-btn btn btn-small" style="flex-shrink: 0;">✕</button>
        </div>
        <div style="margin-top: 4px;">
            <input type="text" placeholder="value" class="cond-value input-field" style="width: 100%; box-sizing: border-box;" />
        </div>
    `;

    const removeBtn = div.querySelector('.remove-btn') as HTMLButtonElement;
    removeBtn.addEventListener('click', () => {
        div.remove();
    });

    container.appendChild(div);
}

// Add nested group
function addNestedGroup() {
    const id = `group-${groupIdCounter++}`;
    const container = document.getElementById('nestedGroupsList');

    if (!container) { return; }

    const div = document.createElement('div');
    div.id = id;
    div.className = 'nested-group';
    div.style.cssText = 'border: 2px solid #ff9800; padding: 8px; margin: 8px 0; border-radius: 4px; background: rgba(255, 152, 0, 0.05);';

    div.innerHTML = `
        <div style="margin-bottom: 8px;">
            <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 4px;">
                <strong style="font-size: 0.9em;">Group:</strong>
                <select class="group-operator input-field" style="flex: 1; min-width: 0;">
                    <option value="And">AND</option>
                    <option value="Or">OR</option>
                </select>
            </div>
            <button class="remove-group-btn btn btn-small" style="width: 100%;">✕ Remove Group</button>
        </div>
        <div id="${id}-conditions" style="margin-bottom: 8px;"></div>
        <button class="add-group-condition-btn btn btn-small" style="width: 100%;">+ Add Condition</button>
    `;

    const removeGroupBtn = div.querySelector('.remove-group-btn') as HTMLButtonElement;
    removeGroupBtn.addEventListener('click', () => {
        div.remove();
    });

    const addGroupConditionBtn = div.querySelector('.add-group-condition-btn') as HTMLButtonElement;
    addGroupConditionBtn.addEventListener('click', () => {
        addCondition(id);
    });

    container.appendChild(div);
}

// Build conditional filter from form
function buildConditionalFilter(): any | undefined {
    const useAdvanced = useAdvancedFiltersCheckbox?.checked;
    if (!useAdvanced) { return undefined; }

    const rootOperatorSelect = document.getElementById('rootOperator') as HTMLSelectElement;
    const rootOperator = rootOperatorSelect?.value || 'And';

    const conditions = collectConditions('conditionsList');
    const nestedGroups = collectNestedGroups();

    if (conditions.length === 0 && nestedGroups.length === 0) {
        return undefined;
    }

    return {
        operator: rootOperator,
        conditions,
        nestedGroups
    };
}

// Collect conditions from a container
function collectConditions(containerId: string): Array<{ fieldName: string; operator: string; value: string }> {
    const container = document.getElementById(containerId);
    if (!container) { return []; }

    const conditions: Array<{ fieldName: string; operator: string; value: string }> = [];
    const conditionRows = container.querySelectorAll('.condition-row');

    conditionRows.forEach(row => {
        const fieldInput = row.querySelector('.cond-field') as HTMLInputElement;
        const operatorSelect = row.querySelector('.cond-operator') as HTMLSelectElement;
        const valueInput = row.querySelector('.cond-value') as HTMLInputElement;

        if (fieldInput && operatorSelect) {
            const fieldName = fieldInput.value.trim();
            if (fieldName) {
                conditions.push({
                    fieldName,
                    operator: operatorSelect.value,
                    value: valueInput?.value || ''
                });
            }
        }
    });

    return conditions;
}

// Collect nested groups
function collectNestedGroups(): Array<{ operator: string; conditions: any[] }> {
    const container = document.getElementById('nestedGroupsList');
    if (!container) { return []; }

    const groups: Array<{ operator: string; conditions: any[] }> = [];
    const groupDivs = container.querySelectorAll('.nested-group');

    groupDivs.forEach(groupDiv => {
        const operatorSelect = groupDiv.querySelector('.group-operator') as HTMLSelectElement;
        const groupId = groupDiv.id;
        const conditions = collectConditions(`${groupId}-conditions`);

        if (conditions.length > 0) {
            groups.push({
                operator: operatorSelect?.value || 'And',
                conditions
            });
        }
    });

    return groups;
}

// Bind buttons for conditional filters
const addConditionBtn = document.getElementById('addConditionBtn');
const addGroupBtn = document.getElementById('addGroupBtn');

if (addConditionBtn) {
    addConditionBtn.addEventListener('click', () => addCondition('root'));
}

if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => addNestedGroup());
}

function sendSearchCommand(type: 'startSearch' | 'startWatch') {
    const streams = getSelectedStreams();
    const findField = (document.getElementById('findField') as HTMLInputElement).value;
    const findEq = (document.getElementById('findEq') as HTMLInputElement).value;
    const jsonField = (document.getElementById('jsonField') as HTMLInputElement).value;
    const findLastEl = document.getElementById('findLast') as HTMLInputElement;
    const findMaxEl = document.getElementById('findMax') as HTMLInputElement;
    const newestFirst = (document.getElementById('newestFirst') as HTMLInputElement).checked;
    const caseInsensitive = (document.getElementById('caseInsensitive') as HTMLInputElement).checked;

    const useAdvancedFilters = useAdvancedFiltersCheckbox?.checked || false;
    const conditionalFilter = buildConditionalFilter();

    vscode.postMessage({
        type,
        payload: {
            streams,
            findField,
            findEq,
            jsonField,
            findLast: findLastEl.value ? parseInt(findLastEl.value, 10) : undefined,
            findMax: findMaxEl.value ? parseInt(findMaxEl.value, 10) : undefined,
            newestFirst,
            caseInsensitive,
            useAdvancedFilters,
            conditionalFilter,
        },
    });
}

function findInMessage(_direction: number) {
    const query = findInput.value;
    if (!query) { return; }
    const found = (window as unknown as WindowWithFind).find(
        query,
        (document.getElementById('findMatchCase') as HTMLInputElement).checked,
        _direction < 0,
        true,
        (document.getElementById('findWholeWord') as HTMLInputElement).checked
    );
    findStatus.textContent = found ? '' : 'No matches';
}

function renderProfiles(profiles: Array<{ id: string; name: string; environment: number }>) {
    const prevSelected = connectionSelect.value;
    connectionSelect.innerHTML = '';
    const envNames = ['Dev', 'Test', 'Prod'];
    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `[${envNames[p.environment] ?? 'Dev'}] ${p.name}`;
        connectionSelect.appendChild(opt);
    }
    // Restore selection
    if (prevSelected && connectionSelect.querySelector(`option[value="${prevSelected}"]`)) {
        connectionSelect.value = prevSelected;
    }
}

function renderStreams(streams: string[]) {
    streamList.innerHTML = '';
    for (const name of streams) {
        const div = document.createElement('div');
        div.className = 'stream-item';
        div.setAttribute('data-name', name);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-stream', name);
        checkbox.checked = false;
        const label = document.createElement('span');
        label.textContent = name;
        div.appendChild(checkbox);
        div.appendChild(label);
        streamList.appendChild(div);
    }
}

function addResult(hit: { stream: string; id: string; idDateTimeFormatted?: string; rawMessage?: string }) {
    const div = document.createElement('div');
    div.className = 'result-item';
    const idx = resultCount++;
    div.setAttribute('data-index', String(idx));
    div.innerHTML = `<span class="result-stream">${escapeHtml(hit.stream)}</span>
        <span class="result-id">${escapeHtml(hit.idDateTimeFormatted ?? hit.id)}</span>`;
    div.addEventListener('click', () => {
        resultsList.querySelector('.result-item.selected')?.classList.remove('selected');
        div.classList.add('selected');
        selectedResultIndex = idx;
        vscode.postMessage({ type: 'selectResult', payload: { index: idx } });
    });
    resultsList.appendChild(div);
    summaryText.textContent = `${resultCount} results`;
}

function clearResults() {
    resultsList.innerHTML = '';
    rawMessage.textContent = '';
    selectedResultIndex = -1;
    resultCount = 0;
    summaryText.textContent = '';
}

function setSearchButtons(searching: boolean) {
    (document.getElementById('btnCancel') as HTMLButtonElement).disabled = !searching;
    (document.getElementById('btnSearch') as HTMLButtonElement).disabled = searching;
    (document.getElementById('btnWatch') as HTMLButtonElement).disabled = searching;
    (document.getElementById('btnReplay') as HTMLButtonElement).disabled = searching;
    (document.getElementById('btnReplayAll') as HTMLButtonElement).disabled = searching;
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Message handler from extension host ---
window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'stateUpdate':
            renderProfiles(msg.payload.profiles);
            clearResults();
            for (const hit of msg.payload.results) {
                addResult(hit);
            }
            break;

        case 'connectionProfiles':
            renderProfiles(msg.payload);
            break;

        case 'selectProfileAfterSave':
            connectionSelect.value = msg.payload.profileId;
            break;

        case 'streamsDiscovered':
            renderStreams(msg.payload);
            break;

        case 'searchResult':
            addResult(msg.payload);
            break;

        case 'searchComplete':
            statusText.textContent = `Done. ${msg.payload.count} results in ${(msg.payload.elapsedMs / 1000).toFixed(1)}s`;
            statusText.className = 'status-text status-done';
            setSearchButtons(false);
            break;

        case 'statusUpdate':
            statusText.textContent = msg.payload.status;
            statusText.className = `status-text status-${msg.payload.statusType}`;
            if (msg.payload.statusType === 'searching' || msg.payload.statusType === 'watching') {
                clearResults();
                setSearchButtons(true);
            } else if (msg.payload.statusType === 'connecting') {
                setSearchButtons(true);
            } else if (msg.payload.statusType === 'canceled' || msg.payload.statusType === 'error' || msg.payload.statusType === 'done' || msg.payload.statusType === 'noMatches') {
                setSearchButtons(false);
            }
            break;

        case 'resultSelected':
            rawMessage.textContent = msg.payload.formattedMessage;
            break;

        case 'error':
            statusText.textContent = msg.payload.message;
            statusText.className = 'status-text status-error';
            setSearchButtons(false);
            break;
    }
});

// Signal ready
vscode.postMessage({ type: 'ready' });

// Type declaration for VS Code webview API
declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

// Type declaration for window.find (non-standard but widely supported)
interface WindowWithFind extends Window {
    find(
        searchString: string,
        caseSensitive?: boolean,
        backwards?: boolean,
        wrapAround?: boolean,
        wholeWord?: boolean,
        searchInFrames?: boolean,
        showDialog?: boolean
    ): boolean;
}
