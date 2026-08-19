import * as vscode from 'vscode';
import { MainPanelProvider } from './providers/mainPanelProvider';
import { SidebarProvider } from './providers/sidebarProvider';
import { ConnectionProfileStore } from './services/connectionProfileStore';
import { ConnectionService } from './services/connectionService';

let mainPanelProvider: MainPanelProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
    const profileStore = new ConnectionProfileStore(context.globalState, context.secrets);
    const connectionService = new ConnectionService(profileStore);

    mainPanelProvider = new MainPanelProvider(
        context.extensionUri,
        connectionService,
        profileStore
    );

    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('redisInspector.open', () => {
            mainPanelProvider!.openPanel();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('redisInspector.addConnection', () => {
            mainPanelProvider!.addConnection();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('redisInspector.exportJson', () => {
            mainPanelProvider!.exportJson();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('redisInspector.exportCsv', () => {
            mainPanelProvider!.exportCsv();
        })
    );
}

export function deactivate() {
    mainPanelProvider?.dispose();
    mainPanelProvider = undefined;
}
