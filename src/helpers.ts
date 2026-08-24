import { UnaConfigurationError } from "./errors.js";
import type { AgentReadablePayloadFields } from "./types.js";

export type UnaWriteToolName =
  | "calendar.create_event"
  | "calendar.update_event"
  | "calendar.delete_event"
  | "lists.create_list"
  | "lists.update_list"
  | "lists.add_item"
  | "lists.bulk_add_items"
  | "lists.update_item"
  | "lists.set_item_checked"
  | "lists.bulk_set_items_checked"
  | "shopping.create_list"
  | "shopping.update_list"
  | "shopping.add_item"
  | "shopping.bulk_add_items"
  | "shopping.update_item"
  | "shopping.set_item_checked"
  | "shopping.bulk_set_items_checked";

export type UnaIdempotencyPart = string | number | boolean | null | undefined;

export type UnaIdempotencyKeyOptions = {
  prefix?: string;
  maxLength?: number;
};

export const UNA_IDEMPOTENCY_KEY_MAX_LENGTH = 160;

export function createUnaIdempotencyKey(
  tool: UnaWriteToolName,
  parts: readonly UnaIdempotencyPart[],
  options: UnaIdempotencyKeyOptions = {},
) {
  const maxLength = options.maxLength ?? UNA_IDEMPOTENCY_KEY_MAX_LENGTH;
  const prefix = options.prefix ?? tool;
  const segments = [prefix, ...parts]
    .map((part) => safeIdempotencySegment(part))
    .filter((part) => part.length > 0);
  const key = segments.join(":");

  if (!key) {
    throw new UnaConfigurationError("Idempotency key cannot be empty.");
  }
  if (key.length > maxLength) {
    throw new UnaConfigurationError(
      `Idempotency key is ${key.length} characters; Una accepts at most ${maxLength}. Use shorter opaque ids or a client-side request id.`,
    );
  }

  return key;
}

export function isAgentReadablePayloadFields(
  record: unknown,
): record is AgentReadablePayloadFields {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Partial<AgentReadablePayloadFields>;
  return (
    candidate.keyKind === "agentReadableContent" &&
    typeof candidate.keyVersion === "number" &&
    Number.isFinite(candidate.keyVersion) &&
    typeof candidate.payloadCiphertext === "string" &&
    candidate.payloadCiphertext.length > 0 &&
    typeof candidate.payloadNonce === "string" &&
    candidate.payloadNonce.length > 0
  );
}

export function agentReadablePayloadFields(
  record: unknown,
  label = "record",
): AgentReadablePayloadFields {
  if (!isAgentReadablePayloadFields(record)) {
    throw new UnaConfigurationError(
      `${label} does not include agent-readable payload fields.`,
    );
  }

  return {
    keyKind: record.keyKind,
    keyVersion: record.keyVersion,
    payloadCiphertext: record.payloadCiphertext,
    payloadNonce: record.payloadNonce,
  };
}

function safeIdempotencySegment(part: UnaIdempotencyPart) {
  if (part === null || part === undefined) return "";
  return String(part)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._~-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
