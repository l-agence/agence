// src/shared/statusbar.ts — Status bar integration for guard tier display
import * as vscode from "vscode";

export class AgenceStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "agence.health";
    this.setIdle();
    this.item.show();
  }

  setIdle(): void {
    this.item.text = "$(shield) Agence";
    this.item.tooltip = "Agence governance active — click for health check";
    this.item.backgroundColor = undefined;
  }

  setGuardDecision(tier: string, command: string): void {
    const short = command.length > 30 ? command.slice(0, 29) + "…" : command;
    this.item.text = `$(shield) [${tier}] ${short}`;
    this.item.tooltip = `Last guard: ${tier} — ${command}`;

    if (tier === "T3") {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else if (tier === "T2") {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.item.backgroundColor = undefined;
    }
  }

  setPendingSignal(count: number): void {
    if (count > 0) {
      this.item.text = `$(shield) Agence 🔴 ${count}`;
      this.item.tooltip = `${count} pending signal(s) — click to view`;
      this.item.command = "agence.refreshSignals";
    } else {
      this.setIdle();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
