import { sampleGamepadFrames } from "../core/inputs.js";
import type { ControllerInputFrame } from "../core/contracts.js";

export * from "./source.js";

export interface GamepadSourceSchedulerOptions {
  onFrame: (frame: ControllerInputFrame) => void;
  intervalMs?: number;
  useAnimationFrame?: boolean;
}

export interface GamepadSourceScheduler {
  dispose(): void;
  tick(): void;
}

function createRafHandle(callback: () => void): { cancel: () => void } {
  let id = requestAnimationFrame(callback);
  return {
    cancel() {
      cancelAnimationFrame(id);
    },
  };
}

function createIntervalHandle(callback: () => void, intervalMs: number): { cancel: () => void } {
  const id = setInterval(callback, intervalMs);
  return {
    cancel() {
      clearInterval(id);
    },
  };
}

export function createGamepadSourceScheduler(options: GamepadSourceSchedulerOptions): GamepadSourceScheduler {
  let active = true;
  let rafHandle: { cancel: () => void } | null = null;
  let intervalHandle: { cancel: () => void } | null = null;

  const emit = () => {
    if (!active) {
      return;
    }
    options.onFrame(sampleGamepadFrames());
  };

  const flush = () => {
    const useRaf = options.useAnimationFrame === true;
    const hasRaf =
      typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";

    if (useRaf && hasRaf) {
      emit();
      rafHandle = createRafHandle(flush);
      return;
    }

    const delay = Math.max(16, options.intervalMs ?? 33);
    intervalHandle = createIntervalHandle(emit, delay);
  };

  flush();

  return {
    tick() {
      emit();
    },
    dispose() {
      active = false;
      if (rafHandle) {
        rafHandle.cancel();
        rafHandle = null;
      }
      if (intervalHandle) {
        intervalHandle.cancel();
        intervalHandle = null;
      }
    },
  };
}
