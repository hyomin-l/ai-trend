import { spawn } from "node:child_process";
import { CONFIG } from "@/config/sources";
import { SYSTEM_PROMPT } from "@/config/prompt";

/** One `claude -p` call; the prompt goes through stdin, the answer is the JSON envelope's `.result`. */
export function runClaude(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "claude",
      ["-p", "--model", model, "--system-prompt", SYSTEM_PROMPT, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"],
      { timeout: CONFIG.timeoutMs }, // kills with SIGTERM, which surfaces below as signal=SIGTERM
    );
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.stdin.on("error", () => {}); // EPIPE if claude dies early; 'close' reports the real failure
    p.on("error", reject);
    p.on("close", (code, signal) => {
      if (code !== 0) {
        // With --output-format json the reason (e.g. expired login) is in stdout's .result, not stderr.
        const reason = err.trim() || out.match(/"result":"([^"]*)"/)?.[1] || "";
        return reject(new Error(`claude exited code=${code} signal=${signal}: ${reason.slice(0, 300)}`));
      }
      try {
        const env = JSON.parse(out);
        if (env.is_error) throw new Error(`claude reported an error: ${String(env.result).slice(0, 300)}`);
        resolve(String(env.result ?? ""));
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(prompt);
  });
}
