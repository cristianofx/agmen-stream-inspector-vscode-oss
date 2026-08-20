import * as assert from 'assert';
import {
    validateEditConnectionMessage,
    validateMainPanelMessage,
    validateManageProfilesMessage,
    validateReplayDialogMessage,
    validateSidebarMessage,
} from '../../../src/core/security/webviewMessageValidator';

describe('webview message validation', () => {
    it('rejects malformed main panel messages', () => {
        const result = validateMainPanelMessage({ type: 'startSearch', payload: { streams: 'not-an-array' } });
        assert.strictEqual(result.ok, false);
    });

    it('accepts bounded main panel search messages', () => {
        const result = validateMainPanelMessage({
            type: 'startSearch',
            payload: {
                streams: ['orders'],
                findField: 'status',
                findEq: 'open',
                jsonField: 'message',
                newestFirst: false,
                caseInsensitive: false,
            },
        });
        assert.strictEqual(result.ok, true);
    });

    it('rejects replay payloads with negative or non-integer indices', () => {
        const result = validateMainPanelMessage({
            type: 'replay',
            payload: { hitIndices: [0, -1, 1.5] },
        });
        assert.strictEqual(result.ok, false);
    });

    it('rejects conditional filters that exceed nesting limits', () => {
        const result = validateMainPanelMessage({
            type: 'startWatch',
            payload: {
                streams: ['orders'],
                findField: '',
                findEq: '',
                jsonField: 'message',
                newestFirst: false,
                caseInsensitive: false,
                conditionalFilter: {
                    operator: 'And',
                    conditions: [],
                    nestedGroups: [{
                        operator: 'And',
                        conditions: [],
                        nestedGroups: [{
                            operator: 'And',
                            conditions: [],
                            nestedGroups: [{
                                operator: 'And',
                                conditions: [],
                                nestedGroups: [{
                                    operator: 'And',
                                    conditions: [],
                                }],
                            }],
                        }],
                    }],
                },
            },
        });
        assert.strictEqual(result.ok, false);
    });

    it('rejects edit-connection test payloads with invalid SSH port', () => {
        const result = validateEditConnectionMessage({
            type: 'testConnection',
            payload: {
                redisUrl: 'redis://localhost:6379',
                redisUser: '',
                redisPass: '',
                sshHost: 'host',
                sshPort: 70000,
                sshUser: 'user',
                sshPass: '',
                sshKeyPath: '',
                sshKeyPassphrase: '',
                sshHostKeyFingerprint: '',
            },
        });
        assert.strictEqual(result.ok, false);
    });

    it('rejects SSH passphrases when no private key path is provided', () => {
        const result = validateEditConnectionMessage({
            type: 'save',
            payload: {
                redisUrl: 'redis://localhost:6379',
                sshHost: 'host',
                sshPort: 22,
                sshUser: 'user',
                sshPass: '',
                sshKeyPath: '',
                sshKeyPassphrase: 'secret',
            },
        });
        assert.strictEqual(result.ok, false);
    });

    it('rejects profile reorder payloads with unknown shape', () => {
        const result = validateManageProfilesMessage({ type: 'done', payload: { profiles: [{ nope: true }] } });
        assert.strictEqual(result.ok, false);
    });

    it('rejects replay messages without a profile id', () => {
        const result = validateReplayDialogMessage({ type: 'send', payload: { profileId: '' } });
        assert.strictEqual(result.ok, false);
    });

    it('rejects unknown sidebar commands', () => {
        const result = validateSidebarMessage({ type: 'dropDatabase' });
        assert.strictEqual(result.ok, false);
    });
});
