import type { Skill, SkillRegistryIndex } from "@runcanon/spec";

import { readJson, safeUnlink, writeJson } from "./io.js";

export function defaultRegistry(): SkillRegistryIndex {
  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    active: [],
    draft: [],
    retired: [],
    skills: [],
  };
}

export async function loadRegistry(registryPath: string): Promise<SkillRegistryIndex> {
  try {
    const data = await readJson<SkillRegistryIndex>(registryPath);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultRegistry();
    }
    throw error;
  }
}

export async function saveRegistry(registryPath: string, registry: SkillRegistryIndex): Promise<void> {
  registry.generatedAt = new Date().toISOString();
  await writeJson(registryPath, registry);
}

export function skillSummary(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    status: skill.status,
    harnesses: skill.harnesses,
    tags: skill.tags,
    metrics: skill.metrics,
  };
}

export function upsertSkill(registry: SkillRegistryIndex, skill: Skill): void {
  const summary = skillSummary(skill);
  const index = registry.skills.findIndex((s) => s.id === skill.id);
  if (index >= 0) {
    registry.skills[index] = summary;
  } else {
    registry.skills.push(summary);
  }
}

export function approveProposal(registry: SkillRegistryIndex, skill: Skill): void {
  registry.draft = registry.draft.filter((id) => id !== skill.id);
  if (!registry.active.includes(skill.id)) {
    registry.active.push(skill.id);
  }
  upsertSkill(registry, { ...skill, status: "active" });
}

export function rejectProposal(registry: SkillRegistryIndex, skill: Skill): void {
  registry.draft = registry.draft.filter((id) => id !== skill.id);
  upsertSkill(registry, { ...skill, status: "deprecated" });
}

export function retireSkill(registry: SkillRegistryIndex, skillId: string): void {
  registry.active = registry.active.filter((id) => id !== skillId);
  if (!registry.retired.includes(skillId)) {
    registry.retired.push(skillId);
  }
  const existing = registry.skills.find((s) => s.id === skillId);
  if (existing) {
    existing.status = "retired";
  }
}

export async function removeProposalFile(proposedDir: string, skillId: string): Promise<void> {
  await safeUnlink(`${proposedDir}/${skillId}.md`);
}
