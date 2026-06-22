import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  approveProjectProposal,
  createProjectCollector,
  exportProjectSkills,
  getProjectSkill,
  getProjectStats,
  getProjectGoals,
  setProjectGoals,
  addProjectGoals,
  listProjectProposals,
  listProjectSkills,
  rejectProjectProposal,
  runProjectMine,
  validateHarnessList,
} from "./project.js";
import {
  fetchRemoteAssignments,
  fetchRemoteConfig,
  fetchRemoteSkill,
  fetchRemoteSkillsList,
  fetchRemoteSync,
  isConnectedMode,
  loadRemoteCredentials,
  normalizeRemoteGoals,
  remoteApiRequest,
  resolveProjectRoot,
  updateRemoteGoals,
  writeSkillsToProjectHarnesses,
} from "./remote-client.js";

import { RUNCANON_VERSION } from "@runcanon/core";

export const name = "@runcanon/mcp";
export const version = RUNCANON_VERSION;

function connectedModeError(action: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [
      {
        type: "text",
        text: `${action} is disabled in connected mode. Use the RunCanon dashboard (Proposals / Org Library) to avoid split-brain state.`,
      },
    ],
    isError: true,
  };
}

/** Start the RunCanon MCP server on stdio transport. */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name, version });

  server.tool(
    "runcanon_list_skills",
    "List active and proposed skills (local project or connected dashboard workspace + org library)",
    {
      projectPath: z.string().optional().describe("Absolute path to the RunCanon project root"),
    },
    async ({ projectPath }) => {
      if (await isConnectedMode()) {
        const remote = await fetchRemoteSkillsList();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "connected",
                  active: remote.active,
                  proposed: remote.proposed,
                  org: remote.org,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const { active, proposed } = await listProjectSkills(projectPath);
      return {
        content: [{ type: "text", text: JSON.stringify({ mode: "local", active, proposed }, null, 2) }],
      };
    }
  );

  server.tool(
    "runcanon_get_skill",
    "Get a single skill by id from local project or connected dashboard; optionally write harness files locally",
    {
      skillId: z.string().describe("Skill identifier"),
      projectPath: z.string().optional(),
      writeLocally: z
        .boolean()
        .optional()
        .describe("When true, write this skill to harness paths under projectPath (e.g. .claude/skills/)"),
      harnesses: z
        .array(z.string())
        .optional()
        .describe("Harness ids when writeLocally is true; default cursor, claude, codex, antigravity, copilot"),
    },
    async ({ skillId, projectPath, writeLocally, harnesses }) => {
      const root = resolveProjectRoot(projectPath);

      if (await isConnectedMode()) {
        const skill = await fetchRemoteSkill(skillId);
        if (!skill) {
          return { content: [{ type: "text", text: `Skill not found: ${skillId}` }], isError: true };
        }

        let written: { paths: string[]; harnesses: string[] } | undefined;
        if (writeLocally) {
          const validated = harnesses?.length ? validateHarnessList(harnesses) : undefined;
          written = await writeSkillsToProjectHarnesses(root, [skill], {
            harnesses: validated,
            prune: false,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "connected",
                  skill,
                  ...(written
                    ? {
                        writtenLocally: true,
                        pathsWritten: written.paths.length,
                        paths: written.paths,
                        harnesses: written.harnesses,
                        projectPath: root,
                      }
                    : {}),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const skill = await getProjectSkill(skillId, projectPath);
      if (!skill) {
        return { content: [{ type: "text", text: `Skill not found: ${skillId}` }], isError: true };
      }

      let written: { paths: string[]; harnesses: string[] } | undefined;
      if (writeLocally) {
        const validated = harnesses?.length ? validateHarnessList(harnesses) : undefined;
        written = await writeSkillsToProjectHarnesses(root, [skill], {
          harnesses: validated,
          prune: false,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mode: "local",
                skill,
                ...(written
                  ? {
                      writtenLocally: true,
                      pathsWritten: written.paths.length,
                      paths: written.paths,
                      harnesses: written.harnesses,
                      projectPath: root,
                    }
                  : {}),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "runcanon_list_proposals",
    "List pending skill proposals awaiting review",
    { projectPath: z.string().optional() },
    async ({ projectPath }) => {
      if (await isConnectedMode()) {
        const creds = await loadRemoteCredentials();
        if (!creds) {
          return { content: [{ type: "text", text: "Not connected" }], isError: true };
        }
        const res = await remoteApiRequest(creds, "GET", "/api/proposals?limit=100");
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Failed to list proposals (${res.status})` }],
            isError: true,
          };
        }
        const body = (await res.json()) as { items: unknown[] };
        return {
          content: [{ type: "text", text: JSON.stringify({ mode: "connected", proposals: body.items }, null, 2) }],
        };
      }

      const proposals = await listProjectProposals(projectPath);
      return { content: [{ type: "text", text: JSON.stringify({ mode: "local", proposals }, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_approve_proposal",
    "Approve a pending skill proposal (local mode only; use dashboard when connected)",
    {
      proposalId: z.string(),
      projectPath: z.string().optional(),
    },
    async ({ proposalId, projectPath }) => {
      if (await isConnectedMode()) {
        return connectedModeError("approve_proposal");
      }

      const skill = await approveProjectProposal(proposalId, projectPath);
      if (!skill) {
        return { content: [{ type: "text", text: `Proposal not found: ${proposalId}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ approved: true, skill }, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_reject_proposal",
    "Reject a pending skill proposal (local mode only; use dashboard when connected)",
    {
      proposalId: z.string(),
      projectPath: z.string().optional(),
    },
    async ({ proposalId, projectPath }) => {
      if (await isConnectedMode()) {
        return connectedModeError("reject_proposal");
      }

      const rejected = await rejectProjectProposal(proposalId, projectPath);
      if (!rejected) {
        return { content: [{ type: "text", text: `Proposal not found: ${proposalId}` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ rejected: true, proposal: rejected }, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_mine",
    "Run the RunCanon mining pipeline on collected trajectories",
    { projectPath: z.string().optional() },
    async ({ projectPath }) => {
      if (await isConnectedMode()) {
        const creds = await loadRemoteCredentials();
        if (!creds) {
          return { content: [{ type: "text", text: "Not connected" }], isError: true };
        }
        const res = await remoteApiRequest(creds, "POST", "/api/mine", { scanProject: true });
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Remote mining failed (${res.status}): ${await res.text()}` }],
            isError: true,
          };
        }
        const body = (await res.json()) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify({ mode: "connected", ...body }, null, 2) }] };
      }

      const proposals = await runProjectMine(projectPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ mode: "local", proposalCount: proposals.length, proposals }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "runcanon_export",
    "Export active skills to one or more harness formats",
    {
      harnesses: z.array(z.string()).describe("Target harness ids, e.g. claude, cursor, codex, antigravity, browser"),
      projectPath: z.string().optional(),
    },
    async ({ harnesses, projectPath }) => {
      if (await isConnectedMode()) {
        const root = resolveProjectRoot(projectPath);
        const validated = validateHarnessList(harnesses);
        const sync = await fetchRemoteSync(root);
        const merged = new Map<string, (typeof sync.orgSkills)[number]>();
        for (const skill of sync.workspaceSkills) merged.set(skill.id, skill);
        for (const skill of sync.orgSkills) merged.set(skill.id, skill);
        const skills = [...merged.values()];
        const written = await writeSkillsToProjectHarnesses(root, skills, {
          harnesses: validated,
          prune: false,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mode: "connected",
                  skillCount: skills.length,
                  filesWritten: written.paths.length,
                  harnesses: written.harnesses,
                  paths: written.paths.slice(0, 50),
                  mandatoryOrgSkillIds: sync.mandatoryOrgSkillIds,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const validated = validateHarnessList(harnesses);
      const files = await exportProjectSkills(validated, projectPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ mode: "local", exported: files.length, files: files.map((f) => f.path) }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "runcanon_get_goals",
    "List project or workspace goals used for mining and goal alignment",
    {
      projectPath: z.string().optional().describe("Local project root (optional mirror in connected mode)"),
      workspaceId: z.string().optional().describe("Workspace id (admin only, connected mode)"),
    },
    async ({ projectPath, workspaceId }) => {
      if (await isConnectedMode()) {
        try {
          const remote = await fetchRemoteConfig(workspaceId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    mode: "connected",
                    goals: remote.config?.goals ?? [],
                    projectPath: remote.projectPath,
                    workspaceId: remote.workspaceId,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return { content: [{ type: "text", text: (error as Error).message }], isError: true };
        }
      }

      const goals = await getProjectGoals(projectPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ mode: "local", goals, projectPath: resolveProjectRoot(projectPath) }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "runcanon_set_goals",
    "Replace workspace or project goals (connected mode updates dashboard workspace; local mode updates runcanon.config.yaml)",
    {
      goals: z.array(z.string()).describe("Goal statements"),
      projectPath: z.string().optional().describe("Local project root to mirror when connected"),
      workspaceId: z.string().optional().describe("Workspace id (admin only, connected mode)"),
      append: z.boolean().optional().describe("Append to existing goals instead of replacing"),
    },
    async ({ goals, projectPath, workspaceId, append }) => {
      const root = projectPath ? resolveProjectRoot(projectPath) : undefined;

      if (await isConnectedMode()) {
        try {
          let nextGoals = normalizeRemoteGoals(goals);
          if (append) {
            const current = await fetchRemoteConfig(workspaceId);
            nextGoals = normalizeRemoteGoals([...(current.config?.goals ?? []), ...nextGoals]);
          }
          const updated = await updateRemoteGoals(nextGoals, {
            workspaceId,
            mirrorLocalProjectPath: root,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    mode: "connected",
                    goals: updated.config?.goals ?? nextGoals,
                    projectPath: updated.projectPath,
                    workspaceId: updated.workspaceId,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return { content: [{ type: "text", text: (error as Error).message }], isError: true };
        }
      }

      const updatedGoals = append
        ? await addProjectGoals(projectPath, goals)
        : await setProjectGoals(projectPath, goals);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { mode: "local", goals: updatedGoals, projectPath: resolveProjectRoot(projectPath) },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "runcanon_get_stats",
    "Return RunCanon registry statistics and goal alignment",
    { projectPath: z.string().optional() },
    async ({ projectPath }) => {
      if (await isConnectedMode()) {
        const creds = await loadRemoteCredentials();
        if (!creds) {
          return { content: [{ type: "text", text: "Not connected" }], isError: true };
        }
        const res = await remoteApiRequest(creds, "GET", "/api/stats");
        if (!res.ok) {
          return { content: [{ type: "text", text: `Stats failed (${res.status})` }], isError: true };
        }
        const body = (await res.json()) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify({ mode: "connected", ...body }, null, 2) }] };
      }

      const stats = await getProjectStats(projectPath);
      return { content: [{ type: "text", text: JSON.stringify({ mode: "local", ...stats }, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_sync_skills",
    "Sync entitled workspace and org-assigned skills to all harness paths (Cursor, Claude, Codex, Antigravity, Copilot)",
    {
      projectPath: z.string().optional().describe("Project root to write harness skill files into"),
      harnesses: z
        .array(z.string())
        .optional()
        .describe("Target harness ids; default cursor, claude, codex, antigravity, copilot"),
      prune: z.boolean().optional().describe("Remove stale skill dirs not in sync set (default true)"),
    },
    async ({ projectPath, harnesses, prune }) => {
      if (!(await isConnectedMode())) {
        return {
          content: [
            {
              type: "text",
              text: "sync_skills requires connected mode. Run: runcanon login --server http://127.0.0.1:3000",
            },
          ],
          isError: true,
        };
      }

      const root = resolveProjectRoot(projectPath);
      const sync = await fetchRemoteSync(root);
      const merged = new Map<string, (typeof sync.orgSkills)[number]>();
      for (const skill of sync.workspaceSkills) merged.set(skill.id, skill);
      for (const skill of sync.orgSkills) merged.set(skill.id, skill);

      const skills = [...merged.values()];
      const validatedHarnesses = harnesses?.length ? validateHarnessList(harnesses) : undefined;
      const written = await writeSkillsToProjectHarnesses(root, skills, {
        harnesses: validatedHarnesses,
        prune: prune ?? true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                synced: skills.length,
                harnesses: written.harnesses,
                mandatoryOrgSkillIds: sync.mandatoryOrgSkillIds,
                missingMandatory: sync.missingMandatory,
                pathsWritten: written.paths.length,
                paths: written.paths.slice(0, 50),
                pruned: written.pruned,
              },
              null,
              2
            ),
          },
        ],
        isError: sync.missingMandatory.length > 0,
      };
    }
  );

  server.tool(
    "runcanon_list_assignments",
    "List org skill assignments for the signed-in user (connected mode)",
    {},
    async () => {
      if (!(await isConnectedMode())) {
        return {
          content: [{ type: "text", text: "list_assignments requires connected mode (runcanon login)" }],
          isError: true,
        };
      }

      const assignments = await fetchRemoteAssignments();
      return { content: [{ type: "text", text: JSON.stringify({ assignments }, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_import_skills_from_git",
    "Import skills from a GitHub or Bitbucket repo via the connected dashboard (curator+; token not stored)",
    {
      repoUrl: z.string().describe("HTTPS repository URL"),
      branch: z.string().optional().describe("Branch name (default main)"),
      token: z.string().optional().describe("PAT for private repos — used once, not persisted"),
      destination: z.enum(["workspace", "org", "proposal"]).optional().describe("Default org"),
      enrich: z.boolean().optional().describe("Run LLM assessment/enrichment (default true)"),
    },
    async ({ repoUrl, branch, token, destination, enrich }) => {
      if (!(await isConnectedMode())) {
        return {
          content: [{ type: "text", text: "import_skills_from_git requires connected mode (runcanon login)" }],
          isError: true,
        };
      }
      const creds = await loadRemoteCredentials();
      if (!creds) {
        return { content: [{ type: "text", text: "Not connected" }], isError: true };
      }
      const res = await remoteApiRequest(creds, "POST", "/api/org/skills/import", {
        repoUrl,
        branch,
        token,
        destination: destination ?? "org",
        enrich: enrich ?? true,
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Import failed (${res.status}): ${await res.text()}` }],
          isError: true,
        };
      }
      const body = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    }
  );

  server.tool(
    "runcanon_emit_event",
    "Record a trajectory event for later skill mining",
    {
      sessionId: z.string(),
      actor: z.enum(["user", "agent", "tool"]),
      type: z.enum(["message", "tool_call", "tool_result", "prompt_invoke", "prompt_result", "outcome", "boundary"]),
      action: z.string().optional(),
      intent: z.string().optional(),
      outcome: z.enum(["success", "partial", "failure", "aborted", "unknown"]).optional(),
      projectPath: z.string().optional(),
    },
    async ({ projectPath, sessionId, actor, type, action, intent, outcome }) => {
      const collector = createProjectCollector(projectPath);
      collector.startSession(sessionId);
      const eventId = crypto.randomUUID();
      collector.emit({
        id: eventId,
        timestamp: new Date().toISOString(),
        actor,
        type,
        action,
        intent,
        outcome,
      });
      collector.flush();
      return { content: [{ type: "text", text: JSON.stringify({ recorded: true, eventId }, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
