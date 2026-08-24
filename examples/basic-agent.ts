import {
  UnaConnectionKit,
  createUnaIdempotencyKey,
  isReadableUnaResult,
} from "@unafamily/una-sdk";

const una = new UnaConnectionKit({
  endpoint: requireEnv("UNA_MCP_ENDPOINT"),
  token: requireEnv("UNA_AGENT_TOKEN"),
  privateKeyJwk: JSON.parse(requireEnv("UNA_AGENT_PRIVATE_KEY_JWK")),
  publicKeyId: requireEnv("UNA_AGENT_KEY_ID"),
});

async function main() {
  const diagnostics = await una.connect();
  const context = diagnostics.context!;
  const lists = await una.lists.listLists();
  const shoppingList = lists.find(
    (list) =>
      list.kind === "shopping" &&
      list.access === "write" &&
      isReadableUnaResult(list),
  );
  if (!shoppingList) {
    throw new Error("No readable writable shopping list is granted.");
  }

  const items = await una.lists.listItems(shoppingList.id);
  const matches = items.filter(
    (item) =>
      isReadableUnaResult(item) &&
      item.payload.name.toLocaleLowerCase() === "spaghetti",
  );
  if (matches.length !== 1) {
    throw new Error("Expected one item match; ask the user when ambiguous.");
  }

  const itemId = matches[0].id;
  await una.raw.lists.setItemChecked(
    { itemId, checked: true },
    {
      idempotencyKey: createUnaIdempotencyKey("lists.set_item_checked", [
        itemId,
        true,
      ]),
    },
  );

  const actingPersonId =
    context.connection.actingOnBehalfOfPersonProfileId;
  if (!actingPersonId) return;

  const startTime = Date.now() + 24 * 60 * 60 * 1000;
  await una.calendar.createEvent(
    {
      startTime,
      endTime: startTime + 60 * 60 * 1000,
      allDay: false,
      personProfileIds: [actingPersonId],
      visibility: "household",
      payload: {
        title: "Spaghetti dinner",
        linkedListIds: [shoppingList.id],
        linkedItemIds: [itemId],
      },
    },
    {
      idempotencyKey: createUnaIdempotencyKey("calendar.create_event", [
        actingPersonId,
        new Date(startTime).toISOString(),
      ]),
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

void main();
