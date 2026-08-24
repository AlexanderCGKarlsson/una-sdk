import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadUnaRuntimeConfig, requireEnv } from "./config.js";
import { createUnaMcpServer } from "./server.js";

const config = loadUnaRuntimeConfig();
const bridgeToken = requireEnv(process.env, "UNA_BRIDGE_TOKEN");
const port = readPort(process.env.UNA_MCP_HTTP_PORT);
const mcpHandler = createMcpHandler(() => createUnaMcpServer(config), {
  legacy: "stateless",
  responseMode: "json",
});
const nodeHandler = toNodeHandler(mcpHandler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const httpServer = createServer((request, response) => {
  if (!validateHost(request, response) || !validateOrigin(request, response)) {
    return;
  }
  if (requestPath(request.url) !== "/mcp") {
    response.writeHead(404).end("Not found");
    return;
  }
  if (!hasValidBridgeToken(request.headers.authorization, bridgeToken)) {
    response.writeHead(401, { "www-authenticate": "Bearer" }).end("Unauthorized");
    return;
  }
  void nodeHandler(request, response);
});

httpServer.listen(port, "127.0.0.1", () => {
  console.error(`Una MCP v2 server is listening on http://127.0.0.1:${port}/mcp`);
});

process.on("SIGINT", () => {
  httpServer.close(() => {
    void mcpHandler.close().finally(() => process.exit(0));
  });
});

function hasValidBridgeToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  const providedHash = createHash("sha256")
    .update(authorization ?? "")
    .digest();
  const expectedHash = createHash("sha256")
    .update(`Bearer ${expectedToken}`)
    .digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function requestPath(url: string | undefined): string {
  return new URL(url ?? "/", "http://127.0.0.1").pathname;
}

function readPort(value: string | undefined): number {
  if (!value) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("UNA_MCP_HTTP_PORT must be an integer from 1 through 65535.");
  }
  return port;
}
