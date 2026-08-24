import {
  UnaConfigurationError,
  UnaHttpError,
  UnaMcpError,
} from "./errors.js";
import type {
  AgentConnectionContext,
  CalendarCreateEventArgs,
  CalendarEventSummary,
  CalendarFindFreeSlotsArgs,
  CalendarFreeSlot,
  CalendarGetEventArgs,
  CalendarUpdateEventArgs,
  FetchLike,
  ListBulkAddItemsArgs,
  ListBulkAddItemsResult,
  ListCreateArgs,
  ListBulkSetItemsCheckedArgs,
  ListBulkSetItemsCheckedResult,
  ListItemAddArgs,
  ListItemSummary,
  ListItemUpdateArgs,
  ListItemsArgs,
  ListItemCheckedResult,
  ListSetItemCheckedArgs,
  ListUpdateArgs,
  McpCapabilityManifest,
  McpEnvelope,
  McpRequestOptions,
  PersonProfileSummary,
  SharedListSummary,
  UnaMcpClientOptions,
  WrappedAgentReadableKey,
} from "./types.js";

type CallOptions = McpRequestOptions & {
  authRequired?: boolean;
};

export class UnaMcpClient {
  readonly endpoint: URL;
  private readonly token?: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: UnaMcpClientOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.token = options.token;
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);

    if (!fetchImpl) {
      throw new UnaConfigurationError(
        "No fetch implementation is available. Pass options.fetch in this runtime.",
      );
    }
    this.fetchImpl = fetchImpl;
  }

  readonly system = {
    manifest: (options: McpRequestOptions = {}) =>
      this.callTool<McpCapabilityManifest>("system.manifest", {}, {
        ...options,
        authRequired: false,
      }),
  };

  readonly agent = {
    getContext: (options: McpRequestOptions = {}) =>
      this.callTool<AgentConnectionContext>("agent.get_context", {}, options),
  };

  readonly crypto = {
    listWrappedKeys: (options: McpRequestOptions = {}) =>
      this.callTool<WrappedAgentReadableKey[]>(
        "crypto.list_wrapped_keys",
        {},
        options,
      ),
  };

  readonly people = {
    listProfiles: (options: McpRequestOptions = {}) =>
      this.callTool<PersonProfileSummary[]>(
        "people.list_profiles",
        {},
        options,
      ),
  };

  readonly calendar = {
    listEvents: (
      args: {
        start: number;
        end: number;
        personProfileId?: string;
        limit?: number;
      },
      options: McpRequestOptions = {},
    ) =>
      this.callTool<CalendarEventSummary[]>(
        "calendar.list_events",
        args,
        options,
      ),

    getEvent: (
      args: CalendarGetEventArgs,
      options: McpRequestOptions = {},
    ) =>
      this.callTool<CalendarEventSummary>("calendar.get_event", args, options),

    findFreeSlots: (
      args: CalendarFindFreeSlotsArgs,
      options: McpRequestOptions = {},
    ) =>
      this.callTool<CalendarFreeSlot[]>(
        "calendar.find_free_slots",
        args,
        options,
      ),

    createEvent: (
      args: CalendarCreateEventArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<string>("calendar.create_event", args, options),

    updateEvent: (
      args: CalendarUpdateEventArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<{ id: string }>(
        "calendar.update_event",
        args,
        options,
      ),

    deleteEvent: (
      args: CalendarGetEventArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<{ ok: true }>(
        "calendar.delete_event",
        args,
        options,
      ),
  };

  readonly lists = {
    listLists: (options: McpRequestOptions = {}) =>
      this.callTool<SharedListSummary[]>("lists.list_lists", {}, options),

    listItems: (
      args: ListItemsArgs,
      options: McpRequestOptions = {},
    ) => this.callTool<ListItemSummary[]>("lists.list_items", args, options),

    createList: (
      args: ListCreateArgs,
      options: McpRequestOptions,
    ) => this.callWriteTool<{ id: string }>("lists.create_list", args, options),

    updateList: (
      args: ListUpdateArgs,
      options: McpRequestOptions,
    ) => this.callWriteTool<{ id: string }>("lists.update_list", args, options),

    addItem: (
      args: ListItemAddArgs,
      options: McpRequestOptions,
    ) => this.callWriteTool<string>("lists.add_item", args, options),

    bulkAddItems: (
      args: ListBulkAddItemsArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<ListBulkAddItemsResult>(
        "lists.bulk_add_items",
        args,
        options,
      ),

    updateItem: (
      args: ListItemUpdateArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<{ id: string }>(
        "lists.update_item",
        args,
        options,
      ),

    setItemChecked: (
      args: ListSetItemCheckedArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<ListItemCheckedResult>(
        "lists.set_item_checked",
        args,
        options,
      ),

    bulkSetItemsChecked: (
      args: ListBulkSetItemsCheckedArgs,
      options: McpRequestOptions,
    ) =>
      this.callWriteTool<ListBulkSetItemsCheckedResult>(
        "lists.bulk_set_items_checked",
        args,
        options,
      ),
  };

  async getManifest(): Promise<McpCapabilityManifest> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    return await readMcpResponse<McpCapabilityManifest>(response);
  }

  async callTool<T>(
    tool: string,
    args: unknown = {},
    options: CallOptions = {},
  ): Promise<T> {
    const authRequired = options.authRequired ?? true;
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };

    if (authRequired) {
      if (!this.token) {
        throw new UnaConfigurationError(
          `Tool ${tool} requires an Una agent bearer token.`,
        );
      }
      headers.authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      signal: options.signal,
      body: JSON.stringify({
        tool,
        arguments: args,
        requestId: options.requestId,
        idempotencyKey: options.idempotencyKey,
      }),
    });

    return await readMcpResponse<T>(response);
  }

  private async callWriteTool<T>(
    tool: string,
    args: unknown,
    options: McpRequestOptions,
  ): Promise<T> {
    if (!options?.idempotencyKey) {
      throw new UnaConfigurationError(
        `Tool ${tool} is side-effecting and requires options.idempotencyKey.`,
      );
    }
    return await this.callTool<T>(tool, args, options);
  }
}

async function readMcpResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as
    | McpEnvelope<T>
    | null;

  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new UnaHttpError(
      response.status,
      `Una returned a non-MCP response with HTTP ${response.status}.`,
    );
  }

  if (!response.ok && body.ok) {
    throw new UnaHttpError(
      response.status,
      `Una returned HTTP ${response.status}.`,
    );
  }

  if (!body.ok) {
    throw new UnaMcpError(
      body.error.code,
      body.error.message,
      response.status,
      body.requestId,
    );
  }

  return body.result;
}

function normalizeEndpoint(endpoint: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new UnaConfigurationError(`Invalid Una MCP endpoint: ${endpoint}`);
  }
  if (parsed.username || parsed.password) {
    throw new UnaConfigurationError(
      "Una MCP endpoints must not contain credentials. Use the bearer token option.",
    );
  }
  const loopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new UnaConfigurationError(
      "Una MCP endpoints must use HTTPS. Plain HTTP is allowed only on loopback.",
    );
  }
  parsed.hash = "";
  return parsed;
}
