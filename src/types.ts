export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Base64String = string;
export type MillisecondsSinceEpoch = number;
export type UnaId = string;

export type UnaMcpClientOptions = {
  endpoint: string;
  token?: string;
  fetch?: FetchLike;
};

export type McpRequestOptions = {
  requestId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type McpSuccessEnvelope<T> = {
  ok: true;
  result: T;
  requestId?: string;
};

export type McpErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
};

export type McpEnvelope<T> = McpSuccessEnvelope<T> | McpErrorEnvelope;

export type McpCapabilityManifest = {
  protocolVersion: number;
  name: string;
  description: string;
  endpoint: string;
  endpointAliases: string[];
  mcp?: Record<string, unknown>;
  authentication: Record<string, unknown>;
  idempotency: Record<string, unknown>;
  maxRequestBytes: number;
  rateLimits: Record<string, unknown>;
  response?: Record<string, unknown>;
  encryptedPayloads?: Record<string, unknown>;
  toolPolicy?: Record<string, unknown>;
  tools: Array<{
    name: string;
    aliases?: string[];
    description: string;
    authRequired: boolean;
    scopes: string[];
    sideEffects: boolean;
    policy?: {
      risk: string;
      dataClasses: string[];
      plaintextHouseholdContent: boolean;
      encryptedHouseholdContent: boolean;
      requiresResourceGrant: boolean;
      requiresUserConfiguredConnection: boolean;
      requiresIdempotencyKey: boolean;
    };
    inputSchema: Record<string, unknown>;
  }>;
};

export type AgentReadablePayloadFields = {
  keyKind: "agentReadableContent";
  keyVersion: number;
  payloadCiphertext: Base64String;
  payloadNonce: Base64String;
};

export type CalendarEventPayload = {
  title: string;
  emoji?: string;
  notes?: string;
  location?: string;
  url?: string;
  linkedListIds?: UnaId[];
  linkedItemIds?: UnaId[];
};

export type SharedListPayload = {
  name: string;
  emoji?: string;
};

export type ListItemPayload = {
  name: string;
  url?: string;
  notes?: string;
};

export type WrappedAgentReadableKey = {
  keyKind: "agentReadableContent";
  keyVersion: number;
  ciphertext: Base64String;
  publicKeyAlgorithm: string | null;
  publicKeyId: string | null;
};

export type UnaCryptoAdapter = {
  unwrapAgentReadableKey(
    wrappedKey: WrappedAgentReadableKey,
  ): Promise<void>;
  decryptAgentReadableJson<T>(
    record: AgentReadablePayloadFields,
  ): Promise<T>;
  encryptAgentReadableJson(
    payload: unknown,
  ): Promise<AgentReadablePayloadFields>;
};

export type AgentConnectionContext = {
  protocolVersion: number;
  connection: {
    id: UnaId;
    status: string;
    ownerMemberId: UnaId;
    clientName: string | null;
    clientVendor: string | null;
    publicKeyAlgorithm: string | null;
    publicKeyId: string | null;
    scopes: string[];
    actingOnBehalfOfPersonProfileId: UnaId | null;
  };
  grants: {
    people: Array<{
      personProfileId: UnaId;
      access: "read" | "write";
    }>;
    lists: ListGrantSummary[];
  };
  nextSteps: Array<{
    tool: string;
    reason: string;
  }>;
};

export type ListGrantSummary = {
  listId: UnaId;
  kind: "shopping" | "todo" | "chores" | "notes" | null;
  legacy: boolean;
  access: "read" | "write";
  agentAccess: "agentReadable";
};

export type PersonProfileSummary = {
  id: UnaId;
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  color?: string | null;
  sortOrder?: number | null;
};

export type CalendarEventSummary = {
  id: UnaId;
  startTime: MillisecondsSinceEpoch;
  endTime: MillisecondsSinceEpoch;
  allDay: boolean;
  recurrenceRule?: string | null;
  visibility?: "household" | "personal";
  agentAccess: "busy" | "agentReadable";
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
};

export type CalendarGetEventArgs = {
  eventId: UnaId;
};

export type CalendarFindFreeSlotsArgs = {
  start: MillisecondsSinceEpoch;
  end: MillisecondsSinceEpoch;
  durationMinutes: number;
  personProfileIds?: UnaId[];
  constraints?: {
    dayStartMinutes?: number;
    dayEndMinutes?: number;
    weekdays?: number[];
  };
};

export type CalendarFreeSlot = {
  startTime: MillisecondsSinceEpoch;
  endTime: MillisecondsSinceEpoch;
  personProfileIds: UnaId[];
};

export type CalendarCreateEventArgs = AgentReadablePayloadFields & {
  startTime: MillisecondsSinceEpoch;
  endTime: MillisecondsSinceEpoch;
  allDay: boolean;
  personProfileIds: UnaId[];
  agentAccess: "busy" | "agentReadable";
  visibility?: "household" | "personal";
  recurrenceRule?: string;
  reminderMinutesBefore?: number;
};

export type CalendarUpdateEventArgs = {
  eventId: UnaId;
  startTime?: MillisecondsSinceEpoch;
  endTime?: MillisecondsSinceEpoch;
  allDay?: boolean;
  personProfileIds?: UnaId[];
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  agentAccess?: "busy" | "agentReadable";
  visibility?: "household" | "personal";
  recurrenceRule?: string | null;
  reminderMinutesBefore?: number | null;
};

export type SharedListSummary = {
  id: UnaId;
  kind: "shopping" | "todo" | "chores" | "notes" | null;
  legacy: boolean;
  access: "read" | "write";
  agentAccess: "agentReadable";
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  assignedPersonProfileId?: UnaId | null;
  sortOrder?: number | null;
  createdAt: MillisecondsSinceEpoch;
  updatedAt: MillisecondsSinceEpoch;
};

export type ListCreateArgs = AgentReadablePayloadFields & {
  kind?: "shopping" | "todo" | "chores" | "notes";
  assignedPersonProfileId?: UnaId | null;
  sortOrder?: number;
};

export type ListUpdateArgs = {
  listId: UnaId;
  kind?: "shopping" | "todo" | "chores" | "notes";
  assignedPersonProfileId?: UnaId | null;
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  sortOrder?: number;
};

export type ListItemsArgs = {
  listId: UnaId;
};

export type ListItemSummary = {
  id: UnaId;
  listId: UnaId;
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  sortOrder: number;
  checkedAt?: MillisecondsSinceEpoch | null;
  assignedPersonProfileIds?: UnaId[];
  dueAt?: MillisecondsSinceEpoch | null;
  dueAllDay?: boolean | null;
  reminderMinutesBefore?: number | null;
  createdAt: MillisecondsSinceEpoch;
  updatedAt: MillisecondsSinceEpoch;
};

export type ListItemAddArgs = AgentReadablePayloadFields & {
  listId: UnaId;
  sortOrder: number;
  assignedPersonProfileIds?: UnaId[];
  dueAt?: MillisecondsSinceEpoch;
  dueAllDay?: boolean;
  reminderMinutesBefore?: number;
};

export type ListBulkAddItemsArgs = {
  listId: UnaId;
  items: Array<
    AgentReadablePayloadFields & {
      sortOrder: number;
      assignedPersonProfileIds?: UnaId[];
      dueAt?: MillisecondsSinceEpoch;
      dueAllDay?: boolean;
      reminderMinutesBefore?: number;
    }
  >;
};

export type ListItemUpdateArgs = {
  itemId: UnaId;
  keyKind?: "agentReadableContent";
  keyVersion?: number;
  payloadCiphertext?: Base64String;
  payloadNonce?: Base64String;
  sortOrder?: number;
  assignedPersonProfileIds?: UnaId[] | null;
  dueAt?: MillisecondsSinceEpoch | null;
  dueAllDay?: boolean | null;
  reminderMinutesBefore?: number | null;
};

export type ListSetItemCheckedArgs = {
  itemId: UnaId;
  checked: boolean;
};

export type ListBulkSetItemsCheckedArgs = {
  items: Array<{
    itemId: UnaId;
    checked: boolean;
  }>;
};

export type ListItemCheckedResult = {
  id: UnaId;
  checkedAt: MillisecondsSinceEpoch | null;
};

export type ListCreatedItemResult = {
  id: UnaId;
};

export type ListBulkAddItemsResult = {
  items: ListCreatedItemResult[];
};

export type ListBulkSetItemsCheckedResult = {
  items: ListItemCheckedResult[];
};
