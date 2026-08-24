export type UnaRuntimeConfig = {
  endpoint: string;
  token: string;
  privateKeyJwk: JsonWebKey;
  publicKeyId: string;
};

export function loadUnaRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): UnaRuntimeConfig {
  return {
    endpoint: requireEnv(env, "UNA_MCP_ENDPOINT"),
    token: requireEnv(env, "UNA_AGENT_TOKEN"),
    privateKeyJwk: parsePrivateKey(
      requireEnv(env, "UNA_AGENT_PRIVATE_KEY_JWK"),
    ),
    publicKeyId: requireEnv(env, "UNA_AGENT_KEY_ID"),
  };
}

export function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePrivateKey(value: string): JsonWebKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("UNA_AGENT_PRIVATE_KEY_JWK must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !("d" in parsed)) {
    throw new Error("UNA_AGENT_PRIVATE_KEY_JWK is not a private JWK.");
  }
  return parsed as JsonWebKey;
}
