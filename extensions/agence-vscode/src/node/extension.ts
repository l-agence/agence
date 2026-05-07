// src/node/extension.ts — Desktop extension entry point
// Extends web functionality with Node.js-specific features:
// - Terminal integration for guard decisions
// - agentd process control
// - Direct file watching (more efficient than vscode.workspace.fs)
import * as vscode from "vscode";
import { SignalTreeProvider } from "../shared/signals";
import { GuardTreeProvider } from "../shared/guard";
import { HealthTreeProvider } from "../shared/health";
import { AgenceStatusBar } from "../shared/statusbar";

let signalProvider: SignalTreeProvider;
let guardProvider: GuardTreeProvider;
let healthProvider: HealthTreeProvider;
let statusBar: AgenceStatusBar;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  const agenceRoot = workspaceRoot;

  // Tree view providers (same as web)
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

  // Commands — same as web entry point
  context.subscriptions.push(
    vscode.commands.registerCommand("agence.approve", async (item) => {
      if (item?.signalId) {
        await signalProvider.respondToSignal(item.signalId, "y");
      }
    }),

    vscode.commands.registerCommand("agence.deny", async (item) => {
      if (item?.signalId) {
        await signalProvider.respondToSignal(item.signalId, "n");
      }
    }),

    vscode.commands.registerCommand("agence.health", () => {
      healthProvider.refresh();
      vscode.commands.executeCommand("agence.health.focus");
    }),

    vscode.commands.registerCommand("agence.ledgerTail", async () => {
      if (!agenceRoot) { return; }
      const ledgerUri = vscode.Uri.joinPath(agenceRoot, ".ailedger");
      try {
        const doc = await vscode.workspace.openTextDocument(ledgerUri);
        await vscode.window.showTextDocument(doc, { preview: true });
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

  // Desktop-only: Terminal integration for live guard watching
  context.subscriptions.push(
    vscode.commands.registerCommand("agence.watchLedger", () => {
      if (!agenceRoot) { return; }
      const terminal = vscode.window.createTerminal({
        name: "Agence Ledger",
        cwd: agenceRoot,
      });
      terminal.sendText('tail -f .ailedger | jq -r \'\"[\\(.tier // .decision_type)] \\(.command // .rationale_tag)\"\'');
      terminal.show();
    })
  );

  // Desktop-only: Signal notification popup with one-click approve
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
            `🔴 @${signal.agent} requests approval: ${signal.summary}`,
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
      } catch {
        // Skip
      }
    });
    context.subscriptions.push(signalWatcher);
  }

  // Initial load
  signalProvider.refresh();
  guardProvider.refresh();
  healthProvider.refresh();

  vscode.window.showInformationMessage("Agence governance panel activated (desktop)");
}

export function deactivate(): void {
  signalProvider?.dispose();
  guardProvider?.dispose();
  healthProvider?.dispose();
  statusBar?.dispose();
}
