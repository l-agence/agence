// src/shared/guard.ts — Guard history TreeView provider
import * as vscode from "vscode";
import type { GuardDecision } from "./types";

const TIER_ICONS: Record<string, string> = {
  T0: "$(pass)",
  T1: "$(info)",
  T2: "$(warning)",
  T3: "$(error)",
};

export class GuardTreeProvider implements vscode.TreeDataProvider<GuardItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GuardItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private decisions: GuardDecision[] = [];
  private maxEntries = 50;

  constructor(private readonly workspaceRoot: vscode.Uri | undefined) {}

  refresh(): void {
    this.loadDecisions().then(() => this._onDidChangeTreeData.fire(undefined));
  }

  private async loadDecisions(): Promise<void> {
    if (!this.workspaceRoot) {
      this.decisions = [];
      return;
    }

    // Read shard ledger (.ailedger) — last N entries
    const ledgerUri = vscode.Uri.joinPath(this.workspaceRoot, ".ailedger");
    try {
      const content = await vscode.workspace.fs.readFile(ledgerUri);
      const lines = new TextDecoder().decode(content).trim().split("\n");
      const recent = lines.slice(-this.maxEntries);

      this.decisions = recent
        .map((line) => {
          try {
            const entry = JSON.parse(line);
            if (entry.decision_type === "execute" || entry.decision_type === "classify") {
              return {
                seq: entry.seq,
                timestamp: entry.timestamp,
                agent: entry.agent || "unknown",
                command: entry.command || "",
                tier: this.inferTier(entry),
                action: entry.action || "allow",
                rule: entry.rule,
                reason: entry.reason,
              } as GuardDecision;
            }
          } catch {
            // Skip malformed
          }
          return null;
        })
        .filter((d): d is GuardDecision => d !== null)
        .reverse();
    } catch {
      this.decisions = [];
    }
  }

  private inferTier(entry: Record<string, unknown>): "T0" | "T1" | "T2" | "T3" {
    if (entry.tier) { return entry.tier as GuardDecision["tier"]; }
    if (entry.rationale_tag === "guard-block") { return "T3"; }
    if (entry.rationale_tag === "guard-escalate") { return "T2"; }
    return "T0";
  }

  getTreeItem(element: GuardItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<GuardItem[]> {
    if (this.decisions.length === 0) {
      await this.loadDecisions();
    }

    if (this.decisions.length === 0) {
      return [new GuardItem("No guard history", vscode.TreeItemCollapsibleState.None)];
    }

    return this.decisions.map((d) => {
      const icon = TIER_ICONS[d.tier] || "$(circle)";
      const label = `${icon} [${d.tier}] ${truncate(d.command, 60)}`;
      const item = new GuardItem(label, vscode.TreeItemCollapsibleState.None);
      item.description = `@${d.agent} · ${formatTime(d.timestamp)}`;
      item.tooltip = `Command: ${d.command}\nTier: ${d.tier} (${d.action})\nAgent: @${d.agent}\nRule: ${d.rule || "—"}\nTime: ${d.timestamp}`;
      return item;
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

class GuardItem extends vscode.TreeItem {
  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }
}

function truncate(s: string, max: number): string {
  if (!s) { return ""; }
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
