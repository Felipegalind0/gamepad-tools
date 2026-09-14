import type { BindingTransformSpec } from "./contracts.js";

export type AxisDeadzoneMode = "scaled" | "cutoff";

export const DEFAULT_BINDING_TRANSFORM: BindingTransformSpec = {
  invert: false,
  center: 0,
  deadzone: 0,
  inputRange: [-1, 1],
  outputRange: [-1, 1],
  responseCurve: "linear",
  responseAmount: 0,
  scale: 1,
  commandThreshold: 0.5,
  commandHysteresis: 0.05,
};

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function remapRange(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (!Number.isFinite(fromLow) || !Number.isFinite(fromHigh) || fromLow === fromHigh) {
    return value;
  }
  const t = (value - fromLow) / (fromHigh - fromLow);
  return toLow + t * (toHigh - toLow);
}

export function applyResponseCurve(value: number, curve: "linear" | "expo", amount: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(amount)) {
    return value;
  }

  if (curve === "linear") {
    return value;
  }

  const p = clamp(amount, 0, 1);
  const abs = Math.abs(value);
  const shaped = Math.pow(abs, 1 + p);
  return value >= 0 ? shaped : -shaped;
}

export function normalizeAxisValue(
  value: number,
  transform: BindingTransformSpec,
  deadzoneMode: AxisDeadzoneMode = "scaled",
): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  const centered = value - transform.center;
  const direction = transform.invert ? -1 : 1;
  const sign = centered >= 0 ? 1 : -1;
  const abs = Math.abs(centered);

  let deadzoned = abs;
  if (deadzoneMode === "cutoff") {
    // Preserve magnitude outside the quiet center, including the boundary.
    deadzoned = abs < transform.deadzone ? 0 : abs;
  } else if (abs <= transform.deadzone) {
    deadzoned = 0;
  } else {
    deadzoned = (abs - transform.deadzone) / Math.max(1 - transform.deadzone, Number.EPSILON);
    deadzoned = clamp(deadzoned, 0, 1);
  }

  const raw = direction * sign * deadzoned;
  const remapped = remapRange(raw, transform.inputRange[0], transform.inputRange[1], transform.outputRange[0], transform.outputRange[1]);
  const withCurve = applyResponseCurve(remapped, transform.responseCurve, transform.responseAmount);
  const scaled = withCurve * transform.scale;
  return clamp(scaled, transform.outputRange[0], transform.outputRange[1]);
}

export function normalizeButtonValue(value: number, transform: BindingTransformSpec): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  const normalized = clamp(value, 0, 1);
  if (transform.invert) {
    return clamp(1 - normalized, transform.outputRange[0], transform.outputRange[1]);
  }
  return clamp(normalized, transform.outputRange[0], transform.outputRange[1]);
}

export function commandState(value: number, threshold: number, hysteresis: number, wasActive: boolean): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  const up = clamp(threshold + hysteresis, 0, 1);
  const down = clamp(threshold - hysteresis, 0, 1);

  if (wasActive) {
    return value >= down;
  }
  return value >= up;
}

export function mergeTransform(base: BindingTransformSpec, override?: Partial<BindingTransformSpec> | undefined): BindingTransformSpec {
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    center: typeof override.center === "number" ? override.center : base.center,
    deadzone: typeof override.deadzone === "number" ? override.deadzone : base.deadzone,
    scale: typeof override.scale === "number" ? override.scale : base.scale,
    responseAmount: typeof override.responseAmount === "number" ? override.responseAmount : base.responseAmount,
    commandThreshold: typeof override.commandThreshold === "number" ? override.commandThreshold : base.commandThreshold,
    commandHysteresis: typeof override.commandHysteresis === "number" ? override.commandHysteresis : base.commandHysteresis,
    responseCurve: override.responseCurve ?? base.responseCurve,
    inputRange: override.inputRange?.slice() as typeof base.inputRange | undefined ?? base.inputRange,
    outputRange: override.outputRange?.slice() as typeof base.outputRange | undefined ?? base.outputRange,
    invert: typeof override.invert === "boolean" ? override.invert : base.invert,
  };
}
