import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UnaConfigurationError,
  UnaHttpError,
  UnaMcpClient,
} from "../dist/index.js";

test("requires HTTPS except for loopback development", () => {
  assert.throws(
    () => new UnaMcpClient({ endpoint: "http://example.com/mcp" }),
    (error) =>
      error instanceof UnaConfigurationError &&
      error.message.includes("must use HTTPS"),
  );
  assert.doesNotThrow(
    () => new UnaMcpClient({ endpoint: "http://127.0.0.1:3000/mcp" }),
  );
  assert.throws(
    () => new UnaMcpClient({ endpoint: "https://token@example.com/mcp" }),
    (error) =>
      error instanceof UnaConfigurationError &&
      error.message.includes("must not contain credentials"),
  );
});

test("does not retain an unexpected response body on HTTP errors", async () => {
  const client = new UnaMcpClient({
    endpoint: "https://unafamily.app/mcp",
    fetch: async () =>
      new Response(JSON.stringify({ privateContent: "do-not-retain" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    client.system.manifest(),
    (error) =>
      error instanceof UnaHttpError &&
      !Object.hasOwn(error, "body") &&
      !error.message.includes("do-not-retain"),
  );
});
