import type { AxisDeadzoneMode } from "./transform.js";

/**
 * How hard an axis follows the stick: whether the value chases the stick over a
 * response time or tracks it outright, and which deadzone shape `applyTransform`
 * is asked for.
 *
 * This is a persisted user preference rather than part of a binding profile: it
 * applies to every binding an application evaluates, and the application decides
 * where it is stored.
 */
export interface GamepadResponseSettings {
  mode: "smooth" | "direct";
  responseTimeSec: number;
  deadzoneMode: AxisDeadzoneMode;
}

export const DEFAULT_GAMEPAD_RESPONSE_SETTINGS: Readonly<GamepadResponseSettings> = Object.freeze({
  mode: "smooth",
  // The original update uses min(1, 8 * dt): a nominal 95% response in 3 / 8 seconds.
  responseTimeSec: 0.375,
  deadzoneMode: "cutoff",
});

export const GAMEPAD_RESPONSE_STORAGE_KEY = "gamepad-tools:response";

export interface GamepadResponseController {
  getSettings(): Readonly<GamepadResponseSettings>;
  setSettings(settings: Partial<GamepadResponseSettings>): void;
  subscribe(listener: () => void): () => void;
}

export interface GamepadResponseControllerOptions {
  /**
   * Where the preference is kept. An application that already wrote this
   * setting under its own key passes that key to keep the saved choice.
   */
  storageKey?: string;
}

export function normalizeGamepadResponseSettings(value: unknown): GamepadResponseSettings {
  const partial = value !== null && typeof value === "object"
    ? value as Partial<GamepadResponseSettings> : {};
  return {
    mode: partial.mode === "direct" ? "direct" : "smooth",
    responseTimeSec: typeof partial.responseTimeSec === "number" && Number.isFinite(partial.responseTimeSec)
      ? Math.max(0.05, Math.min(2, partial.responseTimeSec))
      : DEFAULT_GAMEPAD_RESPONSE_SETTINGS.responseTimeSec,
    deadzoneMode: partial.deadzoneMode === "scaled" ? "scaled" : "cutoff",
  };
}

function loadSettings(storageKey: string): GamepadResponseSettings {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey);
    return normalizeGamepadResponseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_GAMEPAD_RESPONSE_SETTINGS };
  }
}

export function createGamepadResponseController(
  options: GamepadResponseControllerOptions = {},
): GamepadResponseController {
  const storageKey = options.storageKey ?? GAMEPAD_RESPONSE_STORAGE_KEY;
  let settings: Readonly<GamepadResponseSettings> = Object.freeze(loadSettings(storageKey));
  const listeners = new Set<() => void>();
  return {
    getSettings: () => settings,
    setSettings(partial): void {
      const next = normalizeGamepadResponseSettings({ ...settings, ...partial });
      if (next.mode === settings.mode && next.responseTimeSec === settings.responseTimeSec
        && next.deadzoneMode === settings.deadzoneMode) return;
      settings = Object.freeze(next);
      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(settings));
      } catch {
        // Keep the selected response for this session if storage is unavailable.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
