import { McpServer } from "@modelcontextprotocol/server";
import {
  UnaConnectionKit,
  type UnaConnectionKitOptions,
} from "@unafamily/una-sdk";
import { z } from "zod/v4";
import type { UnaRuntimeConfig } from "./config.js";

export function createUnaMcpServer(config: UnaRuntimeConfig): McpServer {
  const server = new McpServer({
    name: "una-private-connection",
    version: "0.1.0",
  });

  server.registerTool(
    "una_doctor",
    {
      description:
        "Check Una endpoint, bearer token, public-key pairing, wrapped keys, and local key unwrap. Run this first after setup or when readable details fail.",
    },
    async () => toolResult(await createKit(config).doctor()),
  );

  server.registerTool(
    "una_get_connection_context",
    {
      description:
        "Inspect this connection's capabilities, scopes, people grants, and list grants. Use this to explain why an operation or event detail is unavailable; never infer broader household access.",
    },
    async () => toolResult(await createKit(config).raw.agent.getContext()),
  );

  server.registerTool(
    "una_list_people",
    {
      description:
        "List only the people granted to this Una connection. Read access does not mean write access. Protected details are explicitly marked busy_only or unavailable.",
    },
    async () => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.people.listProfiles());
    },
  );

  server.registerTool(
    "una_list_calendar_events",
    {
      description:
        "List granted calendar blocks. Readable household events include locally decrypted payloads. Personal events and events involving an ungranted person return timing only with detailStatus busy_only.",
      inputSchema: z.object({
        start: z.number().describe("Inclusive Unix time in milliseconds."),
        end: z.number().describe("Exclusive Unix time in milliseconds."),
        personProfileId: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      }),
    },
    async (args) => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.calendar.listEvents(args));
    },
  );

  server.registerTool(
    "una_get_calendar_event",
    {
      description:
        "Read one granted calendar event by id, including its locally decrypted payload only when event-detail access and every assigned-person grant allow it.",
      inputSchema: z.object({ eventId: z.string() }),
    },
    async ({ eventId }) => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.calendar.getEvent(eventId));
    },
  );

  server.registerTool(
    "una_find_free_slots",
    {
      description:
        "Find free time for granted people. This uses timing blocks and does not reveal protected event names or notes.",
      inputSchema: z.object({
        start: z.number(),
        end: z.number(),
        durationMinutes: z.number().int().positive(),
        personProfileIds: z.array(z.string()).optional(),
        constraints: z
          .object({
            dayStartMinutes: z.number().int().min(0).max(1439).optional(),
            dayEndMinutes: z.number().int().min(1).max(1440).optional(),
            weekdays: z.array(z.number().int().min(0).max(6)).optional(),
          })
          .optional(),
      }),
    },
    async (args) =>
      toolResult(await createKit(config).raw.calendar.findFreeSlots(args)),
  );

  server.registerTool(
    "una_create_calendar_event",
    {
      description:
        "Create an assistant-readable Una event using an explicit writable person selection. The trusted server encrypts the plaintext payload locally before calling Una.",
      inputSchema: z.object({
        startTime: z.number(),
        endTime: z.number(),
        allDay: z.boolean(),
        personProfileIds: z.array(z.string()).min(1),
        visibility: z.enum(["household", "personal"]).optional(),
        recurrenceRule: z.string().optional(),
        reminderMinutesBefore: z.number().int().nonnegative().optional(),
        payload: z.object({
          title: z.string().min(1),
          emoji: z.string().optional(),
          notes: z.string().optional(),
          location: z.string().optional(),
          url: z.string().url().optional(),
          linkedListIds: z.array(z.string()).optional(),
          linkedItemIds: z.array(z.string()).optional(),
        }),
        idempotencyKey: z.string().min(1).max(160),
      }),
    },
    async ({ idempotencyKey, ...args }) => {
      const kit = await createReadableKit(config);
      return toolResult(
        await kit.calendar.createEvent(args, { idempotencyKey }),
      );
    },
  );

  server.registerTool(
    "una_list_lists",
    {
      description:
        "List only the Una lists granted to this connection, including each grant's read or write access and locally decrypted list name when available.",
    },
    async () => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.lists.listLists());
    },
  );

  server.registerTool(
    "una_list_items",
    {
      description:
        "List visible items in one granted Una list with locally decrypted payloads. Items skipped during access repair may remain unavailable.",
      inputSchema: z.object({ listId: z.string() }),
    },
    async ({ listId }) => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.lists.listItems(listId));
    },
  );

  server.registerTool(
    "una_create_list",
    {
      description:
        "Create an assistant-readable Una list when the connection has list-creation capability. The server encrypts the plaintext name locally.",
      inputSchema: z.object({
        payload: z.object({
          name: z.string().min(1),
          emoji: z.string().optional(),
        }),
        kind: z.enum(["shopping", "todo", "chores", "notes"]).optional(),
        assignedPersonProfileId: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
        idempotencyKey: z.string().min(1).max(160),
      }),
    },
    async ({ idempotencyKey, ...args }) => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.lists.createList(args, { idempotencyKey }));
    },
  );

  server.registerTool(
    "una_add_list_item",
    {
      description:
        "Add an item to a specifically selected writable list. The trusted server encrypts the plaintext payload locally before calling Una.",
      inputSchema: z.object({
        listId: z.string(),
        sortOrder: z.number(),
        assignedPersonProfileIds: z.array(z.string()).optional(),
        dueAt: z.number().optional(),
        dueAllDay: z.boolean().optional(),
        reminderMinutesBefore: z.number().int().nonnegative().optional(),
        payload: z.object({
          name: z.string().min(1),
          url: z.string().url().optional(),
          notes: z.string().optional(),
        }),
        idempotencyKey: z.string().min(1).max(160),
      }),
    },
    async ({ idempotencyKey, ...args }) => {
      const kit = await createReadableKit(config);
      return toolResult(await kit.lists.addItem(args, { idempotencyKey }));
    },
  );

  server.registerTool(
    "una_set_list_item_checked",
    {
      description:
        "Mark or unmark one already-resolved Una list item. Ask the user when more than one item matches; never use delete for a mark-complete request.",
      inputSchema: z.object({
        itemId: z.string(),
        checked: z.boolean(),
        idempotencyKey: z.string().min(1).max(160),
      }),
    },
    async ({ itemId, checked, idempotencyKey }) => {
      const kit = createKit(config);
      return toolResult(
        await kit.raw.lists.setItemChecked(
          { itemId, checked },
          { idempotencyKey },
        ),
      );
    },
  );

  return server;
}

function createKit(config: UnaRuntimeConfig): UnaConnectionKit {
  const options: UnaConnectionKitOptions = {
    endpoint: config.endpoint,
    token: config.token,
    privateKeyJwk: config.privateKeyJwk,
    publicKeyId: config.publicKeyId,
  };
  return new UnaConnectionKit(options);
}

async function createReadableKit(
  config: UnaRuntimeConfig,
): Promise<UnaConnectionKit> {
  const kit = createKit(config);
  await kit.loadAgentReadableKeys();
  return kit;
}

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value),
      },
    ],
    structuredContent: { result: value },
  };
}
