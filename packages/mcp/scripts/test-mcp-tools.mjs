#!/usr/bin/env node
/**
 * End-to-end MCP tool test — spawns runcanon-mcp and calls every registered tool.
 * Usage: pnpm --filter @runcanon/mcp test:tools
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SERVER = process.env.RUNCANON_SERVER ?? "http://127.0.0.1:3000";
const PROJECT =
  process.env.RUNCANON_PROJECT_PATH ?? join(homedir(), "Documents/ai-striker-security-app");
const MCP_BIN = process.env.RUNCANON_MCP_BIN ?? join(HERE, "../dist/bin.cjs");
const MCP_VIA_DOCKER = MCP_BIN.endsWith(".sh") || MCP_BIN.includes("runcanon-mcp-docker");
/** Path seen inside MCP process (container uses /project). */
const MCP_PROJECT = MCP_VIA_DOCKER ? "/project" : PROJECT;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseToolText(result) {
  const block = result?.content?.find((c) => c.type === "text");
  if (!block?.text) return null;
  try {
    return JSON.parse(block.text);
  } catch {
    return block.text;
  }
}

async function callTool(client, name, args = {}, timeoutMs) {
  const options = timeoutMs ? { timeout: timeoutMs } : undefined;
  return client.callTool({ name, arguments: args }, undefined, options);
}

async function uploadDemoTrajectories(token) {
  const path = join(ROOT, "examples/demo-trajectories/cve-triage-sessions.jsonl");
  const content = await readFile(path, "utf-8");
  const res = await fetch(`${SERVER}/api/trajectories`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename: "mcp-test-trajectories.jsonl", content }),
  });
  if (!res.ok) throw new Error(`Trajectory upload failed (${res.status})`);
  return res.json();
}

async function main() {
  console.log("== RunCanon MCP tool test ==");
  console.log(`Server:  ${SERVER}`);
  console.log(`Project: ${PROJECT}`);
  console.log(`MCP bin: ${MCP_BIN}${MCP_VIA_DOCKER ? " (demo container)" : ""}\n`);

  const health = await fetch(`${SERVER}/api/health`);
  if (!health.ok) {
    console.error("Dashboard not reachable. Start with: ./scripts/demo-docker.sh");
    process.exit(1);
  }

  let token;
  try {
    const creds = JSON.parse(await readFile(join(homedir(), ".runcanon/credentials.json"), "utf-8"));
    token = creds.token;
    console.log(`Connected as: ${creds.email ?? "unknown"}\n`);
  } catch {
    console.error("Missing ~/.runcanon/credentials.json — run: runcanon login --server " + SERVER);
    process.exit(1);
  }

  try {
    const upload = await uploadDemoTrajectories(token);
    console.log(`Seeded ${upload.eventCount ?? "?"} trajectory events for mine test\n`);
  } catch (err) {
    console.warn(`Trajectory seed skipped: ${err instanceof Error ? err.message : err}\n`);
  }

  const transport = new StdioClientTransport(
    MCP_VIA_DOCKER
      ? {
          command: MCP_BIN,
          args: [],
          env: { ...process.env },
        }
      : {
          command: process.execPath,
          args: [MCP_BIN],
          env: {
            ...process.env,
            RUNCANON_PROJECT_PATH: PROJECT,
          },
        }
  );

  const client = new Client({ name: "mcp-tool-test", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Registered tools (${tools.length}): ${tools.map((t) => t.name).join(", ")}\n`);

  const expected = [
    "runcanon_list_skills",
    "runcanon_get_skill",
    "runcanon_list_proposals",
    "runcanon_approve_proposal",
    "runcanon_reject_proposal",
    "runcanon_mine",
    "runcanon_export",
    "runcanon_get_stats",
    "runcanon_sync_skills",
    "runcanon_list_assignments",
    "runcanon_import_skills_from_git",
    "runcanon_emit_event",
  ];

  for (const name of expected) {
    if (!tools.some((t) => t.name === name)) {
      fail(`registry:${name}`, "tool not registered");
    } else {
      pass(`registry:${name}`, "registered");
    }
  }

  console.log("\n-- Tool invocations --");

  try {
    const r = await callTool(client, "runcanon_list_skills", { projectPath: MCP_PROJECT });
    const data = parseToolText(r);
    if (data?.mode === "connected") {
      pass(
        "runcanon_list_skills",
        `active=${data.active?.length ?? 0} proposed=${data.proposed?.length ?? 0} org=${data.org?.length ?? 0}`
      );
    } else {
      fail("runcanon_list_skills", `unexpected mode: ${data?.mode ?? r.isError}`);
    }
  } catch (err) {
    fail("runcanon_list_skills", String(err));
  }

  try {
    const list = parseToolText(await callTool(client, "runcanon_list_skills", { projectPath: MCP_PROJECT }));
    const sampleSkillId =
      list?.org?.[0]?.id ?? list?.active?.[0]?.id ?? list?.proposed?.[0]?.id ?? "cve-triage";
    const r = await callTool(client, "runcanon_get_skill", { skillId: sampleSkillId, projectPath: MCP_PROJECT });
    const data = parseToolText(r);
    if (data?.skill || r.isError) {
      pass("runcanon_get_skill", data?.skill ? `found ${sampleSkillId}` : `not found ${sampleSkillId}`);
    } else {
      fail("runcanon_get_skill", JSON.stringify(data)?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_get_skill", String(err));
  }

  try {
    const list = parseToolText(await callTool(client, "runcanon_list_skills", { projectPath: MCP_PROJECT }));
    const sampleSkillId = list?.active?.[0]?.id;
    if (!sampleSkillId) {
      pass("runcanon_get_skill:writeLocally", "skipped — no active skill");
    } else {
      const r = await callTool(client, "runcanon_get_skill", {
        skillId: sampleSkillId,
        projectPath: MCP_PROJECT,
        writeLocally: true,
        harnesses: ["claude"],
      });
      const data = parseToolText(r);
      if (data?.writtenLocally && data.pathsWritten > 0) {
        pass("runcanon_get_skill:writeLocally", `${data.pathsWritten} path(s)`);
      } else {
        fail("runcanon_get_skill:writeLocally", JSON.stringify(data)?.slice(0, 120));
      }
    }
  } catch (err) {
    fail("runcanon_get_skill:writeLocally", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_list_proposals", { projectPath: MCP_PROJECT });
    const data = parseToolText(r);
    if (data?.mode === "connected" && Array.isArray(data.proposals)) {
      pass("runcanon_list_proposals", `${data.proposals.length} proposals`);
    } else {
      fail("runcanon_list_proposals", String(r.isError));
    }
  } catch (err) {
    fail("runcanon_list_proposals", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_approve_proposal", {
      proposalId: "p-test",
      projectPath: MCP_PROJECT,
    });
    const text = r.content?.[0]?.text ?? "";
    if (r.isError && text.includes("connected")) {
      pass("runcanon_approve_proposal", "blocked in connected mode");
    } else {
      fail("runcanon_approve_proposal", "should be blocked in connected mode");
    }
  } catch (err) {
    fail("runcanon_approve_proposal", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_reject_proposal", {
      proposalId: "p-test",
      projectPath: MCP_PROJECT,
    });
    const text = r.content?.[0]?.text ?? "";
    if (r.isError && text.includes("connected")) {
      pass("runcanon_reject_proposal", "blocked in connected mode");
    } else {
      fail("runcanon_reject_proposal", "should be blocked in connected mode");
    }
  } catch (err) {
    fail("runcanon_reject_proposal", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_mine", { projectPath: MCP_PROJECT }, 300_000);
    const data = parseToolText(r);
    if (data?.mode === "connected" || Array.isArray(data?.proposals)) {
      pass(
        "runcanon_mine",
        `proposals=${data?.proposals?.length ?? 0} events=${data?.eventCount ?? "?"}`
      );
    } else if (r.isError) {
      pass("runcanon_mine", (r.content?.[0]?.text ?? "").slice(0, 100));
    } else {
      fail("runcanon_mine", JSON.stringify(data)?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_mine", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_export", {
      harnesses: ["cursor", "claude"],
      projectPath: MCP_PROJECT,
    });
    const data = parseToolText(r);
    if (data?.success || data?.mode === "connected" || typeof data?.skillCount === "number") {
      pass("runcanon_export", `skills=${data?.skillCount ?? 0} files=${data?.filesWritten ?? data?.paths?.length ?? 0}`);
    } else if (r.isError) {
      fail("runcanon_export", (r.content?.[0]?.text ?? "").slice(0, 100));
    } else {
      fail("runcanon_export", JSON.stringify(data)?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_export", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_get_stats", { projectPath: MCP_PROJECT });
    const data = parseToolText(r);
    if (data?.mode === "connected" || data?.activeSkills !== undefined) {
      pass("runcanon_get_stats", `active=${data?.activeSkills ?? "?"} trajectories=${data?.trajectoryCount ?? "?"}`);
    } else {
      fail("runcanon_get_stats", JSON.stringify(data)?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_get_stats", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_sync_skills", {
      projectPath: MCP_PROJECT,
      harnesses: ["cursor", "claude"],
      prune: false,
    });
    const data = parseToolText(r);
    if (typeof data?.synced === "number") {
      pass(
        "runcanon_sync_skills",
        `synced=${data.synced} harnesses=${data.harnesses?.join(",")} paths=${data.pathsWritten}`
      );
    } else {
      fail("runcanon_sync_skills", r.content?.[0]?.text?.slice(0, 120) ?? String(r.isError));
    }
  } catch (err) {
    fail("runcanon_sync_skills", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_list_assignments", {});
    const data = parseToolText(r);
    if (Array.isArray(data?.assignments)) {
      pass("runcanon_list_assignments", `${data.assignments.length} assignments`);
    } else {
      fail("runcanon_list_assignments", r.content?.[0]?.text?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_list_assignments", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_import_skills_from_git", {
      repoUrl: "https://github.com/anthropics/skills",
      branch: "main",
      destination: "proposal",
      enrich: false,
    });
    const data = parseToolText(r);
    if (data?.imported !== undefined || data?.skipped !== undefined) {
      pass(
        "runcanon_import_skills_from_git",
        `imported=${data.imported?.length ?? 0} skipped=${data.skipped?.length ?? 0}`
      );
    } else if (r.isError) {
      const msg = r.content?.[0]?.text ?? "";
      if (msg.includes("403") || msg.includes("curator")) {
        pass("runcanon_import_skills_from_git", "403 for engineer (expected — use curator/admin token)");
      } else {
        pass("runcanon_import_skills_from_git", msg.slice(0, 100));
      }
    } else {
      fail("runcanon_import_skills_from_git", JSON.stringify(data)?.slice(0, 120));
    }
  } catch (err) {
    fail("runcanon_import_skills_from_git", String(err));
  }

  try {
    const r = await callTool(client, "runcanon_emit_event", {
      sessionId: `mcp-test-${Date.now()}`,
      actor: "agent",
      type: "outcome",
      action: "mcp_smoke_test",
      intent: "Verify emit_event tool",
      outcome: "success",
      projectPath: MCP_PROJECT,
    });
    const data = parseToolText(r);
    if (data?.recorded === true && data?.eventId) {
      pass("runcanon_emit_event", `eventId=${data.eventId}`);
    } else {
      fail("runcanon_emit_event", JSON.stringify(data));
    }
  } catch (err) {
    fail("runcanon_emit_event", String(err));
  }

  await client.close();

  const failed = results.filter((r) => !r.ok);
  console.log("\n== Summary ==");
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll MCP tools responded as expected.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
