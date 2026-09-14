import {
  findGamepadBySessionId,
  findGamepadBySlot,
  sampleGamepadFrames,
} from "../core/inputs.js";
import type {
  ControllerInputFrame,
  GamepadSnapshot,
  KeyboardModifierState,
} from "../core/contracts.js";

export interface GamepadDeviceSelection {
  slot?: number;
  sessionId?: string;
}

export interface BrowserInputSourceOptions {
  target?: Window;
  autoSelect?: boolean;
  ignoreFormInputs?: boolean;
}

export interface BrowserInputSource {
  tick(): ControllerInputFrame;
  getFrame(): ControllerInputFrame;
  subscribe(listener: (frame: ControllerInputFrame) => void): () => void;
  getSelectedDevice(): GamepadSnapshot | undefined;
  selectDevice(selection: GamepadDeviceSelection | null): void;
  start(options?: { intervalMs?: number; useAnimationFrame?: boolean; shouldPoll?: () => boolean }): () => void;
  stop(): void;
  dispose(): void;
}

function modifiersFor(keys: ReadonlySet<string>, event?: KeyboardEvent): KeyboardModifierState {
  return {
    shift: event?.shiftKey ?? (keys.has("ShiftLeft") || keys.has("ShiftRight")),
    ctrl: event?.ctrlKey ?? (keys.has("ControlLeft") || keys.has("ControlRight")),
    alt: event?.altKey ?? (keys.has("AltLeft") || keys.has("AltRight")),
    meta: event?.metaKey ?? (keys.has("MetaLeft") || keys.has("MetaRight")),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}

function pickAutoDevice(frame: ControllerInputFrame): GamepadSnapshot | undefined {
  return frame.gamepads.slice().sort((left, right) => {
    const leftRank = left.mapping === "standard" ? 0 : 1;
    const rightRank = right.mapping === "standard" ? 0 : 1;
    return leftRank - rightRank || left.slot - right.slot;
  })[0];
}

export function createBrowserInputSource(options: BrowserInputSourceOptions = {}): BrowserInputSource {
  const target = options.target ?? (typeof window === "undefined" ? undefined : window);
  const autoSelect = options.autoSelect !== false;
  const ignoreFormInputs = options.ignoreFormInputs !== false;
  const keys = new Set<string>();
  const listeners = new Set<(frame: ControllerInputFrame) => void>();
  let selected: GamepadDeviceSelection | null = null;
  let explicitSelection = false;
  let current = sampleGamepadFrames();
  let animationFrame: number | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const resolveSelected = (frame: ControllerInputFrame): GamepadSnapshot | undefined => {
    if (selected?.sessionId) {
      return findGamepadBySessionId(frame.gamepads, selected.sessionId);
    }
    if (selected?.slot !== undefined) {
      return findGamepadBySlot(frame.gamepads, selected.slot);
    }
    return autoSelect ? pickAutoDevice(frame) : undefined;
  };

  const emit = (): ControllerInputFrame => {
    if (disposed) {
      return current;
    }
    current = sampleGamepadFrames({
      keyboard: {
        pressedCodes: keys,
        modifiers: modifiersFor(keys),
      },
    });
    const device = resolveSelected(current);
    if (!explicitSelection && device) {
      selected = { slot: device.slot, sessionId: device.sessionId };
    }
    for (const listener of listeners) {
      listener(current);
    }
    return current;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (ignoreFormInputs && isEditableTarget(event.target)) {
      return;
    }
    keys.add(event.code);
    current = sampleGamepadFrames({
      keyboard: {
        pressedCodes: keys,
        modifiers: modifiersFor(keys, event),
      },
    });
    for (const listener of listeners) {
      listener(current);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    keys.delete(event.code);
    emit();
  };
  const onBlur = (): void => {
    if (keys.size > 0) {
      keys.clear();
      emit();
    }
  };
  const onGamepadChange = (): void => {
    emit();
  };

  target?.addEventListener("keydown", onKeyDown);
  target?.addEventListener("keyup", onKeyUp);
  target?.addEventListener("blur", onBlur);
  target?.addEventListener("gamepadconnected", onGamepadChange);
  target?.addEventListener("gamepaddisconnected", onGamepadChange);

  const stop = (): void => {
    if (animationFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };

  return {
    tick: emit,
    getFrame: () => current,
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    getSelectedDevice() {
      return resolveSelected(current);
    },
    selectDevice(selection) {
      selected = selection;
      explicitSelection = selection !== null;
      emit();
    },
    start(schedule = {}) {
      stop();
      const useAnimationFrame = schedule.useAnimationFrame === true
        && typeof requestAnimationFrame === "function";
      if (useAnimationFrame) {
        const next = () => {
          if (schedule.shouldPoll?.() !== false) emit();
          if (!disposed) {
            animationFrame = requestAnimationFrame(next);
          }
        };
        next();
      } else {
        interval = setInterval(emit, Math.max(16, schedule.intervalMs ?? 33));
        emit();
      }
      return stop;
    },
    stop,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stop();
      keys.clear();
      listeners.clear();
      target?.removeEventListener("keydown", onKeyDown);
      target?.removeEventListener("keyup", onKeyUp);
      target?.removeEventListener("blur", onBlur);
      target?.removeEventListener("gamepadconnected", onGamepadChange);
      target?.removeEventListener("gamepaddisconnected", onGamepadChange);
    },
  };
}
