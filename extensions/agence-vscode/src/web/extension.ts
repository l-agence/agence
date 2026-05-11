// src/web/extension.ts — Web extension entry point (github.dev, Gitpod, vscode.dev)
// No Node.js APIs — uses only vscode.workspace.fs and VS Code API
import * as vscode from "vscode";
import { SignalTreeProvider } from "../shared/signals";
import { GuardTreeProvider } from "../shared/guard";
import { HealthTreeProvider } from "../shared/health";
import { AgenceStatusBar } from "../shared/statusbar";

let signalProvider: SignalTreeProvider;
let guardProvider: GuardTreeProvider;
let healthProvider: HealthTreeProvider;
let statusBar: AgenceStatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Find .agence root (could be workspace root or .agence subdir)
  const agenceRoot = await findAgenceRoot();

  // Tree view providers
  signalProvider = new SignalTreeProvider(agenceRoot);
  guardProvider = new GuardTreeProvider(agenceRoot);
  healthProvider = new HealthTreeProvider(agenceRoot);
  statusBar = new AgenceStatusBar();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("agence.signals", signalProvider),
    vscode.window.registerTreeDataProvider("agence.guard", guardProvider),
    vscode.window.registerTreeDataProvider("agence.health", healthProvider),
    statusBar
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("agence.approve", async (item) => {
      if (item?.signalId) {
        await signalProvider.respondToSignal(item.signalId, "y");
      } else {
        // QuickPick for signal selection
        vscode.window.showInformationMessage("Agence: No signal selected");
      }
    }),

    vscode.commands.registerCommand("agence.deny", async (item) => {
      if (item?.signalId) {
        await signalProvider.respondToSignal(item.signalId, "n");
      } else {
        vscode.window.showInformationMessage("Agence: No signal selected");
      }
    }),

    vscode.commands.registerCommand("agence.health", () => {
      healthProvider.refresh();
      vscode.commands.executeCommand("agence.health.focus");
    }),

    vscode.commands.registerCommand("agence.ledgerTail", async () => {
      if (!agenceRoot) {
        vscode.window.showErrorMessage("Agence: No workspace root found");
        return;
      }
      const ledgerUri = vscode.Uri.joinPath(agenceRoot, ".ailedger");
      try {
        const doc = await vscode.workspace.openTextDocument(ledgerUri);
        await vscode.window.showTextDocument(doc, { preview: true });
        // Jump to end
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const lastLine = doc.lineCount - 1;
          editor.revealRange(new vscode.Range(lastLine, 0, lastLine, 0));
        }
      } catch {
        vscode.window.showErrorMessage("Agence: Cannot open shard ledger");
      }
    }),

    vscode.commands.registerCommand("agence.refreshSignals", () => {
      signalProvider.refresh();
      vscode.commands.executeCommand("agence.signals.focus");
    })
  );

  // Initial load
  signalProvider.refresh();
  guardProvider.refresh();
  healthProvider.refresh();

  // Signal notification watcher
  if (agenceRoot) {
    const signalWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(agenceRoot, "nexus", "signals"), "*.json")
    );
    signalWatcher.onDidCreate(async (uri) => {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const signal = JSON.parse(new TextDecoder().decode(content));
        if (signal.blocking && !signal.response) {
          const action = await vscode.window.showWarningMessage(
            `🔴 @${signal.agent}: ${signal.summary}`,
            "Approve",
            "Deny",
            "View"
          );
          if (action === "Approve") {
            await signalProvider.respondToSignal(signal.id, "y");
          } else if (action === "Deny") {
            await signalProvider.respondToSignal(signal.id, "n");
          } else if (action === "View") {
            vscode.commands.executeCommand("agence.signals.focus");
          }
        }
        signalProvider.refresh();
        statusBar.setPendingSignal(1);
      } catch {
        // Ignore parse errors on new signals
      }
    });
    context.subscriptions.push(signalWatcher);
  }

  vscode.window.showInformationMessage("Agence governance panel activated");
}

export function deactivate(): void {
  signalProvider?.dispose();
  guardProvider?.dispose();
  healthProvider?.dispose();
  statusBar?.dispose();
}

async function findAgenceRoot(): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) { return undefined; }

  for (const folder of folders) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ".agencerc"));
      return folder.uri;
    } catch { /* not here */ }

    try {
      const sub = vscode.Uri.joinPath(folder.uri, ".agence", ".agencerc");
      await vscode.workspace.fs.stat(sub);
      return vscode.Uri.joinPath(folder.uri, ".agence");
    } catch { /* not here either */ }
  }

  return folders[0]?.uri;
}
