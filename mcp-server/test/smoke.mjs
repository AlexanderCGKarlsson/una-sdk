import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

const child = spawn(process.execPath, ["dist/stdio.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    UNA_MCP_ENDPOINT: "https://mcp.unafamily.app/",
    UNA_AGENT_TOKEN: "smoke-test-token",
    UNA_AGENT_PRIVATE_KEY_JWK: JSON.stringify({ d: "not-used-by-discovery" }),
    UNA_AGENT_KEY_ID: "una-smoke-test",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

const lines = createInterface({ input: child.stdout });
const responses = new Map();
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id !== undefined) responses.set(message.id, message);
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "una-smoke", version: "1.0.0" },
  },
});
await waitFor(1);
send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const listed = await waitFor(2);
assert.ok(listed.result.tools.some((tool) => tool.name === "una_doctor"));
assert.ok(listed.result.tools.some((tool) => tool.name === "una_list_calendar_events"));

child.kill("SIGINT");
await Promise.race([once(child, "exit"), timeout(2_000)]);
console.log("Una MCP stdio smoke test passed.");

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function waitFor(id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (responses.has(id)) return responses.get(id);
    await timeout(20);
  }
  throw new Error(`Timed out waiting for MCP response ${id}`);
}

function timeout(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
