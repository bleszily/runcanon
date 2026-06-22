#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { program } from "commander";
import type { Harness, Skill, SkillProposal } from "@runcanon/spec";
import { parseSkill, renderProjectInstructions, renderSkill, serializeSkill, isKnownHarness, registeredHarnesses } from "@runcanon/spec";
import {
  collectEventsFromSources,
  configToLlmProviderConfig,
  createLlmProvider,
  DEFAULT_TRAJECTORY_STORAGE,
  filterClusteringEvents,
  loadConfig,
  LlmSkillGenerationProvider,
  mineSkills,
  parseConfig,
  saveConfig,
} from "@runcanon/core";

import { fileExists, listFiles, readText, safeUnlink, safeWriteFile, askQuestion, askPassword, askChoice } from "./io.js";
import { assertClusteringSources, printCollectionSummary } from "./collection.js";
import {
  approveProposal,
  defaultRegistry,
  loadRegistry,
  rejectProposal,
  removeProposalFile,
  retireSkill,
  saveRegistry,
  upsertSkill,
} from "./registry.js";

import { RUNCANON_VERSION } from "@runcanon/core";
import { name } from "./index.js";
import { clearCredentials, fetchServerHealth, loginToServer, loadCredentials, whoami } from "./remote.js";
import { loginViaBrowser } from "./browser-login.js";
import { mineOnServer, fetchRemoteActiveSkills, runRemoteExport, runRemoteGitImport, syncHarnessConfig } from "./remote-sync.js";
import { runMcpServer } from "./mcp-runner.js";
import { addGoals, clearGoals, listGoals, setGoals } from "./goals.js";

function resolveProjectPath(projectPath?: string): string {
  return resolve(process.cwd(), projectPath ?? ".");
}

function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] ?? "").length)));
  const separator = widths.map((w) => "-".repeat(w + 2)).join("+");
  const headerRow = headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join("|");

  console.log(headerRow);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((cell, i) => ` ${(cell ?? "").padEnd(widths[i])} `).join("|"));
  }
}

function summarizeMineResult(proposals: SkillProposal[]): void {
  if (proposals.length === 0) {
    console.log("No skill proposals generated.");
    return;
  }
  const rows = proposals.map((p) => [p.action, p.skillId, formatConfidence(p.confidence), p.reason]);
  printTable(["action", "skill id", "confidence", "reason"], rows);
}

async function loadActiveSkills(activeDir: string): Promise<Skill[]> {
  const files = await listFiles(activeDir, ".md");
  const skills: Skill[] = [];
  for (const file of files) {
    try {
      const { skill } = parseSkill(await readText(file));
      skills.push(skill);
    } catch (error) {
      console.warn(`Skipping invalid active skill ${file}: ${(error as Error).message}`);
    }
  }
  return skills;
}

export async function initializeProject(projectPath: string): Promise<void> {
  const resolved = resolve(projectPath);
  const projectName = basename(resolved);

  const creds = await loadCredentials();
  if (creds) {
    await syncHarnessConfig(creds, ["claude", "cursor", "copilot", "codex"]);
    console.log(`Workspace harnesses configured on ${creds.server}`);
    console.log("Open Guide or Settings in the dashboard to adjust export targets.");
  }

  const config = parseConfig({
    project: projectName,
    scope: ["workspace-wide"],
    goals: [],
    harnesses: ["claude"],
    autonomy: "ask",
    telemetry: {
      enabled: true,
      retentionDays: 90,
      storagePath: DEFAULT_TRAJECTORY_STORAGE,
    },
    mining: {
      schedule: "manual",
      minClusterSize: 2,
      distanceThreshold: 0.45,
    },
  });

  await saveConfig(resolved, config);

  const resolvedConfig = await loadConfig(resolved);
  const registry = defaultRegistry();

  const dirs = [resolvedConfig.skillsDir, resolvedConfig.proposedDir, resolvedConfig.activeDir, resolve(resolved, config.telemetry.storagePath)];
  for (const dir of dirs) {
    await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
  }

  await saveRegistry(resolvedConfig.registryPath, registry);

  console.log(`Initialized RunCanon at ${resolved}`);
  console.log(`  config: ${resolved}/runcanon.config.yaml`);
  console.log(`  data:   ${resolvedConfig.skillsDir.replace("/skills", "")}`);
  console.log(`  registry: ${resolvedConfig.registryPath}`);
  console.log("");
  console.log("Next: runcanon mine");
  console.log("  Trajectories: record agent sessions to .runcanon/trajectories/*.jsonl (MCP telemetry or JSONL export)");
  console.log("  Optional: runcanon mine --source <skills-or-docs> to include explicit catalogs");
}

export async function runMine(options: {
  project?: string;
  dryRun?: boolean;
  trajectories?: string;
  /** Commander maps `--source` to `source` (not `sources`). */
  source?: string[];
  sources?: string[];
}): Promise<void> {
  const projectPath = resolveProjectPath(options.project);
  const sourcePaths =
    options.source ?? options.sources ?? (options.trajectories ? [options.trajectories] : []);

  const creds = await loadCredentials();
  if (creds && !options.dryRun) {
    const { result, uploadedEvents } = await mineOnServer({ projectPath, sources: sourcePaths });
    console.log(`Uploaded ${uploadedEvents} event(s) to ${creds.server}`);
    console.log(`Remote mining: ${result.proposals.length} proposal(s) from ${result.eventCount} event(s)${result.llmUsed ? " (LLM)" : ""}.`);
    summarizeMineResult(result.proposals);
    if (result.proposals.length === 0) {
      console.log("No new proposals — existing pending/active skills already cover this input. Record JSONL trajectories for new discoveries.");
    }
    console.log(`Open ${creds.server}/proposals to review in the dashboard.`);
    return;
  }

  const config = await loadConfig(projectPath);

  const collected = await collectEventsFromSources(projectPath, {
    sources: sourcePaths,
    scanProject: sourcePaths.length === 0,
  });
  printCollectionSummary(collected.summary);
  assertClusteringSources(collected.summary, collected.events);

  const events = filterClusteringEvents(collected.events);

  const existingSkills = await loadActiveSkills(config.activeDir);
  const generationOptions: import("@runcanon/core").GenerationOptions = {
    harnesses: config.harnesses,
    scope: config.scope,
    goals: config.goals,
  };

  const llmConfig = configToLlmProviderConfig(config);
  if (llmConfig) {
    generationOptions.provider = new LlmSkillGenerationProvider(createLlmProvider(llmConfig), config.goals);
  }

  const result = await mineSkills(events, existingSkills, {
    clustering: {
      minClusterSize: config.mining.minClusterSize,
      distanceThreshold: config.mining.distanceThreshold,
    },
    generation: generationOptions,
    projectGoals: config.goals,
    requireLlm: Boolean(llmConfig),
  });

  if (options.dryRun) {
    console.log(`Dry run: ${result.proposals.length} proposal(s) from ${events.length} event(s).`);
    summarizeMineResult(result.proposals);
    return;
  }

  const registry = await loadRegistry(config.registryPath);

  for (const proposal of result.proposals) {
    const payload: Skill = { ...proposal.payload, status: proposal.action === "retire" ? "retired" : "proposed" };
    const proposedPath = `${config.proposedDir}/${proposal.skillId}.md`;
    await safeWriteFile(proposedPath, serializeSkill(payload));

    if (!registry.draft.includes(proposal.skillId)) {
      registry.draft.push(proposal.skillId);
    }
    upsertSkill(registry, payload);
  }

  await saveRegistry(config.registryPath, registry);
  summarizeMineResult(result.proposals);
  console.log(`Wrote ${result.proposals.length} proposal(s) to ${config.proposedDir}`);
}

function inferProposalAction(skill: Skill, registry: import("@runcanon/spec").SkillRegistryIndex): "create" | "update" | "retire" {
  if (skill.status === "retired") return "retire";
  if (registry.active.includes(skill.id)) return "update";
  return "create";
}

function sideBySideDiff(previousText: string, nextText: string): string {
  const previousLines = previousText.split("\n");
  const nextLines = nextText.split("\n");
  const width = 48;
  const header = `${padRight("Previous", width)} | ${padRight("New", width)}`;
  const parts: string[] = [header, "-".repeat(width * 2 + 3)];
  const max = Math.max(previousLines.length, nextLines.length);
  for (let i = 0; i < max; i++) {
    const previousLine = (previousLines[i] ?? "").slice(0, width);
    const nextLine = (nextLines[i] ?? "").slice(0, width);
    const marker = previousLine === nextLine ? "  " : "* ";
    parts.push(`${marker}${padRight(previousLine, width)} | ${padRight(nextLine, width)}`);
  }
  return parts.join("\n");
}

function padRight(text: string, width: number): string {
  if (text.length > width) return `${text.slice(0, width - 1)}…`;
  return text.padEnd(width, " ");
}

export async function runReview(options: { project?: string; autoApprove?: boolean }): Promise<void> {
  const projectPath = resolveProjectPath(options.project);
  const config = await loadConfig(projectPath);

  const proposalFiles = await listFiles(config.proposedDir, ".md");
  if (proposalFiles.length === 0) {
    console.log("No pending skill proposals to review.");
    return;
  }

  const registry = await loadRegistry(config.registryPath);
  const summary = { approved: 0, rejected: 0, skipped: 0 };

  for (const file of proposalFiles) {
    let proposed: Skill;
    try {
      proposed = parseSkill(await readText(file)).skill;
    } catch (error) {
      console.warn(`Skipping invalid proposal ${file}: ${(error as Error).message}`);
      summary.skipped++;
      continue;
    }

    const action = inferProposalAction(proposed, registry);
    let previous: Skill | undefined;
    if (action === "update" || action === "retire") {
      const previousPath = `${config.activeDir}/${proposed.id}.md`;
      try {
        previous = parseSkill(await readText(previousPath)).skill;
      } catch {
        previous = undefined;
      }
    }

    console.log(`\n[${action.toUpperCase()}] ${proposed.id}`);
    console.log(sideBySideDiff(previous ? serializeSkill(previous) : "", serializeSkill(proposed)));

    let decision: "approve" | "reject" | "skip" = "skip";
    if (options.autoApprove) {
      decision = "approve";
    } else if (process.stdin.isTTY) {
      const answer = await askQuestion("Approve? [a]pprove / [r]eject / [s]kip (default: skip): ");
      const normalized = answer.toLowerCase();
      if (normalized === "a" || normalized === "approve") decision = "approve";
      else if (normalized === "r" || normalized === "reject") decision = "reject";
      else decision = "skip";
    } else {
      console.log("Non-interactive shell: skipping. Use --auto-approve to approve all.");
      decision = "skip";
    }

    if (decision === "skip") {
      summary.skipped++;
      continue;
    }

    if (decision === "approve") {
      if (action === "retire") {
        await safeUnlink(`${config.activeDir}/${proposed.id}.md`);
        retireSkill(registry, proposed.id);
      } else {
        await safeWriteFile(`${config.activeDir}/${proposed.id}.md`, serializeSkill({ ...proposed, status: "active" }));
        approveProposal(registry, proposed);
      }
      await removeProposalFile(config.proposedDir, proposed.id);
      summary.approved++;
    } else {
      if (action === "retire") {
        // Rejecting a retire proposal keeps the skill active.
        registry.draft = registry.draft.filter((id) => id !== proposed.id);
        const existing = registry.skills.find((s) => s.id === proposed.id);
        if (existing) existing.status = "active";
      } else {
        rejectProposal(registry, proposed);
      }
      await removeProposalFile(config.proposedDir, proposed.id);
      summary.rejected++;
    }
  }

  await saveRegistry(config.registryPath, registry);
  console.log("\nReview complete:");
  console.log(`  approved: ${summary.approved}`);
  console.log(`  rejected: ${summary.rejected}`);
  console.log(`  skipped:  ${summary.skipped}`);
}

export async function runExport(options: { project?: string; harness: string; workspace?: boolean }): Promise<void> {
  const projectPath = resolveProjectPath(options.project);
  const creds = await loadCredentials();

  if (creds && options.workspace) {
    const body = await runRemoteExport(creds, options.harness);
    console.log(`Exported on ${creds.server} workspace: ${body.skillCount} skill(s), ${body.filesWritten} file(s).`);
    for (const path of body.paths.slice(0, 20)) {
      console.log(`  ${path}`);
    }
    if (body.paths.length > 20) {
      console.log(`  … and ${body.paths.length - 20} more`);
    }
    return;
  }

  const config = await loadConfig(projectPath);

  const targetHarnesses: Harness[] =
    options.harness === "all"
      ? config.harnesses
      : options.harness.split(",").map((h) => h.trim() as Harness);

  const invalid = targetHarnesses.filter((h) => !isKnownHarness(h));
  if (invalid.length > 0) {
    throw new Error(`Unsupported harness(es): ${invalid.join(", ")}. Known: ${registeredHarnesses().join(", ")}`);
  }

  let activeSkills: Skill[];
  if (creds) {
    activeSkills = (await fetchRemoteActiveSkills(creds)).map((skill) => ({ ...skill, harnesses: targetHarnesses }));
    if (activeSkills.length === 0) {
      console.log("No active skills on the dashboard. Approve proposals at /proposals first.");
      return;
    }
  } else {
    activeSkills = (await loadActiveSkills(config.activeDir)).map((skill) => ({ ...skill, harnesses: targetHarnesses }));
    if (activeSkills.length === 0) {
      console.log("No active skills to export.");
      return;
    }
  }

  let written = 0;
  const renderedSkills = activeSkills.flatMap((skill) => renderSkill(skill));
  for (const { path, content, overwrite } of renderedSkills) {
    const fullPath = resolve(projectPath, path);
    if (!overwrite && (await fileExists(fullPath))) {
      console.log(`  skipping ${path} (exists)`);
      continue;
    }
    await safeWriteFile(fullPath, content);
    written++;
    console.log(`  wrote ${path}`);
  }

  const projectInstructions = renderProjectInstructions(activeSkills);
  for (const { path, content, overwrite } of projectInstructions) {
    const fullPath = resolve(projectPath, path);
    if (!overwrite && (await fileExists(fullPath))) {
      console.log(`  skipping ${path} (exists)`);
      continue;
    }
    await safeWriteFile(fullPath, content);
    written++;
    console.log(`  wrote ${path}`);
  }

  const source = creds ? `${creds.server} → ${projectPath}` : projectPath;
  console.log(`Exported ${activeSkills.length} skill(s) to ${targetHarnesses.join(", ")} (${written} file(s)) from ${source}.`);
}

program.name("runcanon").description("RunCanon CLI - mine, review, and export AI skills").version(RUNCANON_VERSION);

program
  .command("init")
  .description("Initialize RunCanon in a project directory")
  .argument("[path]", "project path (default: current directory)", ".")
  .action(async (projectPath: string) => {
    await initializeProject(projectPath);
  });

program
  .command("mine")
  .description("Mine skills from collected trajectories and documents")
  .option("-p, --project <path>", "project path")
  .option("-t, --trajectories <path>", "path to trajectory file or directory (deprecated, use --source)")
  .option("-s, --source <paths...>", "file or directory paths to mine (relative to project or absolute)")
  .option("--dry-run", "print proposals without writing files")
  .action(async (options: { project?: string; dryRun?: boolean; trajectories?: string; source?: string[]; sources?: string[] }) => {
    await runMine(options);
  });

program
  .command("review")
  .description("Review pending skill proposals")
  .option("-p, --project <path>", "project path")
  .option("--auto-approve", "approve all pending proposals without prompting")
  .action(async (options: { project?: string; autoApprove?: boolean }) => {
    await runReview(options);
  });

program
  .command("login")
  .description("Sign in to a RunCanon dashboard instance (local Docker or hosted URL)")
  .requiredOption("-s, --server <url>", "dashboard base URL, e.g. http://127.0.0.1:3000")
  .option("-e, --email <email>", "account email (password login)")
  .option("-p, --password <password>", "account password (omit to prompt; hidden when interactive)")
  .option("-b, --browser", "sign in using your browser session")
  .action(async (options: { server: string; email?: string; password?: string; browser?: boolean }) => {
    const ok = await fetchServerHealth(options.server);
    if (!ok) {
      console.warn(`Warning: could not reach ${options.server}/api/health`);
    }

    let creds;
    const useBrowser =
      options.browser ||
      (!options.password &&
        !options.email &&
        (await askChoice("Sign in with [1] email/password or [2] browser? ", ["1", "2"])) === "2");

    if (useBrowser) {
      creds = await loginViaBrowser(options.server);
    } else {
      const email = options.email ?? (await askQuestion("Email: "));
      const password = options.password ?? (await askPassword("Password: "));
      creds = await loginToServer({ server: options.server, email, password });
    }

    console.log(`Signed in to ${creds.server} as ${creds.email}`);
    console.log(`CLI token saved (${creds.prefix}…). Use with Authorization: Bearer`);
  });

program
  .command("logout")
  .description("Remove saved dashboard credentials")
  .action(async () => {
    await clearCredentials();
    console.log("Credentials cleared.");
  });

program
  .command("whoami")
  .description("Show the connected RunCanon server and user")
  .action(async () => {
    const creds = await loadCredentials();
    if (!creds) {
      console.log("Not signed in. Run: runcanon login --server http://127.0.0.1:3000");
      return;
    }
    try {
      const info = await whoami();
      console.log(`Server: ${info?.server}`);
      console.log(`User:   ${info?.email ?? creds.email ?? "unknown"}`);
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("import")
  .description("Import skills from a GitHub or Bitbucket repository (requires login; curator+ on server)")
  .requiredOption("-r, --repo <url>", "repository URL")
  .option("-b, --branch <branch>", "branch name", "main")
  .option("-t, --token <token>", "access token for private repos (not stored)")
  .option("-d, --destination <dest>", "workspace, org, or proposal", "org")
  .option("--no-enrich", "skip LLM assessment and enrichment")
  .action(
    async (options: {
      repo: string;
      branch?: string;
      token?: string;
      destination?: string;
      enrich?: boolean;
    }) => {
      const creds = await loadCredentials();
      if (!creds) {
        console.error("Not signed in. Run: runcanon login --server http://127.0.0.1:3000");
        process.exitCode = 1;
        return;
      }
      const dest = options.destination as "workspace" | "org" | "proposal";
      if (!["workspace", "org", "proposal"].includes(dest)) {
        console.error("destination must be workspace, org, or proposal");
        process.exitCode = 1;
        return;
      }
      try {
        const result = await runRemoteGitImport(creds, {
          repoUrl: options.repo,
          branch: options.branch,
          token: options.token,
          destination: dest,
          enrich: options.enrich !== false,
        });
        console.log(`Imported ${result.imported.length} skill(s)${result.llmUsed ? " (LLM enriched)" : ""}`);
        for (const item of result.imported) {
          console.log(`  - ${item.name} (${item.skillId})`);
        }
        if (result.skipped.length > 0) {
          console.log(`Skipped ${result.skipped.length} file(s)`);
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    }
  );

program
  .command("mcp")
  .description("Start the RunCanon MCP server on stdio (for Cursor, Claude, etc.)")
  .action(async () => {
    await runMcpServer();
  });

const goalsCmd = program.command("goals").description("View or update project / workspace goals");

goalsCmd
  .command("list", { isDefault: true })
  .description("List configured goals (default action)")
  .option("-p, --project <path>", "local project path to mirror or use in offline mode")
  .option("-w, --workspace <id>", "workspace id (admin only, connected mode)")
  .action(async (options: { project?: string; workspace?: string }) => {
    try {
      const result = await listGoals({ project: options.project, workspaceId: options.workspace });
      if (result.goals.length === 0) {
        console.log("No goals configured.");
        return;
      }
      for (const goal of result.goals) {
        console.log(`- ${goal}`);
      }
      if (result.mode === "connected") {
        console.log(`\n(${result.goals.length} goal(s) on ${result.projectPath ?? "workspace"}${result.workspaceId ? `, workspace ${result.workspaceId}` : ""})`);
      }
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

goalsCmd
  .command("set")
  .description("Replace all goals with the provided list")
  .argument("<goals...>", "goal statements")
  .option("-p, --project <path>", "local project path to mirror or use in offline mode")
  .option("-w, --workspace <id>", "workspace id (admin only, connected mode)")
  .option("--no-mirror-local", "when connected, do not update local runcanon.config.yaml")
  .action(async (goalArgs: string[], options: { project?: string; workspace?: string; mirrorLocal?: boolean }) => {
    try {
      const result = await setGoals(goalArgs, {
        project: options.project,
        workspaceId: options.workspace,
        mirrorLocal: options.mirrorLocal,
      });
      console.log(`Set ${result.goals.length} goal(s) (${result.mode} mode).`);
      for (const goal of result.goals) {
        console.log(`- ${goal}`);
      }
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

goalsCmd
  .command("add")
  .description("Append one or more goals")
  .argument("<goals...>", "goal statements to add")
  .option("-p, --project <path>", "local project path to mirror or use in offline mode")
  .option("-w, --workspace <id>", "workspace id (admin only, connected mode)")
  .option("--no-mirror-local", "when connected, do not update local runcanon.config.yaml")
  .action(async (goalArgs: string[], options: { project?: string; workspace?: string; mirrorLocal?: boolean }) => {
    try {
      const result = await addGoals(goalArgs, {
        project: options.project,
        workspaceId: options.workspace,
        mirrorLocal: options.mirrorLocal,
      });
      console.log(`Now ${result.goals.length} goal(s) (${result.mode} mode).`);
      for (const goal of result.goals) {
        console.log(`- ${goal}`);
      }
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

goalsCmd
  .command("clear")
  .description("Remove all goals")
  .option("-p, --project <path>", "local project path to mirror or use in offline mode")
  .option("-w, --workspace <id>", "workspace id (admin only, connected mode)")
  .option("--no-mirror-local", "when connected, do not update local runcanon.config.yaml")
  .action(async (options: { project?: string; workspace?: string; mirrorLocal?: boolean }) => {
    try {
      await clearGoals({
        project: options.project,
        workspaceId: options.workspace,
        mirrorLocal: options.mirrorLocal,
      });
      console.log("Goals cleared.");
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("export")
  .description("Export active skills to target harness formats")
  .requiredOption("-h, --harness <harness>", `target harness (${registeredHarnesses().join(", ")}, or all)`)
  .option("-p, --project <path>", "project path (default: current directory)")
  .option("--workspace", "export into the dashboard workspace instead of the local project")
  .action(async (options: { harness: string; project?: string; workspace?: boolean }) => {
    await runExport(options);
  });

if (!process.env.VITEST) {
  program.parse();
}

export { name, RUNCANON_VERSION as version };
