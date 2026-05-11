// src/shared/signals.ts — Signal provider (TreeView) for pending human decisions
import * as vscode from "vscode";
import type { AgenceSignal } from "./types";

export class SignalTreeProvider implements vscode.TreeDataProvider<SignalItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SignalItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private signals: AgenceSignal[] = [];
  private signalDir: vscode.Uri | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly workspaceRoot: vscode.Uri | undefined) {
    if (workspaceRoot) {
      this.signalDir = vscode.Uri.joinPath(workspaceRoot, "nexus", "signals");
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(this.signalDir, "*.json")
      );
      this.watcher.onDidCreate(() => this.refresh());
      this.watcher.onDidChange(() => this.refresh());
      this.watcher.onDidDelete(() => this.refresh());
    }
  }

  refresh(): void {
    this.loadSignals().then(() => this._onDidChangeTreeData.fire(undefined));
  }

  private async loadSignals(): Promise<void> {
    if (!this.signalDir) {
      this.signals = [];
      return;
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(this.signalDir);
      const jsonFiles = entries
        .filter(([name, type]) => name.endsWith(".json") && type === vscode.FileType.File)
        .map(([name]) => name);

      const loaded: AgenceSignal[] = [];
      for (const name of jsonFiles) {
        try {
          const uri = vscode.Uri.joinPath(this.signalDir, name);
          const content = await vscode.workspace.fs.readFile(uri);
          const signal = JSON.parse(new TextDecoder().decode(content)) as AgenceSignal;
          if (!signal.response) {
            loaded.push(signal);
          }
        } catch {
          // Skip malformed signals
        }
      }

      this.signals = loaded.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      this.signals = [];
    }
  }

  getTreeItem(element: SignalItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SignalItem[]> {
    if (this.signals.length === 0) {
      await this.loadSignals();
    }

    if (this.signals.length === 0) {
      return [new SignalItem("No pending signals", "", "none", vscode.TreeItemCollapsibleState.None)];
    }

    return this.signals.map(
      (s) =>
        new SignalItem(
          `${s.blocking ? "🔴" : "🔵"} @${s.agent}: ${s.summary}`,
          s.id,
          s.blocking ? "signal.pending" : "signal.info",
          vscode.TreeItemCollapsibleState.None,
          s
        )
    );
  }

  async respondToSignal(signalId: string, response: "y" | "n"): Promise<void> {
    if (!this.signalDir) { return; }

    const uri = vscode.Uri.joinPath(this.signalDir, `${signalId}.json`);
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const signal = JSON.parse(new TextDecoder().decode(content)) as AgenceSignal;
      signal.response = response;
      const updated = new TextEncoder().encode(JSON.stringify(signal, null, 2));
      await vscode.workspace.fs.writeFile(uri, updated);
      this.refresh();

      const action = response === "y" ? "Approved" : "Denied";
      vscode.window.showInformationMessage(`Agence: ${action} signal from @${signal.agent}`);
    } catch (e) {
      vscode.window.showErrorMessage(`Agence: Failed to respond to signal: ${e}`);
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeTreeData.dispose();
  }
}

export class SignalItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly signalId: string,
    public override readonly contextValue: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly signal?: AgenceSignal
  ) {
    super(label, collapsibleState);
    if (signal?.blocking) {
      this.tooltip = `Blocking: ${signal.summary}\nAgent: @${signal.agent}\nTime: ${signal.timestamp}`;
      this.description = signal.type;
    }
  }
}
