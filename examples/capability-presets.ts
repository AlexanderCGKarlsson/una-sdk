import {
  UnaMcpClient,
  agentReadablePayloadFields,
  createUnaIdempotencyKey,
  getUnaCapabilityPreset,
  missingScopesForPreset,
  type ListItemPayload,
  type UnaCryptoAdapter,
} from "@unafamily/una-sdk";

const unaCrypto: UnaCryptoAdapter = {
  async unwrapAgentReadableKey(_wrappedKey) {
    throw new Error("Implement unwrapAgentReadableKey in your runtime.");
  },
  async decryptAgentReadableJson<T>(_record) {
    throw new Error("Implement decryptAgentReadableJson in your runtime.");
  },
  async encryptAgentReadableJson(_payload) {
    throw new Error("Implement encryptAgentReadableJson in your runtime.");
  },
};

const una = new UnaMcpClient({
  endpoint: requireEnv("UNA_MCP_ENDPOINT"),
  token: requireEnv("UNA_AGENT_TOKEN"),
});

async function main() {
  const preset = getUnaCapabilityPreset("listHelper");
  const context = await una.agent.getContext();
  const missingScopes = missingScopesForPreset(context, preset);

  if (missingScopes.length > 0) {
    throw new Error(
      `${preset.title} is missing scopes: ${missingScopes.join(", ")}`,
    );
  }

  for (const wrappedKey of await una.crypto.listWrappedKeys()) {
    await unaCrypto.unwrapAgentReadableKey(wrappedKey);
  }

  const lists = await una.lists.listLists();
  const writableList = lists.find((list) => list.access === "write");
  if (!writableList) {
    throw new Error(`${preset.title} needs a granted writable list.`);
  }

  const items = await una.lists.listItems({ listId: writableList.id });
  const encryptedMatch = items.find((item) => item.checkedAt === null);
  if (!encryptedMatch) {
    throw new Error("No open granted list item is available.");
  }

  const payload = await unaCrypto.decryptAgentReadableJson<ListItemPayload>(
    agentReadablePayloadFields(encryptedMatch, "list item"),
  );
  if (!payload.name.trim()) {
    throw new Error("Matched list item did not have a usable name.");
  }

  await una.lists.setItemChecked(
    { itemId: encryptedMatch.id, checked: true },
    {
      idempotencyKey: createUnaIdempotencyKey("lists.set_item_checked", [
        encryptedMatch.id,
        "checked",
      ]),
    },
  );
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
