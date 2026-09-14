import { clamp } from "./transform.js";
import type { ControllerInputFrame, GamepadSnapshot, KeyboardModifierState } from "./contracts.js";

const SESSION_KEY_PREFIX = "gamepad-tools-session";
let fallbackSessionCounter = 0;
let frameCounter = 0;
const activeGamepadSessions = new WeakMap<object, string>();

export interface KeyboardSnapshotInput {
  pressedCodes?: Iterable<string>;
  modifiers?: Partial<KeyboardModifierState>;
  timestamp?: number;
}

export interface GamepadInputOptions {
  includeDisconnected?: boolean;
  keyboard?: KeyboardSnapshotInput;
  timestamp?: number;
}

function formatSessionId(): string {
  const counter = ++fallbackSessionCounter;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${SESSION_KEY_PREFIX}-${crypto.randomUUID()}-${counter}`;
  }
  return `${SESSION_KEY_PREFIX}-${Date.now()}-${counter}`;
}

function createSessionForGamepad(gamepad: Gamepad): string {
  const existing = activeGamepadSessions.get(gamepad);
  if (existing) {
    return existing;
  }

  const assigned = formatSessionId();
  activeGamepadSessions.set(gamepad, assigned);
  return assigned;
}

export function makeKeyboardSnapshot(input: KeyboardSnapshotInput = {}): {
  codes: readonly string[];
  modifiers: KeyboardModifierState;
  timestamp: number;
} {
  const set = new Set<string>();
  if (input.pressedCodes) {
    for (const key of input.pressedCodes) {
      if (typeof key === "string") {
        set.add(key);
      }
    }
  }

  const modifiers: KeyboardModifierState = {
    shift: !!input.modifiers?.shift,
    ctrl: !!input.modifiers?.ctrl,
    alt: !!input.modifiers?.alt,
    meta: !!input.modifiers?.meta,
  };

  return {
    codes: Array.from(set),
    modifiers,
    timestamp: typeof input.timestamp === "number" ? input.timestamp : Date.now(),
  };
}

export function sampleGamepadFrames(options: GamepadInputOptions = {}): ControllerInputFrame {
  const timestamp = typeof options.timestamp === "number" && Number.isFinite(options.timestamp)
    ? options.timestamp
    : Date.now();
  const keyboard = makeKeyboardSnapshot({ ...options.keyboard, timestamp });
  const includeDisconnected = options.includeDisconnected ?? false;
  const gamepads: GamepadSnapshot[] = [];

  const navigatorRef = (globalThis as any).navigator as Navigator | undefined;
  if (!navigatorRef || !navigatorRef.getGamepads) {
    return {
      timestamp,
      frameId: ++frameCounter,
      gamepads: [],
      keyboard: {
        timestamp,
        pressedCodes: keyboard.codes,
        modifiers: keyboard.modifiers,
      },
    };
  }

  let raw: ReturnType<Navigator["getGamepads"]>;
  try {
    raw = navigatorRef.getGamepads();
  } catch {
    return {
      timestamp,
      frameId: ++frameCounter,
      gamepads: [],
      keyboard: {
        timestamp,
        pressedCodes: keyboard.codes,
        modifiers: keyboard.modifiers,
      },
    };
  }
  for (let slot = 0; slot < raw.length; slot++) {
    const gamepad = raw[slot];
    if (!gamepad) {
      continue;
    }

    if (!gamepad.connected && !includeDisconnected) {
      continue;
    }

    const sessionId = createSessionForGamepad(gamepad);
    const safeAxes = gamepad.axes.map((axis) => (Number.isFinite(axis) ? axis : 0));
    const safeButtons = gamepad.buttons.map((entry) => {
      const b = (entry as GamepadButton)?.value;
      if (typeof b === "number" && Number.isFinite(b)) {
        return clamp(b, 0, 1);
      }
      return 0;
    });

    gamepads.push({
      slot,
      sessionId,
      connected: gamepad.connected,
      id: gamepad.id,
      mapping: gamepad.mapping,
      axes: safeAxes,
      buttons: safeButtons,
      timestamp,
      vendor: gamepad.id,
      product: gamepad.id,
    });
  }

  return {
    timestamp,
    frameId: ++frameCounter,
    gamepads,
    keyboard: {
      timestamp,
      pressedCodes: keyboard.codes,
      modifiers: keyboard.modifiers,
    },
  };
}

export function makeFrameFromBrowserState(
  overrides: Partial<ControllerInputFrame> & { gamepads?: ControllerInputFrame["gamepads"]; timestamp?: number } = {},
): ControllerInputFrame {
  const base = sampleGamepadFrames({ timestamp: overrides.timestamp, keyboard: overrides.keyboard });
  const mergedKeyboard = {
    timestamp: typeof overrides.keyboard?.timestamp === "number" ? overrides.keyboard.timestamp : base.timestamp,
    pressedCodes:
      overrides.keyboard?.pressedCodes?.slice ? overrides.keyboard.pressedCodes : base.keyboard.pressedCodes,
    modifiers: overrides.keyboard?.modifiers ?? base.keyboard.modifiers,
  };

  return {
    timestamp: overrides.timestamp ?? base.timestamp,
    frameId: base.frameId,
    gamepads: overrides.gamepads ?? base.gamepads,
    keyboard: mergedKeyboard,
  };
}

export function findGamepadBySlot(gamepads: readonly GamepadSnapshot[], slot: number): GamepadSnapshot | undefined {
  return gamepads.find((entry) => entry.slot === slot);
}

export function findGamepadBySessionId(
  gamepads: readonly GamepadSnapshot[],
  sessionId: string,
): GamepadSnapshot | undefined {
  return gamepads.find((entry) => entry.sessionId === sessionId);
}

export function snapshotGamepadValue(
  frame: ControllerInputFrame,
  selector: { gamepadSlot: number; gamepadSessionId?: string; index: number },
  kind: "axis" | "button",
): number {
  const target = selector.gamepadSessionId
    ? findGamepadBySessionId(frame.gamepads, selector.gamepadSessionId)
    : findGamepadBySlot(frame.gamepads, selector.gamepadSlot);

  if (!target) {
    return Number.NaN;
  }

  if (kind === "axis") {
    const value = target.axes[selector.index];
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const value = target.buttons[selector.index];
  return Number.isFinite(value) ? value : Number.NaN;
}
