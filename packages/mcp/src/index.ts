/** @runcanon/mcp - MCP server for skill management */
export { name, version, startMcpServer } from "./server.js";
export {
  resolveProjectPaths,
  resolveProjectRoot,
  listProjectSkills,
  getProjectSkill,
  listProjectProposals,
  approveProjectProposal,
  rejectProjectProposal,
  runProjectMine,
  exportProjectSkills,
  getProjectStats,
  createProjectCollector,
  validateHarnessList,
  type ProjectPaths,
} from "./project.js";
