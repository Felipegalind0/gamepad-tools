import type {
  ActionIntentFrame,
  BindingProfile,
  ControllerInputFrame,
  HostInputAdapter,
} from "./contracts.js";
import { ProfileEvaluationSession, resolveHostBindingIntent } from "./evaluator.js";
import { parseProfile } from "./profiles.js";
import type { AxisDeadzoneMode } from "./transform.js";

export interface BindingRuntimeOptions {
  adapter: HostInputAdapter;
  profile: BindingProfile;
  defaultAxisDeadzone?: number;
  /** Live host preference; does not overwrite profile bindings or their deadzone sizes. */
  getAxisDeadzoneMode?: () => AxisDeadzoneMode;
}

export type BindingProfileListener = (profile: BindingProfile) => void;

/**
 * Owns evaluation state for one host. The browser source can be shared by the
 * editor, a viewer, and the host, while this class ensures that commands are
 * evaluated and dispatched exactly once per source frame.
 */
export class BindingRuntime {
  readonly adapter: HostInputAdapter;
  private profile: BindingProfile;
  private readonly evaluator = new ProfileEvaluationSession();
  private readonly listeners = new Set<BindingProfileListener>();
  private captureActive = false;
  private disposed = false;
  private readonly defaultAxisDeadzone: number;
  private readonly getAxisDeadzoneMode?: () => AxisDeadzoneMode;

  constructor(options: BindingRuntimeOptions) {
    this.adapter = options.adapter;
    this.profile = parseProfile(options.profile);
    this.defaultAxisDeadzone = options.defaultAxisDeadzone ?? 0;
    this.getAxisDeadzoneMode = options.getAxisDeadzoneMode;
  }

  getProfile(): BindingProfile {
    return this.profile;
  }

  setProfile(profile: BindingProfile): void {
    if (this.disposed) {
      return;
    }
    this.profile = parseProfile(profile);
    this.evaluator.clearTransientCommandState();
    for (const listener of this.listeners) {
      listener(this.profile);
    }
  }

  subscribeProfile(listener: BindingProfileListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setBindingCapture(active: boolean): void {
    if (this.disposed || this.captureActive === active) {
      return;
    }
    this.captureActive = active;
    this.evaluator.clearTransientCommandState();
    this.adapter.setBindingCapture(active);
  }

  isBindingCaptureActive(): boolean {
    return this.captureActive;
  }

  dispatch(frame: ControllerInputFrame): ActionIntentFrame {
    const context = this.adapter.getContext();
    const evaluated = this.evaluator.evaluate(this.profile, frame, context, {
      commandReleaseOnMissingInput: true,
      defaultAxisDeadzone: this.defaultAxisDeadzone,
      axisDeadzoneMode: this.getAxisDeadzoneMode?.(),
    });
    if (!this.disposed && !this.captureActive && this.profile.hostNamespace === this.adapter.namespace) {
      this.adapter.applyIntents(resolveHostBindingIntent(this.adapter, evaluated));
    }
    return evaluated;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.captureActive) {
      this.captureActive = false;
      this.adapter.setBindingCapture(false);
    }
    this.evaluator.clearTransientCommandState();
    this.listeners.clear();
  }
}
