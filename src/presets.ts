import { UnaConfigurationError } from "./errors.js";
import type { AgentConnectionContext } from "./types.js";

export type UnaAgentScope =
  | "people:read"
  | "calendar:read"
  | "calendar:read:details"
  | "calendar:write"
  | "calendar:delete"
  | "lists:read"
  | "lists:write"
  | "shopping:read"
  | "shopping:write";

export type UnaCapabilityPresetId =
  | "calendarPlanner"
  | "listHelper"
  | "calendarListPlanner";

export type UnaGrantRequirement = {
  kind: "people" | "lists" | "eventShares";
  access: "read" | "write";
  reason: string;
};

export type UnaCapabilityPreset = {
  id: UnaCapabilityPresetId;
  title: string;
  summary: string;
  scopes: readonly UnaAgentScope[];
  grants: readonly UnaGrantRequirement[];
  tools: readonly string[];
  setupNotes: readonly string[];
  notIncluded: readonly string[];
};

export const UNA_AGENT_CAPABILITY_PRESETS: readonly UnaCapabilityPreset[] = [
  {
    id: "calendarPlanner",
    title: "Calendar planner",
    summary:
      "Find free time and create selected household calendar events without broad household access.",
    scopes: [
      "people:read",
      "calendar:read",
      "calendar:read:details",
      "calendar:write",
    ],
    grants: [
      {
        kind: "people",
        access: "write",
        reason:
          "The assistant can only create or update plans for selected people.",
      },
      {
        kind: "eventShares",
        access: "read",
        reason:
          "Existing event details are readable only when explicitly shared and agent-readable.",
      },
    ],
    tools: [
      "agent.get_context",
      "crypto.list_wrapped_keys",
      "people.list_profiles",
      "calendar.find_free_slots",
      "calendar.list_events",
      "calendar.get_event",
      "calendar.create_event",
      "calendar.update_event",
    ],
    setupNotes: [
      "Use calendar.find_free_slots for availability before proposing a time.",
      "Use agentAccess: busy when the assistant should not need future event details.",
      "Use agentAccess: agentReadable only for events the assistant may need to inspect later.",
    ],
    notIncluded: [
      "member invites or removal",
      "billing or entitlement management",
      "household key access",
      "calendar deletion by default",
    ],
  },
  {
    id: "listHelper",
    title: "List helper",
    summary:
      "Read, add, update, and complete items in selected agent-readable household lists.",
    scopes: ["lists:read", "lists:write"],
    grants: [
      {
        kind: "lists",
        access: "write",
        reason:
          "Each usable list must be explicitly granted and marked agent-readable.",
      },
    ],
    tools: [
      "agent.get_context",
      "crypto.list_wrapped_keys",
      "lists.list_lists",
      "lists.list_items",
      "lists.create_list",
      "lists.update_list",
      "lists.add_item",
      "lists.bulk_add_items",
      "lists.update_item",
      "lists.set_item_checked",
      "lists.bulk_set_items_checked",
    ],
    setupNotes: [
      "Ask when more than one list item matches a requested update.",
      "Use lists.set_item_checked for completion instead of deleting items.",
      "Use lists.bulk_add_items when one user-intended action creates several encrypted items in one granted list.",
      "Use lists.bulk_set_items_checked when one user-intended action completes several known item ids.",
      "Encrypt list item names, notes, and URLs before write calls.",
    ],
    notIncluded: [
      "lists that were not selected",
      "access outside selected lists",
      "plaintext list content handling",
      "member or billing management",
    ],
  },
  {
    id: "calendarListPlanner",
    title: "Calendar + lists",
    summary:
      "Create selected calendar plans and update granted Una lists without introducing a separate feature surface.",
    scopes: [
      "people:read",
      "calendar:read",
      "calendar:write",
      "lists:read",
      "lists:write",
    ],
    grants: [
      {
        kind: "people",
        access: "write",
        reason:
          "Calendar plans can only be assigned to selected household people.",
      },
      {
        kind: "lists",
        access: "write",
        reason:
          "Lists must be explicitly granted and agent-readable before the assistant can read or write them.",
      },
    ],
    tools: [
      "agent.get_context",
      "crypto.list_wrapped_keys",
      "people.list_profiles",
      "calendar.find_free_slots",
      "calendar.list_events",
      "calendar.create_event",
      "calendar.update_event",
      "lists.list_lists",
      "lists.list_items",
      "lists.create_list",
      "lists.update_list",
      "lists.add_item",
      "lists.bulk_add_items",
      "lists.update_item",
      "lists.set_item_checked",
      "lists.bulk_set_items_checked",
    ],
    setupNotes: [
      "Use this for assistants that need both calendar writes and selected list writes.",
      "Keep higher-level planning, web lookup, and commerce outside Una unless a future explicit encrypted product flow exists.",
      "Link related records inside encrypted calendar payload fields with linkedListIds, linkedItemIds, and url.",
    ],
    notIncluded: [
      "calendar detail reads by default",
      "calendar deletion by default",
      "commerce credentials",
      "checkout state",
      "unencrypted household content handling",
      "household member access",
    ],
  },
];

export function listUnaCapabilityPresets() {
  return [...UNA_AGENT_CAPABILITY_PRESETS];
}

export function getUnaCapabilityPreset(id: UnaCapabilityPresetId) {
  const preset = UNA_AGENT_CAPABILITY_PRESETS.find(
    (candidate) => candidate.id === id,
  );
  if (!preset) {
    throw new UnaConfigurationError(`Unknown Una capability preset: ${id}`);
  }
  return preset;
}

export function missingScopesForPreset(
  scopesOrContext: readonly string[] | AgentConnectionContext,
  presetOrId: UnaCapabilityPreset | UnaCapabilityPresetId,
) {
  const scopes = scopesFrom(scopesOrContext);
  const preset =
    typeof presetOrId === "string"
      ? getUnaCapabilityPreset(presetOrId)
      : presetOrId;
  return preset.scopes.filter((scope) => !scopes.has(scope));
}

export function hasScopesForPreset(
  scopesOrContext: readonly string[] | AgentConnectionContext,
  presetOrId: UnaCapabilityPreset | UnaCapabilityPresetId,
) {
  return missingScopesForPreset(scopesOrContext, presetOrId).length === 0;
}

function scopesFrom(scopesOrContext: readonly string[] | AgentConnectionContext) {
  if (isAgentConnectionContext(scopesOrContext)) {
    return new Set(scopesOrContext.connection.scopes);
  }
  return new Set(scopesOrContext);
}

function isAgentConnectionContext(
  value: readonly string[] | AgentConnectionContext,
): value is AgentConnectionContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "connection" in value &&
    !Array.isArray(value)
  );
}
