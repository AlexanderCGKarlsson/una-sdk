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
    endpoint: "https://mcp.unafamily.app/",
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

test("rejects unsupported or oversized calendar list queries locally", () => {
  const client = new UnaMcpClient({
    endpoint: "https://mcp.unafamily.app/",
    token: "test-token",
    fetch: async () => {
      throw new Error("calendar validation should run before fetch");
    },
  });
  const start = Date.UTC(2026, 0, 1);

  assert.throws(
    () => client.calendar.listEvents({
        start,
        end: start + 46 * 24 * 60 * 60 * 1000,
      }),
    (error) =>
      error instanceof UnaConfigurationError &&
      error.message.includes("at most 45 days"),
  );
  assert.throws(
    () => client.calendar.listEvents({
        start,
        end: start + 24 * 60 * 60 * 1000,
        personProfileId: "unsupported",
      }),
    (error) =>
      error instanceof UnaConfigurationError &&
      error.message.includes("personProfileId is not supported"),
  );
});
