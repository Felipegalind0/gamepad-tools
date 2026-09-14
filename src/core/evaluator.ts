import {
  ActionConflict,
  ActionDescriptor,
  ActionIntent,
  ActionIntentFrame,
  ActionSourceInfo,
  BindingTransformSpec,
  BindingProfile,
  BindingSource,
  BindingSpec,
  CommandActionIntent,
  ControllerInputFrame,
  HostInputAdapter,
  InputSelector,
  KeyboardModifierState,
  PairedBindingSpec,
  SingleBindingSpec,
} from "./contracts.js";
import {
  commandState,
  normalizeAxisValue,
  normalizeButtonValue,
  type AxisDeadzoneMode,
} from "./transform.js";

interface BindingRuntimeState {
  wasCommandActive: boolean;
  lastValue: number;
}

interface EvaluatorOptions {
  commandReleaseOnMissingInput?: boolean;
  defaultAxisDeadzone?: number;
  axisDeadzoneMode?: AxisDeadzoneMode;
}

function normalizeContext(context: string): string {
  const trimmed = context.trim();
  return trimmed.length > 0 ? trimmed : "default";
}

function matchesContext(bindingContexts: readonly string[], context: string): boolean {
  if (bindingContexts.includes("*")) {
    return true;
  }
  return bindingContexts.includes(context) || bindingContexts.includes("default");
}

function modifierMatch(expected: KeyboardModifierState | undefined, active: KeyboardModifierState): boolean {
  if (!expected) {
    return true;
  }

  return (
    !!expected.shift === active.shift &&
    !!expected.ctrl === active.ctrl &&
    !!expected.alt === active.alt &&
    !!expected.meta === active.meta
  );
}

function isPressed(selector: Extract<InputSelector, { kind: "keyboard" }>, frame: ControllerInputFrame): boolean {
  return frame.keyboard.pressedCodes.includes(selector.code) && modifierMatch(selector.modifiers, frame.keyboard.modifiers);
}

function readGamepadSource(
  frame: ControllerInputFrame,
  selector: Extract<InputSelector, { kind: "gamepad-axis" | "gamepad-button" }>,
): number {
  const gamepad = frame.gamepads.find((candidate) => {
    if (selector.gamepadSessionId) {
      return candidate.sessionId === selector.gamepadSessionId;
    }
    return candidate.slot === selector.gamepadSlot;
  });

  if (!gamepad) {
    return Number.NaN;
  }

  if (selector.kind === "gamepad-axis") {
    const value = gamepad.axes[selector.axisIndex];
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const value = gamepad.buttons[selector.buttonIndex];
  return Number.isFinite(value) ? value : Number.NaN;
}

function readBindingSource(frame: ControllerInputFrame, source: BindingSource): number {
  const selector = source.selector;

  if (selector.kind === "keyboard") {
    return isPressed(selector, frame) ? 1 : 0;
  }

  return readGamepadSource(frame, selector);
}

function applyTransform(
  rawValue: number,
  source: BindingSource,
  transform: BindingTransformSpec,
  deadzoneMode: AxisDeadzoneMode,
): number {
  if (!Number.isFinite(rawValue)) {
    return Number.NaN;
  }

  const normalized =
    source.selector.kind === "gamepad-axis"
      ? normalizeAxisValue(rawValue, transform, deadzoneMode)
      : normalizeButtonValue(rawValue, transform);

  const weight =
    source.weight !== undefined && Number.isFinite(source.weight)
      ? source.weight
      : 1;

  const weighted = normalized * weight;
  return source.direction === -1 ? -weighted : weighted;
}

function readValueForBinding(
  frame: ControllerInputFrame,
  binding: BindingSpec,
  defaultAxisDeadzone = 0,
  axisDeadzoneMode: AxisDeadzoneMode = "scaled",
): number {
  // Host stick-response settings must not reshape absolute throttle values
  // or change the thresholds used by command bindings.
  const deadzoneMode = binding.semantics === "axis" ? axisDeadzoneMode : "scaled";
  const transform = binding.semantics === "axis" && binding.transform.deadzone === 0
    ? { ...binding.transform, deadzone: defaultAxisDeadzone }
    : binding.transform;
  if (binding.kind === "single") {
    const source = (binding as SingleBindingSpec).source;
    return applyTransform(readBindingSource(frame, source), source, transform, deadzoneMode);
  }

  const paired = binding as PairedBindingSpec;
  const positive = applyTransform(
    readBindingSource(frame, paired.positiveSource),
    paired.positiveSource,
    transform,
    deadzoneMode,
  );
  const negative = applyTransform(
    readBindingSource(frame, paired.negativeSource),
    paired.negativeSource,
    transform,
    deadzoneMode,
  );

  return positive - negative;
}

function sourceForIntent(binding: BindingSpec): { selector: InputSelector; bindingId: string } {
  if (binding.kind === "single") {
    return { selector: binding.source.selector, bindingId: binding.id };
  }

  return { selector: binding.positiveSource.selector, bindingId: binding.id };
}

function buildIntentSource(selector: InputSelector, bindingId: string): ActionSourceInfo {
  return {
    inputKind: selector.kind === "keyboard" ? "keyboard" : "gamepad",
    selector,
    bindingId,
  };
}

function clampToRange(value: number, transform: BindingTransformSpec): number {
  return Math.min(Math.max(value, transform.outputRange[0]), transform.outputRange[1]);
}

export function evaluateBindingFrame(
  profile: BindingProfile,
  frame: ControllerInputFrame,
  context: string,
  options: EvaluatorOptions = {},
): ActionIntentFrame {
  return new ProfileEvaluationSession().evaluate(profile, frame, context, options);
}

export class ProfileEvaluationSession {
  private readonly states = new Map<string, BindingRuntimeState>();
  private lastTimestamp: number | null = null;

  evaluate(
    profile: BindingProfile,
    frame: ControllerInputFrame,
    context: string,
    options: EvaluatorOptions = {},
  ): ActionIntentFrame {
    const normalizedContext = normalizeContext(context);
    const dt = this.lastTimestamp === null
      ? 0
      : Math.max(0, Math.min(0.25, (frame.timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = frame.timestamp;
    const bindings = profile.bindings
      .filter((binding) => binding.enabled !== false)
      .filter((binding) => matchesContext(binding.contexts, normalizedContext))
      .slice()
      .sort((a, b) => {
        if (a.precedence === b.precedence) {
          return a.id.localeCompare(b.id);
        }
        return b.precedence - a.precedence;
      });

    const intents: ActionIntent[] = [];
    const conflicts: ActionConflict[] = [];
    const actionBuckets = new Map<string, string[]>();

    for (const binding of bindings) {
      const state = this.states.get(binding.id) ?? { wasCommandActive: false, lastValue: 0 };
      const rawValue = readValueForBinding(frame, binding, options.defaultAxisDeadzone, options.axisDeadzoneMode);
      const source = sourceForIntent(binding);

      if (Number.isNaN(rawValue)) {
        if (binding.semantics === "command" && options.commandReleaseOnMissingInput && state.wasCommandActive) {
          intents.push({
            kind: "command",
            actionId: binding.actionId,
            edge: "release",
            source: buildIntentSource(source.selector, source.bindingId),
          } satisfies CommandActionIntent);
          state.wasCommandActive = false;
        }
        this.states.set(binding.id, state);
        continue;
      }

      if (!actionBuckets.has(binding.actionId)) {
        actionBuckets.set(binding.actionId, []);
      }
      actionBuckets.get(binding.actionId)!.push(binding.id);

      if (binding.semantics === "command") {
        const isActive = commandState(
          rawValue,
          binding.transform.commandThreshold,
          binding.transform.commandHysteresis,
          state.wasCommandActive,
        );

        if (isActive !== state.wasCommandActive) {
          intents.push({
            kind: "command",
            actionId: binding.actionId,
            edge: isActive ? "press" : "release",
            source: buildIntentSource(source.selector, source.bindingId),
          });
        }

        state.wasCommandActive = isActive;
        state.lastValue = rawValue;
        this.states.set(binding.id, state);
        continue;
      }

      const value = clampToRange(rawValue, binding.transform);

      if (binding.semantics === "axis") {
        intents.push({
          kind: "axis",
          actionId: binding.actionId,
          value,
          source: buildIntentSource(source.selector, source.bindingId),
        });
      } else if (binding.semantics === "value") {
        intents.push({
          kind: "value",
          actionId: binding.actionId,
          value,
          source: buildIntentSource(source.selector, source.bindingId),
        });
      } else {
        intents.push({
          kind: "rate",
          actionId: binding.actionId,
          value,
          dt,
          source: buildIntentSource(source.selector, source.bindingId),
        });
      }

      state.lastValue = value;
      state.wasCommandActive = false;
      this.states.set(binding.id, state);
    }

    for (const [actionId, ids] of actionBuckets.entries()) {
      if (ids.length <= 1) {
        continue;
      }
      conflicts.push({
        actionId,
        context: normalizedContext,
        reason: "multiple bindings for the same action in context",
        bindingIds: ids,
      });
    }

    return {
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      dt,
      context: normalizedContext,
      intents,
      conflicts,
    };
  }

  clearTransientCommandState(): void {
    for (const state of this.states.values()) {
      state.wasCommandActive = false;
    }
    this.lastTimestamp = null;
  }
}

export function findActionDescriptor(
  catalog: readonly ActionDescriptor[],
  actionId: string,
): ActionDescriptor | undefined {
  return catalog.find((item) => item.id === actionId);
}

export function resolveHostBindingIntent(
  adapter: HostInputAdapter,
  frame: ActionIntentFrame,
  hostFilter?: (actionId: string) => boolean,
): ActionIntentFrame {
  const adapterActionIds = new Set(adapter.actions.map((action) => action.id));

  const isAllowed = hostFilter
    ? (actionId: string) => adapterActionIds.has(actionId) && hostFilter(actionId)
    : (actionId: string) => adapterActionIds.has(actionId);

  const intents = frame.intents.filter((intent) => isAllowed(intent.actionId));
  return { ...frame, intents };
}
