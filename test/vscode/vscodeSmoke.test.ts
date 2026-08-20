import * as assert from 'assert';
import * as vscode from 'vscode';

describe('VS Code smoke', () => {
    it('activates the extension and registers its core commands', async () => {
        const extension = vscode.extensions.getExtension('AgmenSoftware.agmen-stream-inspector');
        assert.ok(extension, 'extension should be discoverable');

        await extension?.activate();

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('redisInspector.open'));
        assert.ok(commands.includes('redisInspector.addConnection'));
        assert.ok(commands.includes('redisInspector.exportJson'));
        assert.ok(commands.includes('redisInspector.exportCsv'));
    });
});
