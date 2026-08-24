import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadUnaRuntimeConfig } from "./config.js";
import { createUnaMcpServer } from "./server.js";

const config = loadUnaRuntimeConfig();
const handle = serveStdio(() => createUnaMcpServer(config));

console.error("Una MCP v2 server is listening on stdio.");

process.on("SIGINT", () => {
  void handle.close().finally(() => process.exit(0));
});
