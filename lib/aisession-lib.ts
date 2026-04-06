import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

// --- Types ---
export type Role = "shared" | "planner" | "coder" | "anchor";
export interface SessionMeta {
  sessionID: string;
  agentID: string;
  role: Role;
  command: string;
  exit_code: number;
  timestamp: string;
}

// --- Paths ---
const repoRoot = path.resolve(__dirname, "../..");
const sessionsDir = path.join(repoRoot, ".agence/nexus/.aisessions");
const ledgerDir = path.join(repoRoot, ".agence/nexus/.ailedger");
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
if (!fs.existsSync(ledgerDir)) fs.mkdirSync(ledgerDir, { recursive: true });

// --- Secure Command Execution ---
export async function runSafeCommand(tool: string, args: string[], role?: string): Promise<{ stdout: string; stderr: string }> {
  // ...insert your sandbox/whitelist logic here...
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, {
      cwd: repoRoot,
      env: { PATH: "/usr/bin:/bin" },
      shell: false
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => (stdout += d));
    child.stderr.on("data", d => (stderr += d));
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.trim() || `Exit code ${code}`)));
  });
}

// --- Session Metadata Logging ---
export function logSessionMeta(sessionID: string, agentID: string, role: Role, command: string, exit_code: number) {
  const fileName = `${role}-${sessionID}@${agentID}.json`;
  const filePath = path.join(sessionsDir, fileName);
  const meta: SessionMeta = {
    sessionID, agentID, role, command, exit_code, timestamp: new Date().toISOString()
  };
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  return filePath;
}

// --- Ledger Event Logging (append-only, optional) ---
export function logLedgerEvent(sessionID: string, event: string, details: any) {
  const filePath = path.join(ledgerDir, `${sessionID}.jsonl`);
  const entry = { event, details, timestamp: new Date().toISOString() };
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

// --- AI Command Wrapper ---
export async function sendAICommand(sessionID: string, role: Role, agentID: string, tool: string, args: string[]) {
  const result = await runSafeCommand(tool, args, role);
  logSessionMeta(sessionID, agentID, role, `${tool} ${args.join(" ")}`, 0);
  logLedgerEvent(sessionID, "command", { role, agentID, tool, args, result });
  console.log(`[AI ${role}] ${tool} ${args.join(" ")} => ${result.stdout}`);
}
