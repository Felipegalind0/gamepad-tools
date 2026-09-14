import { isFiniteNumber } from "./transform.js";
import {
  BindingProfile,
  BindingSpec,
  BindingSource,
  BindingTransformSpec,
  BaseBindingSpec,
} from "./contracts.js";
import { DEFAULT_BINDING_TRANSFORM } from "./transform.js";

export const CURRENT_PROFILE_SCHEMA_VERSION = 1;

interface TupleLike {
  0: unknown;
  1: unknown;
}

function safeTuple(value: unknown, fallback: readonly [number, number]): readonly [number, number] {
  const asArray = value as TupleLike | null;
  if (!asArray || typeof asArray !== "object") {
    return fallback;
  }
  const first = asArray[0];
  const second = asArray[1];
  if (!isFiniteNumber(first) || !isFiniteNumber(second)) {
    return fallback;
  }
  return [first, second] as const;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeIdentifier(value: unknown): string {
  const candidate = safeString(value);
  return candidate.length > 0 ? candidate : `id-${Date.now()}`;
}

function safeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = value
    .map((entry) => safeString(entry))
    .filter((entry) => entry.length > 0);
  return entries;
}

function safeTransform(value: unknown): BindingTransformSpec {
  const fallback = { ...DEFAULT_BINDING_TRANSFORM };
  const candidate = value as Partial<BindingTransformSpec> | undefined;

  if (!candidate) {
    return fallback;
  }

  return {
    ...fallback,
    invert: typeof candidate.invert === "boolean" ? candidate.invert : fallback.invert,
    center: typeof candidate.center === "number" ? candidate.center : fallback.center,
    deadzone: typeof candidate.deadzone === "number" ? candidate.deadzone : fallback.deadzone,
    scale: typeof candidate.scale === "number" ? candidate.scale : fallback.scale,
    responseAmount:
      typeof candidate.responseAmount === "number" ? candidate.responseAmount : fallback.responseAmount,
    responseCurve:
      candidate.responseCurve === "expo" || candidate.responseCurve === "linear"
        ? candidate.responseCurve
        : fallback.responseCurve,
    commandThreshold:
      typeof candidate.commandThreshold === "number" ? candidate.commandThreshold : fallback.commandThreshold,
    commandHysteresis:
      typeof candidate.commandHysteresis === "number" ? candidate.commandHysteresis : fallback.commandHysteresis,
    inputRange: safeTuple(candidate.inputRange, fallback.inputRange),
    outputRange: safeTuple(candidate.outputRange, fallback.outputRange),
  };
}

function isGamepadSelector(value: unknown): value is {
  gamepadSlot: number;
  gamepadSessionId?: string;
  axisIndex?: number;
  buttonIndex?: number;
  kind: "gamepad-axis" | "gamepad-button";
} {
  const candidate = value as {
    kind?: unknown;
    gamepadSlot?: unknown;
    axisIndex?: unknown;
    buttonIndex?: unknown;
  };

  if (candidate.kind !== "gamepad-axis" && candidate.kind !== "gamepad-button") {
    return false;
  }

  if (typeof candidate.gamepadSlot !== "number" || !Number.isInteger(candidate.gamepadSlot) || candidate.gamepadSlot < 0) {
    return false;
  }

  if (candidate.kind === "gamepad-axis") {
    return (
      typeof candidate.axisIndex === "number" &&
      Number.isInteger(candidate.axisIndex) &&
      candidate.axisIndex >= 0
    );
  }

  return (
    typeof candidate.buttonIndex === "number" &&
    Number.isInteger(candidate.buttonIndex) &&
    candidate.buttonIndex >= 0
  );
}

function isKeyboardSelector(value: unknown): value is { kind: "keyboard"; code: string; modifiers?: never } {
  const candidate = value as { kind?: unknown; code?: unknown };
  return candidate.kind === "keyboard" && typeof candidate.code === "string" && candidate.code.length > 0;
}

function isBindingSource(value: unknown): value is BindingSource {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { selector?: unknown; direction?: unknown; weight?: unknown };
  if (!isGamepadSelector(candidate.selector) && !isKeyboardSelector(candidate.selector)) {
    return false;
  }

  if (candidate.direction !== undefined) {
    if (candidate.direction !== -1 && candidate.direction !== 1) {
      return false;
    }
  }

  if (candidate.weight !== undefined) {
    if (typeof candidate.weight !== "number" || !Number.isFinite(candidate.weight)) {
      return false;
    }
  }

  return true;
}

function normalizeBinding(value: unknown, usedIds: Set<string>): BindingSpec | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<BaseBindingSpec> & {
    source?: unknown;
    kind?: unknown;
    positiveSource?: unknown;
    negativeSource?: unknown;
  };

  if (candidate.kind !== "single" && candidate.kind !== "paired") {
    return null;
  }

  if (typeof candidate.id !== "string" || candidate.id.length === 0 || usedIds.has(candidate.id)) {
    return null;
  }
  usedIds.add(candidate.id);

  if (typeof candidate.actionId !== "string" || candidate.actionId.length === 0) {
    return null;
  }

  const semantics = safeString(candidate.semantics);
  if (semantics !== "axis" && semantics !== "value" && semantics !== "rate" && semantics !== "command") {
    return null;
  }

  const contexts = safeStringArray(candidate.contexts);
  const normalizedContexts = contexts.length > 0 ? contexts : ["default"];
  const transform = safeTransform(candidate.transform);

  if (candidate.kind === "single") {
    if (!isBindingSource(candidate.source)) {
      return null;
    }

    return {
      id: safeIdentifier(candidate.id),
      actionId: candidate.actionId,
      kind: "single",
      semantics: semantics as BindingSpec["semantics"],
      contexts: normalizedContexts,
      enabled: candidate.enabled !== false,
      precedence: typeof candidate.precedence === "number" ? candidate.precedence : 0,
      transform,
      label: safeString(candidate.label),
      source: candidate.source as BindingSource,
    };
  }

  if (!isBindingSource(candidate.positiveSource) || !isBindingSource(candidate.negativeSource)) {
    return null;
  }

  return {
    id: safeIdentifier(candidate.id),
    actionId: candidate.actionId,
    kind: "paired",
    semantics: semantics as BindingSpec["semantics"],
    contexts: normalizedContexts,
    enabled: candidate.enabled !== false,
    precedence: typeof candidate.precedence === "number" ? candidate.precedence : 0,
    transform,
    label: safeString(candidate.label),
    positiveSource: candidate.positiveSource as BindingSource,
    negativeSource: candidate.negativeSource as BindingSource,
  };
}

export function normalizeProfile(value: unknown): BindingProfile {
  const record = (value as { profile?: unknown })?.profile ?? value;
  const candidate = record as Partial<BindingProfile> & { bindings?: unknown; schemaVersion?: unknown };

  const rawBindings = Array.isArray(candidate.bindings) ? candidate.bindings : [];
  const usedIds = new Set<string>();
  const bindings = rawBindings
    .map((entry) => normalizeBinding(entry, usedIds))
    .filter((entry): entry is BindingSpec => entry !== null);

  const schemaVersion = candidate.schemaVersion;
  const createdAt =
    typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();
  const updatedAt =
    typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : createdAt;

  return {
    schemaVersion:
      typeof schemaVersion === "number" && Number.isInteger(schemaVersion) ? schemaVersion : CURRENT_PROFILE_SCHEMA_VERSION,
    profileId: safeIdentifier(candidate.profileId),
    name: safeString(candidate.name, "Binding profile"),
    hostNamespace: safeString(candidate.hostNamespace, "generic"),
    contexts: safeStringArray(candidate.contexts).length > 0 ? safeStringArray(candidate.contexts) : ["default"],
    bindings,
    selectedDeviceSessionId:
      typeof candidate.selectedDeviceSessionId === "string" ? candidate.selectedDeviceSessionId : undefined,
    selectedDeviceSlot:
      typeof candidate.selectedDeviceSlot === "number" && Number.isInteger(candidate.selectedDeviceSlot)
        ? candidate.selectedDeviceSlot
        : undefined,
    createdAt,
    updatedAt,
  };
}

export function parseProfile(value: unknown): BindingProfile {
  const normalized = normalizeProfile(value);
  if (normalized.schemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
    normalized.schemaVersion = CURRENT_PROFILE_SCHEMA_VERSION;
  }
  return normalized;
}

export function createDefaultProfile(hostNamespace = "generic"): BindingProfile {
  return {
    schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    profileId: `default-${Date.now()}`,
    name: "Default",
    hostNamespace,
    contexts: ["default"],
    bindings: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export interface ProfileValidationResult {
  valid: boolean;
  profile?: BindingProfile;
  errors: readonly string[];
}

/**
 * Validate imported JSON before it can replace an active profile. The
 * normalizer remains intentionally forgiving for legacy in-memory callers;
 * import is stricter so malformed data cannot silently become a different
 * control scheme.
 */
export function validateProfileImport(value: unknown): ProfileValidationResult {
  if (!value || typeof value !== "object") {
    return { valid: false, errors: ["A profile must be an object."] };
  }

  const record = (value as { profile?: unknown }).profile ?? value;
  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["The imported profile is malformed."] };
  }

  const candidate = record as Partial<BindingProfile> & { bindings?: unknown };
  if (candidate.schemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
    return {
      valid: false,
      errors: ["This profile uses an unsupported schema version."],
    };
  }
  if (typeof candidate.profileId !== "string" || candidate.profileId.trim().length === 0) {
    return { valid: false, errors: ["A profile ID is required."] };
  }
  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    return { valid: false, errors: ["A profile name is required."] };
  }
  if (typeof candidate.hostNamespace !== "string" || candidate.hostNamespace.trim().length === 0) {
    return { valid: false, errors: ["A host namespace is required."] };
  }
  if (!Array.isArray(candidate.bindings) || candidate.bindings.length > 256) {
    return { valid: false, errors: ["A profile must contain between 0 and 256 bindings."] };
  }

  const profile = normalizeProfile(record);
  if (profile.bindings.length !== candidate.bindings.length) {
    return {
      valid: false,
      errors: ["One or more bindings has an invalid selector, transform, or duplicate ID."],
    };
  }
  if (profile.hostNamespace !== candidate.hostNamespace.trim()) {
    return { valid: false, errors: ["The host namespace is invalid."] };
  }
  return { valid: true, profile, errors: [] };
}
