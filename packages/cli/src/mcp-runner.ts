import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve bundled MCP entry (release layout: lib/mcp/mcp.cjs beside lib/cli/cli.cjs). */
export async function resolveMcpEntryPath(): Promise<string> {
  const here = __dirname;
  const candidates = [
    join(here, "..", "mcp", "mcp.cjs"),
    join(here, "..", "..", "mcp", "mcp.cjs"),
    join(here, "..", "..", "..", "mcp", "dist", "bin.cjs"),
    join(here, "..", "..", "..", "..", "mcp", "dist", "bin.cjs"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "RunCanon MCP server not found. Reinstall the CLI release or run from the RunCanon monorepo after pnpm build."
  );
}

/** Start the RunCanon MCP stdio server (used by `runcanon mcp` and `runcanon-mcp`). */
export async function runMcpServer(): Promise<void> {
  const entry = await resolveMcpEntryPath();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0 || signal === "SIGTERM") {
        resolve();
        return;
      }
      reject(new Error(`RunCanon MCP exited with code ${code ?? signal}`));
    });
  });
}
