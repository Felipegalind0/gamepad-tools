import type {
  BindingSource,
  ControllerInputFrame,
  GamepadSnapshot,
  InputSelector,
} from "./contracts.js";

export type BindingCapturePhase =
  | "inactive"
  | "awaiting-release"
  | "listening"
  | "candidate"
  | "confirm";

export interface BindingCaptureCandidate {
  source: BindingSource;
  rawValue: number;
  label: string;
}

export interface BindingCaptureSnapshot {
  phase: BindingCapturePhase;
  candidate: BindingCaptureCandidate | null;
  message: string;
}

export interface BindingCaptureOptions {
  axisThreshold?: number;
  buttonThreshold?: number;
  stableMs?: number;
}

interface Baseline {
  axes: readonly number[];
  buttons: readonly number[];
  keyboard: ReadonlySet<string>;
}

function selectedGamepad(
  frame: ControllerInputFrame,
  preferred?: GamepadSnapshot,
): GamepadSnapshot | undefined {
  if (preferred) {
    return frame.gamepads.find((gamepad) => gamepad.sessionId === preferred.sessionId)
      ?? frame.gamepads.find((gamepad) => gamepad.slot === preferred.slot);
  }
  return frame.gamepads.find((gamepad) => gamepad.mapping === "standard") ?? frame.gamepads[0];
}

function selectorLabel(selector: InputSelector): string {
  if (selector.kind === "keyboard") {
    return selector.code;
  }
  return selector.kind === "gamepad-axis"
    ? "Axis " + selector.axisIndex
    : "Button " + selector.buttonIndex;
}

/**
 * Capture is deliberately stateful. It records controls already held when
 * binding begins and requires a later, stable interaction before producing a
 * candidate. This prevents a held brake, a keyboard repeat, or stick noise
 * from becoming a new mapping.
 */
export class BindingCaptureSession {
  private phase: BindingCapturePhase = "inactive";
  private baseline: Baseline | null = null;
  private heldButtons = new Set<number>();
  private heldKeys = new Set<string>();
  private candidate: BindingCaptureCandidate | null = null;
  private candidateSince = 0;
  private readonly axisThreshold: number;
  private readonly buttonThreshold: number;
  private readonly stableMs: number;

  constructor(options: BindingCaptureOptions = {}) {
    this.axisThreshold = Math.max(0.1, Math.min(1, options.axisThreshold ?? 0.45));
    this.buttonThreshold = Math.max(0.1, Math.min(1, options.buttonThreshold ?? 0.6));
    this.stableMs = Math.max(0, options.stableMs ?? 90);
  }

  start(frame: ControllerInputFrame, device?: GamepadSnapshot): BindingCaptureSnapshot {
    const gamepad = selectedGamepad(frame, device);
    this.baseline = {
      axes: gamepad?.axes.slice() ?? [],
      buttons: gamepad?.buttons.slice() ?? [],
      keyboard: new Set(frame.keyboard.pressedCodes),
    };
    this.heldButtons = new Set(
      (gamepad?.buttons ?? []).flatMap((value, index) => value >= this.buttonThreshold ? [index] : []),
    );
    this.heldKeys = new Set(frame.keyboard.pressedCodes);
    this.candidate = null;
    this.candidateSince = 0;
    this.phase = this.heldButtons.size > 0 || this.heldKeys.size > 0
      ? "awaiting-release"
      : "listening";
    return this.snapshot();
  }

  update(frame: ControllerInputFrame, device?: GamepadSnapshot): BindingCaptureSnapshot {
    if (this.phase === "inactive") {
      return this.snapshot();
    }
    const gamepad = selectedGamepad(frame, device);

    if (this.phase === "awaiting-release") {
      for (const code of Array.from(this.heldKeys)) {
        if (!frame.keyboard.pressedCodes.includes(code)) {
          this.heldKeys.delete(code);
        }
      }
      for (const index of Array.from(this.heldButtons)) {
        if ((gamepad?.buttons[index] ?? 0) < this.buttonThreshold * 0.5) {
          this.heldButtons.delete(index);
        }
      }
      if (this.heldButtons.size === 0 && this.heldKeys.size === 0) {
        this.phase = "listening";
      }
      return this.snapshot();
    }

    if (this.phase === "confirm") {
      return this.snapshot();
    }

    const candidate = this.findCandidate(frame, gamepad);
    if (!candidate) {
      this.candidate = null;
      this.candidateSince = 0;
      this.phase = "listening";
      return this.snapshot();
    }

    if (!this.candidate || this.candidate.label !== candidate.label) {
      this.candidate = candidate;
      this.candidateSince = frame.timestamp;
      this.phase = "candidate";
      return this.snapshot();
    }

    if (frame.timestamp - this.candidateSince >= this.stableMs) {
      this.phase = "confirm";
    }
    return this.snapshot();
  }

  confirm(): BindingCaptureCandidate | null {
    if (this.phase !== "confirm") {
      return null;
    }
    const candidate = this.candidate;
    this.reset();
    return candidate;
  }

  cancel(): void {
    this.reset();
  }

  snapshot(): BindingCaptureSnapshot {
    const message = this.phase === "awaiting-release"
      ? "Release controls held when capture started."
      : this.phase === "listening"
        ? "Press a key or button, or move one axis deliberately."
        : this.phase === "candidate"
          ? "Hold the candidate briefly to confirm it."
          : this.phase === "confirm"
            ? "Candidate ready. Confirm or cancel."
            : "Capture is inactive.";
    return { phase: this.phase, candidate: this.candidate, message };
  }

  private reset(): void {
    this.phase = "inactive";
    this.baseline = null;
    this.heldButtons.clear();
    this.heldKeys.clear();
    this.candidate = null;
    this.candidateSince = 0;
  }

  private findCandidate(
    frame: ControllerInputFrame,
    gamepad: GamepadSnapshot | undefined,
  ): BindingCaptureCandidate | null {
    const newKey = frame.keyboard.pressedCodes.find((code) => !this.baseline?.keyboard.has(code));
    if (newKey) {
      const selector: InputSelector = { kind: "keyboard", code: newKey };
      return {
        source: { selector },
        rawValue: 1,
        label: selectorLabel(selector),
      };
    }
    if (!gamepad || !this.baseline) {
      return null;
    }

    const pressedButton = gamepad.buttons.findIndex((value, index) => (
      value >= this.buttonThreshold
      && !this.heldButtons.has(index)
      && (this.baseline?.buttons[index] ?? 0) < this.buttonThreshold * 0.5
    ));
    if (pressedButton >= 0) {
      const selector: InputSelector = {
        kind: "gamepad-button",
        buttonIndex: pressedButton,
        gamepadSlot: gamepad.slot,
        gamepadSessionId: gamepad.sessionId,
      };
      return {
        source: { selector },
        rawValue: gamepad.buttons[pressedButton] ?? 0,
        label: selectorLabel(selector),
      };
    }

    let axisIndex = -1;
    let axisDelta = 0;
    for (let index = 0; index < gamepad.axes.length; index += 1) {
      const delta = (gamepad.axes[index] ?? 0) - (this.baseline.axes[index] ?? 0);
      if (Math.abs(delta) > Math.abs(axisDelta)) {
        axisIndex = index;
        axisDelta = delta;
      }
    }
    if (axisIndex < 0 || Math.abs(axisDelta) < this.axisThreshold) {
      return null;
    }
    const selector: InputSelector = {
      kind: "gamepad-axis",
      axisIndex,
      gamepadSlot: gamepad.slot,
      gamepadSessionId: gamepad.sessionId,
    };
    return {
      source: { selector, direction: axisDelta < 0 ? -1 : 1 },
      rawValue: gamepad.axes[axisIndex] ?? 0,
      label: selectorLabel(selector) + (axisDelta < 0 ? " negative" : " positive"),
    };
  }
}
