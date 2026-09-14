# Gamepad Tools implementation

The repository currently contains the implementation handoff. These tasks have not been completed.

## Required first implementation

- [ ] Define a host-neutral action catalog, source snapshot and versioned binding schema.
- [ ] Implement keyboard/gamepad acquisition, explicit device selection and a single source owner per host.
- [ ] Implement transforms, command edges, rate/absolute intents, conflicts and validated profile persistence/import/export.
- [ ] Build action-first and control-first binding capture, with host-effect suppression and usable numeric live feedback.
- [ ] Add an original articulated Babylon/WebGPU controller viewer that can be hidden without disabling bindings.
- [ ] Add standard Xbox/PlayStation labels and generic numeric controls for unknown layouts.
- [ ] Integrate foss-earth camera actions, panel mounting and on-demand render scheduling through public hooks.
- [ ] Integrate 0sfs flight defaults, capture of all command paths, phone authority and selected-device haptics.
- [ ] Package public exports/types and document reproducible adoption by both hosts.
- [ ] Run core and host regression checks plus production/headless workflows; record actual WebGPU/hardware evidence separately.
- [ ] Document binding formats, host integration, validation and physical-device compatibility.

## Related follow-up work

- [ ] Improve detailed controller model fidelity using original or verified licensed assets.
- [ ] Add verified profiles for additional controller families and accessibility devices.
- [ ] Extend numeric axis/button workflows for complex HOTAS/wheel/pedal devices as host needs require.

Games, galleries, OBS/streaming and hardware-programming features are excluded scope, not pending milestones.
