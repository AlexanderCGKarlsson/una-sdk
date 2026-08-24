import { UnaMcpClient } from "./client.js";
import type { CalendarListEventsArgs } from "./client.js";
import { UnaConfigurationError } from "./errors.js";
import { agentReadablePayloadFields } from "./helpers.js";
import { UnaCryptoError, UnaCryptoSession } from "./crypto.js";
import type {
  AgentConnectionContext,
  AgentReadablePayloadFields,
  CalendarEventPayload,
  CalendarEventSummary,
  FetchLike,
  ListItemPayload,
  ListItemSummary,
  McpCapabilityManifest,
  PersonProfileSummary,
  SharedListPayload,
  SharedListSummary,
  UnaId,
  WrappedAgentReadableKey,
} from "./types.js";

export type UnaConnectionKitOptions = {
  endpoint: string;
  token: string;
  privateKeyJwk: JsonWebKey;
  publicKeyId?: string;
  fetch?: FetchLike;
  crypto?: Crypto;
};

export type UnaDoctorCheck = {
  name: "manifest" | "authentication" | "pairing" | "wrapped_keys" | "unwrap";
  ok: boolean;
  code: string;
  message: string;
};

export type UnaDoctorResult = {
  ready: boolean;
  checks: UnaDoctorCheck[];
  manifest?: McpCapabilityManifest;
  context?: AgentConnectionContext;
  wrappedKeyVersions: number[];
  loadedKeyVersions: number[];
};

type EncryptedPayloadKey =
  | "keyKind"
  | "keyVersion"
  | "payloadCiphertext"
  | "payloadNonce";

export type UnaReadableResult<TRecord, TPayload> = Omit<TRecord, EncryptedPayloadKey> & {
  detailStatus: "readable" | "busy_only" | "unavailable";
  payload: TPayload | null;
  detailErrorCode?: string;
};

export type PersonProfilePayload = {
  displayName: string;
  birthdayISO?: string;
  familyRole?: string;
};

export type CalendarCreatePlaintextArgs = {
  startTime: number;
  endTime: number;
  allDay: boolean;
  personProfileIds: UnaId[];
  payload: CalendarEventPayload;
  visibility?: "household" | "personal";
  recurrenceRule?: string;
  reminderMinutesBefore?: number;
};

export type ListCreatePlaintextArgs = {
  payload: SharedListPayload;
  kind?: "shopping" | "todo" | "chores" | "notes";
  assignedPersonProfileId?: UnaId | null;
  sortOrder?: number;
};

export type ListItemAddPlaintextArgs = {
  listId: UnaId;
  payload: ListItemPayload;
  sortOrder: number;
  assignedPersonProfileIds?: UnaId[];
  dueAt?: number;
  dueAllDay?: boolean;
  reminderMinutesBefore?: number;
};

export class UnaConnectionKit {
  readonly raw: UnaMcpClient;
  readonly crypto: UnaCryptoSession;

  constructor(options: UnaConnectionKitOptions) {
    if (!options.token?.trim()) {
      throw new UnaConfigurationError("UnaConnectionKit requires a bearer token.");
    }
    this.raw = new UnaMcpClient({
      endpoint: options.endpoint,
      token: options.token,
      fetch: options.fetch,
    });
    this.crypto = new UnaCryptoSession({
      privateKeyJwk: options.privateKeyJwk,
      publicKeyId: options.publicKeyId,
      crypto: options.crypto,
    });
  }

  async doctor(): Promise<UnaDoctorResult> {
    const checks: UnaDoctorCheck[] = [];
    let manifest: McpCapabilityManifest | undefined;
    let context: AgentConnectionContext | undefined;
    let wrappedKeys: WrappedAgentReadableKey[] = [];

    try {
      manifest = await this.raw.getManifest();
      checks.push({
        name: "manifest",
        ok: true,
        code: "manifest_ok",
        message: `Connected to ${manifest.name} protocol ${manifest.protocolVersion}.`,
      });
    } catch {
      checks.push({
        name: "manifest",
        ok: false,
        code: "manifest_unavailable",
        message: "The Una endpoint manifest could not be loaded.",
      });
    }

    try {
      context = await this.raw.agent.getContext();
      checks.push({
        name: "authentication",
        ok: context.connection.status === "active",
        code:
          context.connection.status === "active"
            ? "token_active"
            : "connection_inactive",
        message:
          context.connection.status === "active"
            ? "Bearer token is valid and the connection is active."
            : `Connection status is ${context.connection.status}.`,
      });
      const keyIdMatches =
        !this.crypto.publicKeyId ||
        !context.connection.publicKeyId ||
        this.crypto.publicKeyId === context.connection.publicKeyId;
      checks.push({
        name: "pairing",
        ok: Boolean(context.connection.publicKeyId) && keyIdMatches,
        code: !context.connection.publicKeyId
          ? "public_key_not_registered"
          : keyIdMatches
            ? "key_id_matches"
            : "key_id_mismatch",
        message: !context.connection.publicKeyId
          ? "This Una connection has no registered public key id."
          : keyIdMatches
            ? `Connection is paired to key id ${context.connection.publicKeyId}.`
            : `Runtime key id does not match ${context.connection.publicKeyId}.`,
      });
    } catch {
      checks.push({
        name: "authentication",
        ok: false,
        code: "token_rejected",
        message: "Una rejected the bearer token or connection context request.",
      });
      checks.push({
        name: "pairing",
        ok: false,
        code: "pairing_unknown",
        message: "Pairing could not be checked without connection context.",
      });
    }

    try {
      wrappedKeys = await this.raw.crypto.listWrappedKeys();
      checks.push({
        name: "wrapped_keys",
        ok: wrappedKeys.length > 0,
        code: wrappedKeys.length > 0 ? "wrapped_keys_found" : "wrapped_keys_missing",
        message:
          wrappedKeys.length > 0
            ? `Found ${wrappedKeys.length} wrapped agent-readable key record(s).`
            : "No wrapped agent-readable keys were returned for this connection.",
      });
    } catch {
      checks.push({
        name: "wrapped_keys",
        ok: false,
        code: "wrapped_keys_unavailable",
        message: "Wrapped agent-readable keys could not be loaded.",
      });
    }

    const unwrapFailures: string[] = [];
    for (const wrappedKey of wrappedKeys) {
      try {
        await this.crypto.unwrapAgentReadableKey(wrappedKey);
      } catch (error) {
        unwrapFailures.push(
          error instanceof UnaCryptoError ? error.code : "unwrap_failed",
        );
      }
    }
    checks.push({
      name: "unwrap",
      ok: wrappedKeys.length > 0 && unwrapFailures.length === 0,
      code:
        wrappedKeys.length === 0
          ? "nothing_to_unwrap"
          : unwrapFailures.length === 0
            ? "unwrap_ok"
            : unwrapFailures[0],
      message:
        wrappedKeys.length === 0
          ? "No wrapped key was available to unwrap."
          : unwrapFailures.length === 0
            ? `Loaded agent-readable key version(s): ${this.crypto.keyVersions.join(", ")}.`
            : "A wrapped key could not be authenticated. Re-pair with the matching public key; do not guess KDF inputs.",
    });

    return {
      ready: checks.every((check) => check.ok),
      checks,
      manifest,
      context,
      wrappedKeyVersions: wrappedKeys.map((key) => key.keyVersion),
      loadedKeyVersions: this.crypto.keyVersions,
    };
  }

  async loadAgentReadableKeys(): Promise<number[]> {
    const wrappedKeys = await this.raw.crypto.listWrappedKeys();
    if (wrappedKeys.length === 0) {
      throw new UnaConfigurationError(
        "No wrapped agent-readable keys were returned for this connection.",
      );
    }
    for (const wrappedKey of wrappedKeys) {
      await this.crypto.unwrapAgentReadableKey(wrappedKey);
    }
    return this.crypto.keyVersions;
  }

  async connect(): Promise<UnaDoctorResult> {
    const result = await this.doctor();
    if (!result.ready) {
      const failure = result.checks.find((check) => !check.ok);
      throw new UnaConfigurationError(
        failure?.message ?? "Una connection checks did not pass.",
      );
    }
    return result;
  }

  readonly people = {
    listProfiles: async (): Promise<
      Array<UnaReadableResult<PersonProfileSummary, PersonProfilePayload>>
    > => {
      const profiles = await this.raw.people.listProfiles();
      return await Promise.all(
        profiles.map((profile) => this.readableRecord<PersonProfileSummary, PersonProfilePayload>(profile)),
      );
    },
  };

  readonly calendar = {
    listEvents: async (
      args: CalendarListEventsArgs,
    ): Promise<Array<UnaReadableResult<CalendarEventSummary, CalendarEventPayload>>> => {
      const events = await this.raw.calendar.listEvents(args);
      return await Promise.all(
        events.map((event) => this.readableRecord<CalendarEventSummary, CalendarEventPayload>(event)),
      );
    },

    getEvent: async (
      eventId: UnaId,
    ): Promise<UnaReadableResult<CalendarEventSummary, CalendarEventPayload>> => {
      const event = await this.raw.calendar.getEvent({ eventId });
      return await this.readableRecord<CalendarEventSummary, CalendarEventPayload>(event);
    },

    createEvent: async (
      args: CalendarCreatePlaintextArgs,
      options: { idempotencyKey: string },
    ) => {
      const encrypted = await this.crypto.encryptAgentReadableJson(args.payload);
      return await this.raw.calendar.createEvent(
        {
          startTime: args.startTime,
          endTime: args.endTime,
          allDay: args.allDay,
          personProfileIds: args.personProfileIds,
          visibility: args.visibility ?? "household",
          recurrenceRule: args.recurrenceRule,
          reminderMinutesBefore: args.reminderMinutesBefore,
          agentAccess: "agentReadable",
          ...encrypted,
        },
        options,
      );
    },
  };

  readonly lists = {
    listLists: async (): Promise<
      Array<UnaReadableResult<SharedListSummary, SharedListPayload>>
    > => {
      const lists = await this.raw.lists.listLists();
      return await Promise.all(
        lists.map((list) => this.readableRecord<SharedListSummary, SharedListPayload>(list)),
      );
    },

    listItems: async (
      listId: UnaId,
    ): Promise<Array<UnaReadableResult<ListItemSummary, ListItemPayload>>> => {
      const items = await this.raw.lists.listItems({ listId });
      return await Promise.all(
        items.map((item) => this.readableRecord<ListItemSummary, ListItemPayload>(item)),
      );
    },

    createList: async (
      args: ListCreatePlaintextArgs,
      options: { idempotencyKey: string },
    ) => {
      const encrypted = await this.crypto.encryptAgentReadableJson(args.payload);
      return await this.raw.lists.createList(
        {
          ...encrypted,
          kind: args.kind,
          assignedPersonProfileId: args.assignedPersonProfileId,
          sortOrder: args.sortOrder,
        },
        options,
      );
    },

    addItem: async (
      args: ListItemAddPlaintextArgs,
      options: { idempotencyKey: string },
    ) => {
      const encrypted = await this.crypto.encryptAgentReadableJson(args.payload);
      return await this.raw.lists.addItem(
        {
          ...encrypted,
          listId: args.listId,
          sortOrder: args.sortOrder,
          assignedPersonProfileIds: args.assignedPersonProfileIds,
          dueAt: args.dueAt,
          dueAllDay: args.dueAllDay,
          reminderMinutesBefore: args.reminderMinutesBefore,
        },
        options,
      );
    },
  };

  private async readableRecord<TRecord, TPayload>(
    record: TRecord,
  ): Promise<UnaReadableResult<TRecord, TPayload>> {
    const metadata = withoutEncryptedPayloadFields(record);
    try {
      const encrypted = agentReadablePayloadFields(record);
      const payload = await this.crypto.decryptAgentReadableJson<TPayload>(encrypted);
      return { ...metadata, detailStatus: "readable", payload };
    } catch (error) {
      if (error instanceof UnaConfigurationError) {
        return { ...metadata, detailStatus: "busy_only", payload: null };
      }
      return {
        ...metadata,
        detailStatus: "unavailable",
        payload: null,
        detailErrorCode:
          error instanceof UnaCryptoError ? error.code : "decrypt_failed",
      };
    }
  }
}

function withoutEncryptedPayloadFields<TRecord>(
  record: TRecord,
): Omit<TRecord, EncryptedPayloadKey> {
  if (!record || typeof record !== "object") return record;
  const {
    keyKind: _keyKind,
    keyVersion: _keyVersion,
    payloadCiphertext: _payloadCiphertext,
    payloadNonce: _payloadNonce,
    ...metadata
  } = record as TRecord & Record<EncryptedPayloadKey, unknown>;
  return metadata;
}

export function isReadableUnaResult<TRecord, TPayload>(
  result: UnaReadableResult<TRecord, TPayload>,
): result is UnaReadableResult<TRecord, TPayload> & { payload: TPayload } {
  return result.detailStatus === "readable" && result.payload !== null;
}

export function encryptedFieldsForRecord(
  record: AgentReadablePayloadFields,
): AgentReadablePayloadFields {
  return agentReadablePayloadFields(record);
}
