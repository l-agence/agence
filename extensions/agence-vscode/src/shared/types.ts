// src/shared/types.ts — Shared types for Agence VS Code extension

/** Signal from an agent requesting human decision */
export interface AgenceSignal {
  id: string;
  type: "ask" | "prompt" | "notify" | "output";
  agent: string;
  summary: string;
  timestamp: string;
  session_id?: string;
  /** For ^ask: blocking boolean decision */
  blocking: boolean;
  /** Response (filled when answered) */
  response?: "y" | "n" | string;
}

/** Guard decision entry from ledger or live classification */
export interface GuardDecision {
  seq: number;
  timestamp: string;
  agent: string;
  command: string;
  tier: "T0" | "T1" | "T2" | "T3";
  action: "allow" | "flag" | "escalate" | "deny";
  rule?: string;
  reason?: string;
}

/** Health check result */
export interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  fixable?: boolean;
}

/** Extension configuration */
export interface AgenceConfig {
  agenceRoot: string;
  signalDir: string;
  ledgerPath: string;
  policyPath: string;
}
