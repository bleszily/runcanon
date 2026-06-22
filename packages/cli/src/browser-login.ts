import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";

import type { CliCredentials } from "./remote.js";
import { saveCredentials } from "./remote.js";

const execFileAsync = promisify(execFile);

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      await execFileAsync("open", [url]);
      return;
    }
    if (platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url], { windowsHide: true });
      return;
    }
    await execFileAsync("xdg-open", [url]);
  } catch {
    console.log(`Open this URL in your browser:\n  ${url}`);
  }
}

function waitForCallback(port: number, timeoutMs: number): Promise<{ state: string; code: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing code or state");
        reject(new Error("Invalid authorization callback"));
        server.close();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><html><body style='font-family:system-ui;padding:2rem'><h1>RunCanon CLI authorized</h1><p>You can close this tab and return to the terminal.</p></body></html>"
      );
      server.close();
      resolve({ state, code });
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1");

    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for browser authorization"));
    }, timeoutMs);
    server.on("close", () => clearTimeout(timer));
  });
}

export async function loginViaBrowser(serverUrl: string): Promise<CliCredentials> {
  const server = serverUrl.replace(/\/$/, "");
  const port = 49152 + Math.floor(Math.random() * 1000);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const callbackPromise = waitForCallback(port, 5 * 60 * 1000);

  const startRes = await fetch(`${server}/api/auth/cli/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });
  if (!startRes.ok) {
    throw new Error(`Could not start browser login (${startRes.status}): ${await startRes.text()}`);
  }

  const startBody = (await startRes.json()) as { state: string };
  const authorizeUrl = `${server}/cli/authorize?state=${encodeURIComponent(startBody.state)}`;

  console.log("Opening browser to authorize the CLI...");
  console.log(`If the browser does not open, visit:\n  ${authorizeUrl}`);
  await openBrowser(authorizeUrl);

  const { state, code } = await callbackPromise;

  const exchangeRes = await fetch(`${server}/api/auth/cli/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, code }),
  });
  if (!exchangeRes.ok) {
    throw new Error(`Authorization failed (${exchangeRes.status}): ${await exchangeRes.text()}`);
  }

  const body = (await exchangeRes.json()) as {
    user: { email: string };
    cliToken: { token: string; prefix: string; expiresAt: string };
  };

  const credentials: CliCredentials = {
    server,
    token: body.cliToken.token,
    email: body.user.email,
    prefix: body.cliToken.prefix,
    savedAt: new Date().toISOString(),
  };
  await saveCredentials(credentials);
  return credentials;
}
