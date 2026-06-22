import type { AuthContext } from "./auth.js";
import { exportEntitledSkills, type ExportSkillsResult } from "./skill-export.js";
import { resolveSkillPaths } from "./registry.js";
import { appendAudit } from "./audit.js";

export type { ExportSkillsResult };

/** Export entitled workspace + org skills to harness-native files under the project root. */
export async function exportSkills(
  auth: AuthContext,
  harnessInput: string,
  options?: { projectPath?: string; prune?: boolean }
): Promise<ExportSkillsResult> {
  const paths = await resolveSkillPaths(options?.projectPath);
  const result = await exportEntitledSkills({
    auth,
    harnessInput,
    projectPath: paths.projectPath,
    prune: options?.prune,
  });

  await appendAudit(paths, {
    action: "export.run",
    actor: auth.actor,
    resourceType: "export",
    note: `${result.skillCount} skills → ${result.harnesses.join(", ")} (${result.filesWritten} files)`,
  });

  return result;
}
