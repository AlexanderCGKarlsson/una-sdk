# Una local MCP adapter

Optional private MCP adapter backed by `UnaConnectionKit`. Una's hosted
encrypted endpoint remains `https://mcp.unafamily.app/`; this adapter runs only
inside the assistant operator's trusted boundary so it can expose locally
decrypted `una_*` tools.

- `src/server.ts` registers the shared `una_*` tools.
- `src/stdio.ts` serves local MCP hosts over stdio.
- `src/http.ts` serves bearer-protected MCP at loopback `/mcp`.
- `src/keygen.ts` generates the P-256 connection key without printing the
  private key.

The adapter uses official upstream `@modelcontextprotocol/server` v2. It has no
Cloudflare, Durable Object, or Agents SDK dependency.

Build from the parent repository:

```bash
npm install
npm run build
npm --prefix mcp-server install
npm run build:mcp
```

This is not intended to be deployed as a shared central decryption service.
See the parent `README.md` for pairing, secrets, host configuration, access
semantics, and the distinction between the private stdio process, the optional
HTTP bridge token, and Una's upstream bearer token.
