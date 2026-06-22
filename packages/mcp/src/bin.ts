#!/usr/bin/env node
import { startMcpServer } from "./server.js";

startMcpServer().catch((error: unknown) => {
  console.error("RunCanon MCP server failed:", error);
  process.exit(1);
});
