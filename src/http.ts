#!/usr/bin/env node

import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createEducationScopeServer } from "./server.js";

const mcpHandler = createMcpHandler(() => createEducationScopeServer());
const handleMcpRequest = toNodeHandler(mcpHandler, {
  onerror(error) {
    console.error("MCP HTTP adapter error:", error);
  },
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const httpServer = createServer((req, res) => {
  const base = `http://${req.headers.host ?? "localhost"}`;
  const pathname = new URL(req.url ?? "/", base).pathname;

  if (pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        service: "education-scope-mcp",
        version: "0.1.0",
        mcp: "/mcp",
      }),
    );
    return;
  }

  if (pathname !== "/mcp") {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found", mcp: "/mcp" }));
    return;
  }

  void handleMcpRequest(req, res);
});

httpServer.listen(port, host, () => {
  console.error(
    `education-scope-mcp 0.1.0 listening on http://${host}:${port}/mcp`,
  );
});

async function shutdown(signal: string) {
  console.error(`Received ${signal}; shutting down.`);
  httpServer.close();
  await mcpHandler.close();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
