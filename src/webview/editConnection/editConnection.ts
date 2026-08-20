/**
 * Edit Connection webview script.
 * Runs in the browser context inside the webview panel.
 */
import { validateRedisUrl as validateRedisEndpoint } from '../../core/services/redisUrlValidator';

interface VsCodeApi {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// --- DOM References ---
const nameInput = document.getElementById('connName') as HTMLInputElement;
const envSelect = document.getElementById('connEnv') as HTMLSelectElement;
const redisUrlInput = document.getElementById('redisUrl') as HTMLInputElement;
const redisUrlError = document.getElementById('redisUrlError') as HTMLElement;
const redisUserInput = document.getElementById('redisUser') as HTMLInputElement;
const redisPassInput = document.getElementById('redisPass') as HTMLInputElement;
const sshHostInput = document.getElementById('sshHost') as HTMLInputElement;
const sshPortInput = document.getElementById('sshPort') as HTMLInputElement;
const sshUserInput = document.getElementById('sshUser') as HTMLInputElement;
const sshPassInput = document.getElementById('sshPass') as HTMLInputElement;
const sshKeyPathInput = document.getElementById('sshKeyPath') as HTMLInputElement;
const sshKeyPassphraseInput = document.getElementById('sshKeyPassphrase') as HTMLInputElement;
const sshHostKeyFingerprintInput = document.getElementById('sshHostKeyFingerprint') as HTMLInputElement;

const btnTestConnection = document.getElementById('btnTestConnection') as HTMLButtonElement;
const btnOk = document.getElementById('btnOk') as HTMLButtonElement;
const btnCancel = document.getElementById('btnCancel') as HTMLButtonElement;
const btnBrowseSshKey = document.getElementById('btnBrowseSshKey') as HTMLButtonElement;

const testSpinner = document.getElementById('testSpinner') as HTMLElement;
const testResult = document.getElementById('testResult') as HTMLElement;

const redisAuthHeader = document.getElementById('redisAuthHeader') as HTMLElement;
const redisAuthContent = document.getElementById('redisAuthContent') as HTMLElement;
const redisAuthChevron = document.getElementById('redisAuthChevron') as HTMLElement;

const sshHeader = document.getElementById('sshHeader') as HTMLElement;
const sshContent = document.getElementById('sshContent') as HTMLElement;
const sshChevron = document.getElementById('sshChevron') as HTMLElement;

let profileId = '';
let isTesting = false;

// --- Collapsible Sections ---
function toggleSection(content: HTMLElement, chevron: HTMLElement): void {
    const isOpen = content.classList.contains('open');
    if (isOpen) {
        content.classList.remove('open');
        chevron.classList.remove('open');
    } else {
        content.classList.add('open');
        chevron.classList.add('open');
    }
}

redisAuthHeader.addEventListener('click', () => toggleSection(redisAuthContent, redisAuthChevron));
sshHeader.addEventListener('click', () => toggleSection(sshContent, sshChevron));

let isRedisUrlValid = false;

function updateValidation(): void {
    const result = validateRedisEndpoint(redisUrlInput.value);
    isRedisUrlValid = result.valid;

    if (result.valid) {
        redisUrlError.textContent = '';
        redisUrlInput.classList.remove('error');
    } else {
        redisUrlError.textContent = result.errorMessage || 'Invalid Redis URL.';
        redisUrlInput.classList.add('error');
    }

    updateCanAccept();
}

function updateCanAccept(): void {
    const nameOk = (nameInput.value || '').trim().length > 0;
    btnOk.disabled = !(nameOk && isRedisUrlValid);
    btnTestConnection.disabled = !isRedisUrlValid || isTesting;
}

// --- Event Listeners ---
nameInput.addEventListener('input', updateCanAccept);
redisUrlInput.addEventListener('input', updateValidation);

btnCancel.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
});

btnBrowseSshKey.addEventListener('click', () => {
    vscode.postMessage({ type: 'browseSshKey' });
});

btnOk.addEventListener('click', () => {
    const profile = {
        id: profileId,
        name: nameInput.value.trim(),
        redisUrl: redisUrlInput.value.trim(),
        redisUser: redisUserInput.value.trim(),
        redisPass: redisPassInput.value,
        sshHost: sshHostInput.value.trim(),
        sshPort: parseInt(sshPortInput.value, 10) || 22,
        sshUser: sshUserInput.value.trim(),
        sshPass: sshPassInput.value,
        sshKeyPath: sshKeyPathInput.value.trim(),
        sshKeyPassphrase: sshKeyPassphraseInput.value,
        sshHostKeyFingerprint: sshHostKeyFingerprintInput.value.trim(),
        environment: parseInt(envSelect.value, 10),
        sortOrder: 0,
    };
    vscode.postMessage({ type: 'save', payload: profile });
});

btnTestConnection.addEventListener('click', () => {
    if (!isRedisUrlValid || isTesting) { return; }
    vscode.postMessage({
        type: 'testConnection',
        payload: {
            id: profileId,
            redisUrl: redisUrlInput.value.trim(),
            redisUser: redisUserInput.value.trim(),
            redisPass: redisPassInput.value,
            sshHost: sshHostInput.value.trim(),
            sshPort: parseInt(sshPortInput.value, 10) || 22,
            sshUser: sshUserInput.value.trim(),
            sshPass: sshPassInput.value,
            sshKeyPath: sshKeyPathInput.value.trim(),
            sshKeyPassphrase: sshKeyPassphraseInput.value,
            sshHostKeyFingerprint: sshHostKeyFingerprintInput.value.trim(),
        },
    });
});

// --- Incoming Messages from Extension ---
window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data;
    switch (msg.type) {
        case 'loadProfile': {
            const p = msg.payload;
            profileId = p.id;
            nameInput.value = p.name || '';
            envSelect.value = String(p.environment ?? 0);
            redisUrlInput.value = p.redisUrl || '';
            redisUserInput.value = p.redisUser || '';
            redisPassInput.value = p.redisPass || '';
            sshHostInput.value = p.sshHost || '';
            sshPortInput.value = String(p.sshPort || 22);
            sshUserInput.value = p.sshUser || '';
            sshPassInput.value = p.sshPass || '';
            sshKeyPathInput.value = p.sshKeyPath || '';
            sshKeyPassphraseInput.value = p.sshKeyPassphrase || '';
            sshHostKeyFingerprintInput.value = p.sshHostKeyFingerprint || '';

            // Auto-expand sections if they have data
            if (p.redisUser || p.redisPass) {
                redisAuthContent.classList.add('open');
                redisAuthChevron.classList.add('open');
            }
            if (p.sshHost || p.sshKeyPath || p.sshHostKeyFingerprint) {
                sshContent.classList.add('open');
                sshChevron.classList.add('open');
            }

            updateValidation();
            nameInput.focus();
            break;
        }
        case 'testResult': {
            isTesting = false;
            testSpinner.classList.remove('visible');
            testResult.textContent = msg.payload.message;
            testResult.className = 'test-result ' + (msg.payload.success ? 'success' : 'error');
            updateCanAccept();
            break;
        }
        case 'testStarted': {
            isTesting = true;
            testSpinner.classList.add('visible');
            testResult.textContent = '';
            testResult.className = 'test-result';
            updateCanAccept();
            break;
        }
        case 'sshKeySelected':
            sshKeyPathInput.value = msg.payload.path || '';
            break;
        case 'sshFingerprintLearned':
            sshHostKeyFingerprintInput.value = msg.payload.fingerprint || '';
            break;
    }
});

// Signal ready
vscode.postMessage({ type: 'ready' });

export {};
