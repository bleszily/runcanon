import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";

import {
  collectEventsFromSources,
  configToLlmProviderConfig,
  createLlmProvider,
  filterClusteringEvents,
  loadConfig,
  LlmSkillGenerationProvider,
  mineSkills,
  rankProposal,
  proposalCanonicalKey,
} from "@runcanon/core";

import { serializeSkill, type SkillProposal } from "@runcanon/spec";

import { readProjectPathState } from "./project-path.js";
import { resolveActiveLlmConfig } from "./platform.js";
import { listProposals, readSkillDirectory, resolveSkillPaths, type SkillPaths } from "./registry.js";

export interface RunMiningOptions {
  sources?: string[];
  scanProject?: boolean;
}

/** Run mining pipeline and persist proposals to disk. */
export async function runMining(
  paths: SkillPaths,
  options: RunMiningOptions = {}
): Promise<{ proposals: SkillProposal[]; eventCount: number; filesRead: string[]; llmUsed: boolean }> {
  const config = await loadConfig(paths.projectPath);
  const state = await readProjectPathState();
  const sourcePaths = [...(options.sources ?? []), ...(state?.miningSources ?? [])];

  const collected = await collectEventsFromSources(paths.projectPath, {
    sources: sourcePaths,
    scanProject: options.scanProject !== false,
  });

  if (filterClusteringEvents(collected.events).length === 0) {
    throw new Error(
      "No agent session JSONL for clustering. Catalog SKILL.md files were loaded as context only. Add tool_call sequences under .runcanon/trajectories/*.jsonl (MCP telemetry or export), then mine again."
    );
  }

  const active = await readSkillDirectory(paths.activeDir);
  const proposed = await readSkillDirectory(paths.proposedDir);
  const pendingRecords = await listProposals(paths);
  const pendingSkillIds = new Set(pendingRecords.map((p) => p.skillId));
  const pendingCanonicalKeys = new Set(pendingRecords.map((p) => proposalCanonicalKey(p)));

  const generationOptions: import("@runcanon/core").GenerationOptions = {
    harnesses: config.harnesses,
    scope: config.scope,
    goals: config.goals,
  };
  const llmConfig = (await resolveActiveLlmConfig()) ?? configToLlmProviderConfig(config);
  let llmProvider: ReturnType<typeof createLlmProvider> | undefined;
  if (llmConfig) {
    llmProvider = createLlmProvider(llmConfig);
    generationOptions.provider = new LlmSkillGenerationProvider(llmProvider, config.goals);
  }

  const result = await mineSkills(collected.workflowEvents, [...active, ...proposed], {
    clustering: {
      minClusterSize: config.mining.minClusterSize,
      distanceThreshold: config.mining.distanceThreshold,
    },
    generation: generationOptions,
    projectGoals: config.goals,
    requireLlm: false,
    pendingSkillIds,
    pendingCanonicalKeys,
  });

  let proposals = result.proposals;
  if (llmProvider) {
    const existingSkillNames = active.map((s) => s.name);
    const ranked = await Promise.all(
      proposals.map(async (proposal) => {
        const episodes = result.episodes.filter((ep) =>
          proposal.payload.tags.some((tag) => ep.intent.toLowerCase().includes(tag.toLowerCase()))
        );
        const sampleEpisodes = episodes.length > 0 ? episodes : result.episodes.slice(0, 5);
        const ranking = await rankProposal(
          { proposal, episodes: sampleEpisodes, goals: config.goals, existingSkillNames },
          llmProvider
        );
        return {
          ...proposal,
          confidence: ranking.llmAdjustedScore ?? ranking.qualityScore,
          reason: ranking.llmRationale ? `${proposal.reason} (LLM: ${ranking.llmRationale})` : proposal.reason,
        };
      })
    );
    ranked.sort((a, b) => b.confidence - a.confidence);
    proposals = ranked;
  }

  await mkdir(paths.proposedDir, { recursive: true });
  await mkdir(paths.registryProposedDir, { recursive: true });

  for (const proposal of proposals) {
    await writeFile(join(paths.proposedDir, `${proposal.payload.id}.md`), serializeSkill(proposal.payload), "utf-8");
    await writeFile(
      join(paths.registryProposedDir, `${proposal.skillId}.json`),
      JSON.stringify(proposal, null, 2),
      "utf-8"
    );
  }

  return {
    proposals,
    eventCount: collected.workflowEvents.length,
    filesRead: collected.filesRead,
    llmUsed: Boolean(llmProvider),
  };
}

export { resolveSkillPaths };
