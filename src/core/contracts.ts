export type ActionKind = "axis" | "value" | "rate" | "command";

export interface ActionDescriptor {
  id: string;
  label: string;
  category: string;
  kind: ActionKind;
  range?: readonly [number, number];
  contexts: readonly string[];
  available: boolean;
  unavailableReason?: string;
}

export interface HostInputAdapter {
  namespace: "foss-earth" | "0sfs";
  actions: readonly ActionDescriptor[];
  getContext(): string;
  applyIntents(frame: ActionIntentFrame): void;
  setBindingCapture(active: boolean): void;
}

export interface KeyboardModifierState {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export interface GamepadSnapshot {
  slot: number;
  sessionId: string;
  connected: boolean;
  id: string;
  mapping: string;
  axes: readonly number[];
  buttons: readonly number[];
  timestamp: number;
  vendor?: string;
  product?: string;
  profile?: string;
}

export interface KeyboardSnapshot {
  timestamp: number;
  pressedCodes: readonly string[];
  modifiers: KeyboardModifierState;
}

export interface ControllerInputFrame {
  timestamp: number;
  frameId: number;
  gamepads: readonly GamepadSnapshot[];
  keyboard: KeyboardSnapshot;
}

export type InputKind = "gamepad" | "keyboard";

export interface KeyboardInputSelector {
  kind: "keyboard";
  code: string;
  modifiers?: KeyboardModifierState;
}

export interface GamepadAxisInputSelector {
  kind: "gamepad-axis";
  axisIndex: number;
  gamepadSlot: number;
  gamepadSessionId?: string;
}

export interface GamepadButtonInputSelector {
  kind: "gamepad-button";
  buttonIndex: number;
  gamepadSlot: number;
  gamepadSessionId?: string;
}

export type InputSelector = KeyboardInputSelector | GamepadAxisInputSelector | GamepadButtonInputSelector;

export interface BindingSource {
  selector: InputSelector;
  direction?: -1 | 1;
  weight?: number;
}

export interface BaseBindingSpec {
  id: string;
  actionId: string;
  kind: "single" | "paired";
  semantics: ActionKind;
  contexts: readonly string[];
  enabled: boolean;
  precedence: number;
  transform: BindingTransformSpec;
  label?: string;
}

export interface SingleBindingSpec extends BaseBindingSpec {
  kind: "single";
  source: BindingSource;
}

export interface PairedBindingSpec extends BaseBindingSpec {
  kind: "paired";
  positiveSource: BindingSource;
  negativeSource: BindingSource;
}

export type BindingSpec = SingleBindingSpec | PairedBindingSpec;

export interface BindingTransformSpec {
  invert: boolean;
  center: number;
  deadzone: number;
  inputRange: readonly [number, number];
  outputRange: readonly [number, number];
  responseCurve: "linear" | "expo";
  responseAmount: number;
  scale: number;
  commandThreshold: number;
  commandHysteresis: number;
}

export interface BindingProfile {
  schemaVersion: 1;
  profileId: string;
  name: string;
  hostNamespace: string;
  contexts: readonly string[];
  bindings: readonly BindingSpec[];
  selectedDeviceSessionId?: string;
  selectedDeviceSlot?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ActionIntentFrame {
  frameId: number;
  timestamp: number;
  dt: number;
  context: string;
  intents: readonly ActionIntent[];
  conflicts: readonly ActionConflict[];
}

export interface ActionSourceInfo {
  inputKind: InputKind;
  selector: InputSelector;
  bindingId: string;
}

export interface AxisActionIntent {
  kind: "axis";
  actionId: string;
  value: number;
  source: ActionSourceInfo;
}

export interface ValueActionIntent {
  kind: "value";
  actionId: string;
  value: number;
  source: ActionSourceInfo;
}

export interface RateActionIntent {
  kind: "rate";
  actionId: string;
  value: number;
  dt: number;
  source: ActionSourceInfo;
}

export interface CommandActionIntent {
  kind: "command";
  actionId: string;
  edge: "press" | "release";
  source: ActionSourceInfo;
}

export type ActionIntent = AxisActionIntent | ValueActionIntent | RateActionIntent | CommandActionIntent;

export interface ActionConflict {
  actionId: string;
  context: string;
  reason: string;
  bindingIds: readonly string[];
}

export interface BindingProfileStorageRecord {
  profile: BindingProfile;
  schemaVersion: 1;
  exportedAt: number;
}
