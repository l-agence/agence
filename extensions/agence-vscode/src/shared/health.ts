// src/shared/health.ts — Health check TreeView provider
import * as vscode from "vscode";
import type { HealthCheck } from "./types";

const STATUS_ICONS: Record<string, string> = {
  ok: "$(pass-filled)",
  warn: "$(warning)",
  error: "$(error)",
};

export class HealthTreeProvider implements vscode.TreeDataProvider<HealthItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HealthItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private checks: HealthCheck[] = [];

  constructor(private readonly workspaceRoot: vscode.Uri | undefined) {}

  refresh(): void {
    this.runChecks().then(() => this._onDidChangeTreeData.fire(undefined));
  }

  private async runChecks(): Promise<void> {
    if (!this.workspaceRoot) {
      this.checks = [{ name: "Workspace", status: "error", message: "No workspace open" }];
      return;
    }

    this.checks = [];

    // Check .agencerc exists
    await this.checkFileExists(".agencerc", "Configuration");

    // Check AIPOLICY.yaml exists
    await this.checkFileExists("codex/AIPOLICY.yaml", "Policy");

    // Check shard ledger
    await this.checkFileExists(".ailedger", "Shard Ledger");

    // Check local ledger dir
    await this.checkDirExists("nexus/.ailedger", "Local Ledger");

    // Check signals dir
    await this.checkDirExists("nexus/signals", "Signal Transport");

    // Check agent registry
    await this.checkFileExists("codex/agents/registry.json", "Agent Registry");

    // Check guard.ts exists (lib present)
    await this.checkFileExists("lib/guard.ts", "Guard Module");
  }

  private async checkFileExists(relativePath: string, name: string): Promise<void> {
    if (!this.workspaceRoot) { return; }
    const uri = vscode.Uri.joinPath(this.workspaceRoot, relativePath);
    try {
      await vscode.workspace.fs.stat(uri);
      this.checks.push({ name, status: "ok", message: relativePath });
    } catch {
      this.checks.push({ name, status: "error", message: `Missing: ${relativePath}`, fixable: true });
    }
  }

  private async checkDirExists(relativePath: string, name: string): Promise<void> {
    if (!this.workspaceRoot) { return; }
    const uri = vscode.Uri.joinPath(this.workspaceRoot, relativePath);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) {
        this.checks.push({ name, status: "ok", message: relativePath });
      } else {
        this.checks.push({ name, status: "error", message: `Not a directory: ${relativePath}` });
      }
    } catch {
      this.checks.push({ name, status: "warn", message: `Missing: ${relativePath}`, fixable: true });
    }
  }

  getTreeItem(element: HealthItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<HealthItem[]> {
    if (this.checks.length === 0) {
      await this.runChecks();
    }

    return this.checks.map((c) => {
      const icon = STATUS_ICONS[c.status] || "$(circle)";
      const item = new HealthItem(`${icon} ${c.name}`, vscode.TreeItemCollapsibleState.None);
      item.description = c.message;
      item.tooltip = `${c.name}: ${c.status}\n${c.message}`;
      return item;
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

class HealthItem extends vscode.TreeItem {
  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }
}
