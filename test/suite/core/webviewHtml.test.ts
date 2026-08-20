import * as assert from 'assert';
import {
    buildMainPanelHtml,
    buildManageProfilesHtml,
    buildReplayDialogHtml,
    buildSidebarHtml,
} from '../../../src/providers/webviewHtml';

describe('webview html', () => {
    const resource = 'vscode-resource:/test.js';

    it('applies CSP and removes inline script from the sidebar view', () => {
        const html = buildSidebarHtml(resource, 'vscode-resource:/root', 'abc123');
        assert.ok(html.includes('Content-Security-Policy'));
        assert.ok(html.includes('script-src \'nonce-abc123\''));
        assert.ok(!html.includes('onclick='));
        assert.ok(html.includes(`src="${resource}"`));
    });

    it('marks the help modal as a dialog and statuses as live regions', () => {
        const html = buildMainPanelHtml(resource, resource, 'vscode-resource:/root', 'abc123');
        assert.ok(html.includes('role="dialog"'));
        assert.ok(html.includes('aria-modal="true"'));
        assert.ok(html.includes('aria-live="polite"'));
    });

    it('renders accessible manage-profiles controls', () => {
        const html = buildManageProfilesHtml(resource, resource, 'vscode-resource:/root', 'abc123');
        assert.ok(html.includes('Move up'));
        assert.ok(html.includes('Move down'));
    });

    it('renders replay safety guidance', () => {
        const html = buildReplayDialogHtml(resource, resource, 'vscode-resource:/root', 'abc123');
        assert.ok(html.includes('Replay target'));
        assert.ok(html.includes('aria-describedby="replayWarning"'));
    });
});
