#!/usr/bin/env bun
// lib/error.ts — Structured error class for Agence
//
// Every module throws AgenceError instead of raw Error.
// Top-level handlers in bin/agence and bin/airun catch + format.
//
// Usage:
//   throw new AgenceError("GUARD_DENIED", "Command blocked by policy", { tier: "T3", command });

export enum AgenceErrorCode {
  // Guard
  GUARD_DENIED = "GUARD_DENIED",
  GUARD_ESCALATED = "GUARD_ESCALATED",
  GUARD_INVALID = "GUARD_INVALID",

  // Signal
  SIGNAL_TIMEOUT = "SIGNAL_TIMEOUT",
  SIGNAL_WRITE_FAILED = "SIGNAL_WRITE_FAILED",

  // Policy
  POLICY_INVALID = "POLICY_INVALID",
  POLICY_NOT_FOUND = "POLICY_NOT_FOUND",

  // MLS / Capability
  CAPABILITY_MISSING = "CAPABILITY_MISSING",
  MLS_VIOLATION = "MLS_VIOLATION",
  REVOKED = "REVOKED",

  // Ledger
  LEDGER_CORRUPT = "LEDGER_CORRUPT",
  LEDGER_WRITE_FAILED = "LEDGER_WRITE_FAILED",

  // Config
  CONFIG_MISSING = "CONFIG_MISSING",
  CONFIG_INVALID = "CONFIG_INVALID",

  // Agent
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  AGENT_SPAWN_FAILED = "AGENT_SPAWN_FAILED",

  // Skill
  SKILL_NOT_FOUND = "SKILL_NOT_FOUND",
  SKILL_EXEC_FAILED = "SKILL_EXEC_FAILED",

  // Input validation
  INVALID_INPUT = "INVALID_INPUT",
  PATH_TRAVERSAL = "PATH_TRAVERSAL",

  // System
  HEALTH_FAILED = "HEALTH_FAILED",
  DAEMON_UNAVAILABLE = "DAEMON_UNAVAILABLE",
}

export class AgenceError extends Error {
  readonly code: AgenceErrorCode;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;

  constructor(
    code: AgenceErrorCode,
    message: string,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AgenceError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  /** Structured JSON output for --json mode */
  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
    };
  }

  /** Human-friendly stderr output */
  format(): string {
    const ctx = Object.keys(this.context).length > 0
      ? ` (${Object.entries(this.context).map(([k, v]) => `${k}=${v}`).join(", ")})`
      : "";
    return `[${this.code}] ${this.message}${ctx}`;
  }

  /** Exit code mapping: 1=denied, 2=input error, 3=system error */
  get exitCode(): number {
    switch (this.code) {
      case AgenceErrorCode.GUARD_DENIED:
      case AgenceErrorCode.MLS_VIOLATION:
      case AgenceErrorCode.REVOKED:
      case AgenceErrorCode.CAPABILITY_MISSING:
        return 1;
      case AgenceErrorCode.INVALID_INPUT:
      case AgenceErrorCode.PATH_TRAVERSAL:
      case AgenceErrorCode.GUARD_INVALID:
      case AgenceErrorCode.POLICY_INVALID:
      case AgenceErrorCode.CONFIG_INVALID:
        return 2;
      default:
        return 3;
    }
  }
}

/** Helper: wrap a caught unknown into AgenceError */
export function wrapError(e: unknown, fallbackCode: AgenceErrorCode): AgenceError {
  if (e instanceof AgenceError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new AgenceError(fallbackCode, msg);
}
