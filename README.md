# Una SDK

Agentic capabilities for [Una](https://unafamily.app), the privacy-first family
planner.

Una SDK lets trusted AI assistants work with the family information a user
explicitly grants, including people, calendars, and lists.

With the right permissions, an assistant can:

- Understand family schedules and find free time.
- Read permitted event details.
- Work with selected lists, recipes, and URLs.
- Add or complete list items.
- Create permitted family calendar events.

Una remains privacy-first. Household content stays end-to-end encrypted, while
private keys and decrypted content remain inside the user's trusted assistant
runtime. Una's hosted MCP endpoint at
[`https://unafamily.app/mcp`](https://unafamily.app/mcp) never decrypts
household content.

Integrate with `SKILL.md` alone, use the optional TypeScript SDK, or run the
local MCP adapter.

## Choose how to integrate

### SKILL.md only

Give [`SKILL.md`](./SKILL.md) to the assistant. It contains the endpoint,
bearer request shape, pairing flow, UDW1 unwrap contract, access semantics, and
diagnostics needed to build a small runtime integration without installing this
package.

This is the minimum integration. The assistant still needs trusted runtime code
and secret storage; cryptography must not run in the language-model prompt.

### SDK helper

After the npm release, install `@unafamily/una-sdk` in the trusted runtime for
tested key generation, key unwrap, decryption, encryption, diagnostics, and
typed tools:

```bash
npm install @unafamily/una-sdk
```

```ts
import { UnaConnectionKit } from "@unafamily/una-sdk";

const una = new UnaConnectionKit({
  endpoint: "https://unafamily.app/mcp",
  token: process.env.UNA_AGENT_TOKEN!,
  privateKeyJwk: JSON.parse(process.env.UNA_AGENT_PRIVATE_KEY_JWK!),
  publicKeyId: process.env.UNA_AGENT_KEY_ID!,
});

await una.connect();
const events = await una.calendar.listEvents({ start, end });
```

### Optional local MCP adapter

The private adapter in [`mcp-server`](./mcp-server) is for hosts that prefer
local MCP tools. It exposes plaintext-friendly `una_*` tools after decrypting
inside the local process. It is not a second hosted Una service and is not
required for direct SDK or `SKILL.md` integrations.

The adapter uses the official MCP v2 packages and supports stdio plus a
loopback-only bearer-protected HTTP bridge.

## Pairing

Build the repository and generate a connection key:

```bash
npm ci
npm run build
npm --prefix mcp-server ci
npm run build:mcp
npm --prefix mcp-server run keygen
```

The command creates `una-agent-private-key.jwk` with owner-only permissions and
prints two safe values:

- `Public key value`: paste only its value into Una.
- `Key ID`: paste the matching id into Una.

Do not paste `UNA_AGENT_PUBLIC_KEY=<value>` into the public-key field. Never
send the private JWK to Una or place it in a prompt.

In Una, create the assistant connection, select capabilities, grant only the
needed people and lists, enter the public key value and key id, and save. Una
prepares eligible existing content before activating access. New content in a
granted assistant-readable list uses the assistant-readable key automatically.
If a repair skips an item, Una reports it so the user can recreate or re-save
that item without blocking the rest of the list.

## Runtime configuration

The SDK or local adapter reads:

- `UNA_MCP_ENDPOINT` — normally `https://unafamily.app/mcp`.
- `UNA_AGENT_TOKEN` — the Una connection bearer token.
- `UNA_AGENT_PRIVATE_KEY_JWK` — the generated private JWK JSON.
- `UNA_AGENT_KEY_ID` — its matching key id.

The outbound request is HTTPS with
`Authorization: Bearer <UNA_AGENT_TOKEN>`. Store all four values in runtime
configuration, not source, prompts, logs, screenshots, or analytics.

## Local MCP adapter

For stdio, configure the MCP host to launch:

```bash
node /absolute/path/to/una-sdk/mcp-server/dist/stdio.js
```

Supply the four values above through the host's secret configuration. Start by
calling `una_doctor`.

For the optional local HTTP bridge, set a separate `UNA_BRIDGE_TOKEN` and run:

```bash
npm --prefix mcp-server run start:http
```

It binds to `http://127.0.0.1:3000/mcp`. The MCP client authenticates to that
local bridge with `UNA_BRIDGE_TOKEN`; the bridge authenticates upstream to Una
with the different `UNA_AGENT_TOKEN`. Host and Origin are restricted to
loopback.

## Access behavior

- Calendar availability reveals time blocks only.
- Event details require the Event details capability and Read grants covering
  every profile assigned to a shared event.
- Personal events remain private.
- An event involving any ungranted profile remains timing-only.
- People Read grants never imply write permission.
- Lists and list items are readable only when explicitly granted and converted
  to assistant-readable encryption.

## Cryptography

`UnaConnectionKit` implements the complete UDW1 contract: P-256 ECDH,
HKDF-SHA256 with salt `UnaDeviceWrap.v1`, empty info, no AES-GCM AAD, a 12-byte
nonce, and a 16-byte tag. Payloads use AES-256-GCM and UTF-8 JSON. See
`SKILL.md` for the exact layout required by SDK-free runtimes.

## Verify before publishing

```bash
npm ci
npm --prefix mcp-server ci
npm run test:all
npm run audit:release
```

The release audit checks package contents, rejects source maps and secret file
types, and scans for common embedded credentials or deployment URLs.

Licensed under Apache-2.0.
