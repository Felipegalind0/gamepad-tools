import {
  BindingCaptureSession,
  DEFAULT_BINDING_TRANSFORM,
  createDefaultProfile,
  createProfileStore,
  parseProfile,
  validateProfileImport,
  type BindingProfile,
  type BindingSource,
  type BindingSpec,
  type GamepadSnapshot,
  type ProfileStore,
} from "../core/index.js";
import type { ActionDescriptor, InputSelector } from "../core/contracts.js";
import { BindingRuntime } from "../core/runtime.js";
import type { BrowserInputSource } from "../browser/source.js";

export interface BindingEditorPreset {
  id: string;
  label: string;
  description?: string;
  previousNames?: readonly string[];
  create(): BindingProfile;
}

export interface BindingEditorOptions {
  root: HTMLElement;
  runtime: BindingRuntime;
  source: BrowserInputSource;
  store?: ProfileStore;
  builtInProfiles?: readonly BindingEditorPreset[];
  /** @deprecated Supply builtInProfiles; all profiles share one selector. */
  presets?: readonly BindingEditorPreset[];
  onProfileChange?(profile: BindingProfile): void;
}

export interface BindingEditorHandle {
  refresh(): void;
  destroy(): void;
}

interface PendingBinding {
  action: ActionDescriptor;
  source: BindingSource;
  label: string;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function selectorKey(selector: InputSelector): string {
  if (selector.kind === "keyboard") {
    return "keyboard:" + selector.code + ":" + JSON.stringify(selector.modifiers ?? {});
  }
  return selector.kind + ":" + selector.gamepadSlot + ":" + selector.gamepadSessionId + ":"
    + (selector.kind === "gamepad-axis" ? selector.axisIndex : selector.buttonIndex);
}

function readableSelector(selector: InputSelector): string {
  if (selector.kind === "keyboard") {
    return selector.code.replace(/^(Key|Digit)/, "");
  }
  return selector.kind === "gamepad-axis"
    ? "Axis " + selector.axisIndex
    : "Button " + selector.buttonIndex;
}

function readableBinding(binding: BindingSpec, device?: GamepadSnapshot): string {
  const label = (source: BindingSource): string => {
    const selector = source.selector;
    if (device?.mapping === "standard" && selector.kind === "gamepad-button") {
      return ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu",
        "Left stick press", "Right stick press", "D-pad up", "D-pad down",
        "D-pad left", "D-pad right"][selector.buttonIndex] ?? readableSelector(selector);
    }
    if (device?.mapping === "standard" && selector.kind === "gamepad-axis") {
      return ["Left stick left/right", "Left stick up/down",
        "Right stick left/right", "Right stick up/down"][selector.axisIndex] ?? readableSelector(selector);
    }
    return readableSelector(selector);
  };
  return binding.kind === "single"
    ? label(binding.source)
    : label(binding.negativeSource) + " / " + label(binding.positiveSource);
}

function sourceForAxis(gamepad: GamepadSnapshot, axisIndex: number): BindingSource {
  return {
    selector: {
      kind: "gamepad-axis",
      axisIndex,
      gamepadSlot: gamepad.slot,
      gamepadSessionId: gamepad.sessionId,
    },
  };
}

function sourceForButton(gamepad: GamepadSnapshot, buttonIndex: number): BindingSource {
  return {
    selector: {
      kind: "gamepad-button",
      buttonIndex,
      gamepadSlot: gamepad.slot,
      gamepadSessionId: gamepad.sessionId,
    },
  };
}

function makeBinding(action: ActionDescriptor, source: BindingSource): BindingSpec {
  const isButton = source.selector.kind === "gamepad-button" || source.selector.kind === "keyboard";
  const range = action.range ?? (action.kind === "value" ? [0, 1] as const : [-1, 1] as const);
  const transform = {
    ...DEFAULT_BINDING_TRANSFORM,
    inputRange: isButton ? [0, 1] as const : [-1, 1] as const,
    outputRange: range,
  };
  return {
    id: "binding-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    actionId: action.id,
    kind: "single",
    semantics: action.kind,
    contexts: action.contexts.length > 0 ? action.contexts : ["default"],
    enabled: true,
    precedence: 0,
    transform,
    source,
  };
}

function groupActions(actions: readonly ActionDescriptor[]): Map<string, ActionDescriptor[]> {
  const groups = new Map<string, ActionDescriptor[]>();
  for (const action of actions) {
    const group = groups.get(action.category) ?? [];
    group.push(action);
    groups.set(action.category, group);
  }
  return groups;
}

export function mountBindingEditor(options: BindingEditorOptions): BindingEditorHandle {
  const store = options.store ?? createProfileStore();
  const runtime = options.runtime;
  const source = options.source;
  const root = options.root;
  const capture = new BindingCaptureSession();
  const builtIns = new Map((options.builtInProfiles ?? options.presets ?? [])
    .map((entry) => [entry.create().profileId, entry]));
  const normalizeName = (entry: BindingProfile): BindingProfile => {
    const definition = builtIns.get(entry.profileId);
    return definition?.previousNames?.includes(entry.name)
      ? { ...entry, name: definition.label }
      : entry;
  };
  let profile = runtime.getProfile();
  let profiles: BindingProfile[] = [
    profile,
    ...Array.from(builtIns.values(), (entry) => entry.create())
      .filter((entry) => entry.profileId !== profile.profileId),
  ];
  let selectedActionId: string | null = null;
  let selectedSource: BindingSource | null = null;
  let pending: PendingBinding | null = null;
  let status = "";
  let captureActive = false;
  let viewerEnabled = false;
  let viewer: { setSnapshot(frame: ReturnType<BrowserInputSource["getFrame"]>): void; dispose(): void } | null = null;
  let viewerCanvas: HTMLCanvasElement | null = null;
  let disposed = false;
  let liveOutput: HTMLElement | null = null;
  let deviceSelect: HTMLSelectElement | null = null;
  let viewerHost: HTMLElement | null = null;
  let viewerGeneration = 0;
  let rawDetails: HTMLDetailsElement | null = null;
  let rawExpanded = false;
  let lastLiveTextAt = -Infinity;
  let editingName = false;
  let profileMenu: HTMLDetailsElement | null = null;

  const commit = (next: BindingProfile, save = true): void => {
    // Built-in choices stay available; editing one creates a saved profile.
    if (save && builtIns.has(next.profileId)) {
      next = {
        ...next,
        profileId: "profile-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        name: next.name === builtIns.get(next.profileId)?.label ? next.name + " (custom)" : next.name,
        createdAt: Date.now(),
      };
    }
    profile = {
      ...next,
      updatedAt: Date.now(),
      hostNamespace: runtime.adapter.namespace,
    };
    runtime.setProfile(profile);
    profiles = [profile, ...profiles.filter((entry) => entry.profileId !== profile.profileId)];
    options.onProfileChange?.(profile);
    if (save) {
      void store.saveProfile(runtime.adapter.namespace, profile).catch(() => {
        status = "This profile could not be saved.";
        render();
      });
    }
  };

  const currentDevice = (): GamepadSnapshot | undefined => source.getSelectedDevice();

  const setCapture = (active: boolean): void => {
    captureActive = active;
    runtime.setBindingCapture(active);
    if (!active) {
      capture.cancel();
    }
  };

  const finishPending = (replaceConflicts: boolean): void => {
    if (!pending) {
      return;
    }
    const conflicts = profile.bindings.filter((binding) => {
      const sources = binding.kind === "single"
        ? [binding.source]
        : [binding.positiveSource, binding.negativeSource];
      return sources.some((entry) => selectorKey(entry.selector) === selectorKey(pending!.source.selector));
    });
    const bindings = replaceConflicts
      ? profile.bindings.filter((binding) => !conflicts.includes(binding))
      : profile.bindings;
    commit({ ...profile, bindings: [...bindings, makeBinding(pending.action, pending.source)] });
    status = "Bound " + pending.label + " to " + pending.action.label + ".";
    pending = null;
    selectedSource = null;
    setCapture(false);
    render();
  };

  const beginBinding = (action: ActionDescriptor): void => {
    selectedActionId = action.id;
    if (!action.available) {
      status = action.unavailableReason ?? "This action is not currently available.";
      render();
      return;
    }
    if (selectedSource) {
      pending = { action, source: selectedSource, label: readableSelector(selectedSource.selector) };
      render();
      return;
    }
    capture.start(source.getFrame(), currentDevice());
    setCapture(true);
    status = "Listening for " + action.label + ".";
    render();
  };

  const updateLive = (): void => {
    if (disposed) {
      return;
    }
    const frame = source.getFrame();
    const device = currentDevice();
    if (deviceSelect && document.activeElement !== deviceSelect) {
      deviceSelect.value = device?.sessionId ?? "";
    }
    const now = performance.now();
    if (liveOutput && rawDetails?.open && now - lastLiveTextAt >= 100) {
      lastLiveTextAt = now;
      const keyboard = frame.keyboard.pressedCodes.length > 0
        ? frame.keyboard.pressedCodes.join(", ")
        : "none";
      const axes = device ? device.axes.map((value, index) => "A" + index + ": " + value.toFixed(3)).join("  ") : "No controller selected";
      const buttons = device ? device.buttons.map((value, index) => "B" + index + ": " + value.toFixed(3)).join("  ") : "";
      const text = "Keyboard: " + keyboard + "\n" + axes + "\n" + buttons;
      if (liveOutput.textContent !== text) liveOutput.textContent = text;
    }
    if (captureActive) {
      const before = capture.snapshot().phase;
      capture.update(frame, device);
      if (capture.snapshot().phase !== before) {
        render();
        return;
      }
    }
    viewer?.setSnapshot(frame);
  };

  const renderRawControls = (host: HTMLElement): void => {
    const device = currentDevice();
    if (!device) {
      const empty = createElement("p", "gt-muted");
      empty.textContent = "Connect a controller to select numeric axes or buttons.";
      host.append(empty);
      return;
    }
    const raw = createElement("div", "gt-raw-grid");
    device.axes.forEach((value, index) => {
      const button = createElement("button", "gt-raw-control") as HTMLButtonElement;
      button.type = "button";
      button.textContent = "Axis " + index + ": " + value.toFixed(3);
      button.onclick = () => {
        selectedSource = sourceForAxis(device, index);
        status = "Selected Axis " + index + ". Choose an action to bind it.";
        render();
      };
      raw.append(button);
    });
    device.buttons.forEach((value, index) => {
      const button = createElement("button", "gt-raw-control") as HTMLButtonElement;
      button.type = "button";
      button.textContent = "Button " + index + ": " + value.toFixed(3);
      button.onclick = () => {
        selectedSource = sourceForButton(device, index);
        status = "Selected Button " + index + ". Choose an action to bind it.";
        render();
      };
      raw.append(button);
    });
    host.append(raw);
  };

  const render = (): void => {
    if (disposed) {
      return;
    }
    if (!viewerEnabled && viewerHost) {
      viewerGeneration += 1;
      viewer?.dispose();
      viewer = null;
      viewerCanvas = null;
      viewerHost = null;
    }
    root.replaceChildren();
    root.classList.add("gt-root");

    const profileRow = createElement("div", "gt-profile-row");
    const profileField = createElement("label", "gt-profile-field");
    const profileLabel = createElement("span", "gt-field-label");
    profileLabel.textContent = "Profile";
    profileField.append(profileLabel);
    const profileSelect = createElement("select") as HTMLSelectElement;
    profileSelect.setAttribute("aria-label", "Profile");
    for (const entry of profiles) {
      const option = document.createElement("option");
      option.value = entry.profileId;
      option.textContent = normalizeName(entry).name;
      option.selected = entry.profileId === profile.profileId;
      profileSelect.append(option);
    }
    profileSelect.onchange = () => {
      const next = builtIns.get(profileSelect.value)?.create()
        ?? profiles.find((entry) => entry.profileId === profileSelect.value);
      if (next) {
        setCapture(false);
        pending = null;
        selectedSource = null;
        commit(next, false);
        status = "";
        render();
      }
    };
    if (editingName) {
      const name = createElement("input");
      name.value = normalizeName(profile).name;
      name.setAttribute("aria-label", "Profile name");
      const finishRename = (save: boolean): void => {
        if (!editingName) return;
        editingName = false;
        if (save && name.value.trim() && name.value.trim() !== profile.name) {
          commit({ ...profile, name: name.value.trim() });
        }
        status = "";
        render();
      };
      name.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finishRename(event.key === "Enter");
        }
      };
      name.onblur = () => finishRename(true);
      profileField.append(name);
      queueMicrotask(() => { if (name.isConnected) { name.focus(); name.select(); } });
    } else {
      profileField.append(profileSelect);
    }
    profileRow.append(profileField);

    profileMenu = createElement("details", "gt-profile-menu");
    const menuToggle = createElement("summary", "gt-button gt-menu-toggle");
    menuToggle.setAttribute("aria-label", "Profile actions");
    menuToggle.title = "Profile actions";
    const hamburger = createElement("span", "gt-hamburger");
    hamburger.setAttribute("aria-hidden", "true");
    menuToggle.append(hamburger);
    const menuItems = createElement("div", "gt-menu-items");
    const editName = createElement("button", "gt-menu-item");
    editName.type = "button";
    editName.textContent = "Edit name";
    editName.onclick = () => { editingName = true; render(); };
    menuItems.append(editName);
    const duplicate = createElement("button", "gt-menu-item") as HTMLButtonElement;
    duplicate.type = "button";
    duplicate.textContent = "Duplicate";
    duplicate.onclick = () => {
      const next = {
        ...profile,
        profileId: "profile-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        name: normalizeName(profile).name + " copy",
        createdAt: Date.now(),
      };
      commit(next);
      status = "";
      editingName = true;
      render();
    };
    menuItems.append(duplicate);
    const remove = createElement("button", "gt-menu-item gt-button--danger") as HTMLButtonElement;
    remove.type = "button";
    remove.textContent = "Delete";
    remove.disabled = builtIns.has(profile.profileId);
    if (remove.disabled) remove.title = "Built-in profiles stay available. Your copies can be deleted.";
    remove.onclick = async () => {
      const id = profile.profileId;
      try {
        await store.deleteProfile(runtime.adapter.namespace, id);
      } catch {
        status = "This profile could not be deleted.";
        render();
        return;
      }
      if (disposed) return;
      profiles = profiles.filter((entry) => entry.profileId !== id);
      const next = profiles[0] ?? { ...createDefaultProfile(runtime.adapter.namespace), name: "Blank" };
      commit(next, false);
      status = "";
      render();
    };
    menuItems.append(remove);
    profileMenu.append(menuToggle, menuItems);
    profileRow.append(profileMenu);
    root.append(profileRow);

    const deviceRow = createElement("div", "gt-device-row");
    const deviceLabel = createElement("label");
    deviceLabel.textContent = "Controller";
    deviceSelect = createElement("select") as HTMLSelectElement;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Automatic selection";
    deviceSelect.append(none);
    for (const gamepad of source.getFrame().gamepads) {
      const option = document.createElement("option");
      option.value = gamepad.sessionId;
      option.textContent = "Slot " + gamepad.slot + ": " + (gamepad.id || "Unknown controller");
      option.selected = gamepad.sessionId === currentDevice()?.sessionId;
      deviceSelect.append(option);
    }
    deviceSelect.onchange = () => {
      const device = source.getFrame().gamepads.find((entry) => entry.sessionId === deviceSelect!.value);
      source.selectDevice(device ? { slot: device.slot, sessionId: device.sessionId } : null);
      commit({
        ...profile,
        selectedDeviceSlot: device?.slot,
        selectedDeviceSessionId: device?.sessionId,
      });
      render();
    };
    deviceLabel.append(deviceSelect);
    deviceRow.append(deviceLabel);
    const viewerToggle = createElement("label", "gt-check");
    const checkbox = createElement("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = viewerEnabled;
    checkbox.onchange = () => {
      viewerEnabled = checkbox.checked;
      render();
    };
    viewerToggle.append(checkbox, document.createTextNode(" Show 3D controller"));
    deviceRow.append(viewerToggle);
    root.append(deviceRow);

    const statusLine = createElement("p", "gt-status");
    statusLine.setAttribute("role", "status");
    statusLine.textContent = status || (selectedSource
      ? "Selected " + readableSelector(selectedSource.selector) + ". Choose an action to bind it."
      : "");
    statusLine.hidden = !statusLine.textContent;
    root.append(statusLine);

    if (captureActive) {
      const capturePanel = createElement("div", "gt-capture");
      const snapshot = capture.snapshot();
      const message = createElement("strong");
      message.textContent = snapshot.message;
      capturePanel.append(message);
      if (snapshot.candidate) {
        const candidate = createElement("span");
        candidate.textContent = " " + snapshot.candidate.label;
        capturePanel.append(candidate);
      }
      const cancel = createElement("button", "gt-button") as HTMLButtonElement;
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        setCapture(false);
        status = "Binding cancelled.";
        render();
      };
      capturePanel.append(cancel);
      if (snapshot.phase === "confirm") {
        const confirm = createElement("button", "gt-button gt-button--primary") as HTMLButtonElement;
        confirm.type = "button";
        confirm.textContent = "Use candidate";
        confirm.onclick = () => {
          const candidate = capture.confirm();
          if (candidate) {
            const action = runtime.adapter.actions.find((entry) => entry.id === selectedActionId);
            if (action) {
              pending = { action, source: candidate.source, label: candidate.label };
              setCapture(false);
              render();
            }
          }
        };
        capturePanel.append(confirm);
      }
      root.append(capturePanel);
    }

    if (pending) {
      const conflicts = profile.bindings.filter((binding) => {
        const sources = binding.kind === "single"
          ? [binding.source]
          : [binding.positiveSource, binding.negativeSource];
        return sources.some((entry) => selectorKey(entry.selector) === selectorKey(pending!.source.selector));
      });
      const confirm = createElement("div", "gt-capture");
      const text = createElement("p");
      text.textContent = conflicts.length > 0
        ? pending.label + " is already bound. Choose whether to replace or intentionally share it."
        : "Bind " + pending.label + " to " + pending.action.label + "?";
      confirm.append(text);
      const keep = createElement("button", "gt-button gt-button--primary") as HTMLButtonElement;
      keep.type = "button";
      keep.textContent = conflicts.length > 0 ? "Keep both" : "Apply";
      keep.onclick = () => finishPending(false);
      confirm.append(keep);
      if (conflicts.length > 0) {
        const replace = createElement("button", "gt-button") as HTMLButtonElement;
        replace.type = "button";
        replace.textContent = "Replace existing";
        replace.onclick = () => finishPending(true);
        confirm.append(replace);
      }
      const cancel = createElement("button", "gt-button") as HTMLButtonElement;
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        pending = null;
        render();
      };
      confirm.append(cancel);
      root.append(confirm);
    }

    const actionsHost = createElement("div", "gt-actions");
    for (const [category, actions] of groupActions(runtime.adapter.actions)) {
      const group = createElement("section", "gt-action-group");
      const groupHeading = createElement("h3");
      groupHeading.textContent = category;
      group.append(groupHeading);
      for (const action of actions) {
        const row = createElement("div", "gt-action");
        const copy = createElement("div");
        const label = createElement("strong");
        label.textContent = action.label;
        const detail = createElement("span", "gt-muted");
        const bindings = profile.bindings.filter((binding) => binding.actionId === action.id && binding.enabled);
        detail.textContent = action.available
          ? bindings.map((binding) => readableBinding(binding, currentDevice())).join(" · ") || "Unassigned"
          : action.unavailableReason ?? "Unavailable";
        copy.append(label, detail);
        row.append(copy);
        const bind = createElement("button", "gt-button") as HTMLButtonElement;
        bind.type = "button";
        bind.textContent = "Bind";
        bind.disabled = !action.available;
        bind.onclick = () => beginBinding(action);
        row.append(bind);
        group.append(row);
      }
      actionsHost.append(group);
    }
    root.append(actionsHost);

    const rawSection = createElement("details", "gt-live");
    rawDetails = rawSection;
    rawSection.open = rawExpanded;
    rawSection.ontoggle = () => { rawExpanded = rawSection.open; updateLive(); };
    const rawHeading = createElement("summary");
    rawHeading.textContent = "Input details";
    rawSection.append(rawHeading);
    const rawSelectHint = createElement("p", "gt-muted");
    rawSelectHint.textContent = "Select an input, then choose the action to assign.";
    rawSection.append(rawSelectHint);
    renderRawControls(rawSection);
    liveOutput = createElement("pre", "gt-live-values");
    rawSection.append(liveOutput);
    root.append(rawSection);

    const transfer = createElement("div", "gt-menu-transfer");
    const exportButton = createElement("button", "gt-menu-item") as HTMLButtonElement;
    exportButton.type = "button";
    exportButton.textContent = "Export profile";
    exportButton.onclick = () => {
      const blob = new Blob([JSON.stringify({ profile }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = profile.profileId + ".json";
      link.click();
      URL.revokeObjectURL(link.href);
    };
    transfer.append(exportButton);
    const importInput = createElement("input") as HTMLInputElement;
    importInput.type = "file";
    importInput.hidden = true;
    importInput.accept = "application/json,.json";
    importInput.setAttribute("aria-label", "Import binding profile");
    importInput.onchange = () => {
      const file = importInput.files?.[0];
      if (!file) {
        return;
      }
      void file.text().then((text) => {
        if (text.length > 250_000) {
          status = "The selected profile is too large.";
          render();
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          status = "The selected file is not valid JSON.";
          render();
          return;
        }
        const validation = validateProfileImport(parsed);
        if (!validation.valid || !validation.profile) {
          status = validation.errors.join(" ");
          render();
          return;
        }
        if (validation.profile.hostNamespace !== runtime.adapter.namespace) {
          status = "This profile belongs to " + validation.profile.hostNamespace + ", not this host.";
          render();
          return;
        }
        commit(validation.profile);
        status = "Profile imported.";
        render();
      });
    };
    const importButton = createElement("button", "gt-menu-item");
    importButton.type = "button";
    importButton.textContent = "Import profile";
    importButton.onclick = () => importInput.click();
    transfer.prepend(importButton);
    menuItems.append(transfer);
    root.append(importInput);

    if (viewerEnabled) {
      if (!viewerHost) {
      viewerHost = createElement("div", "gt-viewer");
      viewerCanvas = createElement("canvas") as HTMLCanvasElement;
      viewerCanvas.width = 640;
      viewerCanvas.height = 360;
      viewerHost.append(viewerCanvas);
      const viewerStatus = createElement("p", "gt-muted");
      viewerStatus.textContent = "Loading controller preview...";
      viewerHost.append(viewerStatus);
      const canvas = viewerCanvas;
      const generation = ++viewerGeneration;
      void import("../viewer/index.js").then(({ createControllerViewer }) => {
        if (disposed || generation !== viewerGeneration || !viewerEnabled) {
          return;
        }
        viewer = createControllerViewer({
          canvas,
          frame: source.getFrame(),
          onStatus: (next) => {
            viewerStatus.hidden = next.backend === "webgpu";
            viewerStatus.textContent = next.backend === "webgpu" ? "" : "3D preview unavailable.";
          },
        });
      }).catch(() => {
        viewerStatus.textContent = "3D preview unavailable.";
      });
      }
      root.append(viewerHost);
    }
    updateLive();
  };

  const unsubscribe = source.subscribe(() => updateLive());
  const unsubscribeProfile = runtime.subscribeProfile((next) => {
    profile = next;
  });
  void store.listProfileIds(runtime.adapter.namespace).then(async (ids) => {
    const loaded = await Promise.all(ids.map((id) => store.loadProfile(runtime.adapter.namespace, id)));
    if (disposed) {
      return;
    }
    const byId = new Map(profiles.map((entry) => [entry.profileId, entry]));
    for (const entry of loaded) {
      if (!entry || entry.hostNamespace !== runtime.adapter.namespace) continue;
      const definition = builtIns.get(entry.profileId);
      if (!definition) {
        byId.set(entry.profileId, normalizeName(entry));
        continue;
      }
      const original = definition.create();
      if (JSON.stringify(parseProfile(entry).bindings) === JSON.stringify(parseProfile(original).bindings)
        && normalizeName(entry).name === original.name) continue;
      // Earlier editor versions wrote edits directly over a built-in ID.
      // Preserve those edits as a saved profile before freeing the built-in.
      const savedId = entry.profileId + "-saved";
      const existing = loaded.find((candidate) => candidate?.profileId === savedId);
      const saved = existing ?? {
        ...normalizeName(entry), profileId: savedId,
        name: normalizeName(entry).name + " (saved)",
      };
      if (!existing) await store.saveProfile(runtime.adapter.namespace, saved);
      await store.deleteProfile(runtime.adapter.namespace, entry.profileId);
      byId.set(saved.profileId, saved);
    }
    if (disposed) return;
    byId.set(profile.profileId, profile);
    profiles = Array.from(byId.values());
    if (!editingName && !captureActive && !pending) render();
  }).catch(() => {
    if (disposed) return;
    status = "Saved profiles could not be loaded.";
    render();
  });

  const closeMenu = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key !== "Escape") return;
    if (event.type === "pointerdown" && profileMenu?.contains(event.target as Node)) return;
    if (profileMenu) profileMenu.open = false;
  };
  document.addEventListener("pointerdown", closeMenu);
  document.addEventListener("keydown", closeMenu);
  render();
  return {
    refresh: render,
    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      viewerGeneration += 1;
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
      setCapture(false);
      unsubscribe();
      unsubscribeProfile();
      viewer?.dispose();
      viewer = null;
      root.replaceChildren();
    },
  };
}
