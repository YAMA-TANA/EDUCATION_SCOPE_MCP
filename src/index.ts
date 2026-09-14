#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createEducationScopeServer } from "./server.js";

async function main() {
  const server = createEducationScopeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("education-scope-mcp 0.2.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
