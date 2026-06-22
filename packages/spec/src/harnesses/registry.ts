import type { HarnessRenderResult, Skill } from "../types.js";

/** Metadata and render hooks for a target AI harness. */
export interface HarnessPlugin {
  /** Unique harness identifier (e.g. `cursor`, `codex`). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Short description of the harness and output format. */
  description: string;
  /** Aliases that resolve to this plugin (e.g. `openai` → `codex`). */
  aliases?: string[];
  /** Render a single skill into harness-native file(s). */
  renderSkill(skill: Skill): HarnessRenderResult[];
  /** Render project-level instruction aggregate, if supported. */
  renderProjectInstructions?(skills: Skill[]): HarnessRenderResult | null;
}

const registry = new Map<string, HarnessPlugin>();

/** Register a harness plugin. Later registrations for the same id overwrite. */
export function registerHarness(plugin: HarnessPlugin): void {
  registry.set(plugin.id, plugin);
  for (const alias of plugin.aliases ?? []) {
    registry.set(alias, plugin);
  }
}

/** Resolve a harness plugin by id or alias. */
export function getHarnessPlugin(id: string): HarnessPlugin | undefined {
  return registry.get(id);
}

/** List primary harness ids (excludes alias-only keys when deduplicated). */
export function registeredHarnesses(): string[] {
  const seen = new Set<HarnessPlugin>();
  const ids: string[] = [];
  for (const plugin of registry.values()) {
    if (!seen.has(plugin)) {
      seen.add(plugin);
      ids.push(plugin.id);
    }
  }
  return ids.sort();
}

/** Check whether a harness id or alias is registered. */
export function isKnownHarness(id: string): boolean {
  return registry.has(id);
}
