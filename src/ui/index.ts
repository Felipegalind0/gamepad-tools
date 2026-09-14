import type { ActionDescriptor } from "../core/contracts.js";

export interface BindingPanelState {
  host: string;
  context: string;
  profilesLoaded: boolean;
  activeActionCatalog: readonly ActionDescriptor[];
}

export interface BindingConflictSummary {
  actionId: string;
  bindingIds: readonly string[];
  reason: string;
}

export function summarizeConflicts(frame: { conflicts: readonly { actionId: string; bindingIds: readonly string[]; reason: string }[] }):
  BindingConflictSummary[] {
  return frame.conflicts.map((entry) => ({
    actionId: entry.actionId,
    bindingIds: entry.bindingIds,
    reason: entry.reason,
  }));
}

export function createPanelState(host: string, context: string, catalog: readonly ActionDescriptor[]): BindingPanelState {
  return {
    host,
    context,
    profilesLoaded: false,
    activeActionCatalog: catalog,
  };
}

export function markProfilesLoaded(state: BindingPanelState): BindingPanelState {
  return {
    ...state,
    profilesLoaded: true,
  };
}

export * from "./editor.js";
