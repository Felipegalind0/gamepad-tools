# Gamepad Tools implementation

A ticked item is present in the code. That is not the same as validated: this repository has no
tests, the apps test their integrations in jsdom only, and nothing has been checked on a real
controller or real WebGPU hardware.

## Required first implementation

- [x] Define a host-neutral action catalog, source snapshot and versioned binding schema.
- [x] Scaffold a pure core package with snapshot, profile parsing and binding evaluation.
- [x] Implement keyboard/gamepad acquisition, explicit device selection and a single source owner per host.
- [x] Implement transforms, command edges, rate/absolute/value intents, conflicts and validated profile persistence/import/export.
- [x] Build action-first and control-first binding capture, with host-effect suppression and usable numeric live feedback.
  Action-first listens for the next control pressed. Control-first picks an axis or button from the
  numbers under **Input details**; it does not listen for a press.
- Controller viewer:
  - [x] Add an original Babylon/WebGPU controller viewer that can be hidden without disabling
    bindings. It is a generic controller built from primitives; sticks tilt, and triggers and
    buttons move.
  - [ ] Articulate a detailed controller model. The viewer has no model file.
  - [ ] Render without WebGPU. The viewer reports `unavailable` instead, and never produces the
    `"webgl"` backend value its type allows.
  - [ ] Make `queryViewerStatus()` check for WebGPU. It reports `webgpu` whenever `navigator` exists.
- Controller labels:
  - [x] Show generic numeric controls for unknown layouts (`Axis n` and `Button n` under **Input details**).
  - [x] Name bound controls with Xbox labels when the selected controller uses the standard mapping.
  - [ ] Add PlayStation labels, and layout names during capture and under **Input details**, which
    show only numbers.
- [x] Integrate foss-earth camera actions, panel mounting and on-demand render scheduling through public hooks.
- [x] Integrate 0sfs flight defaults, capture of all command paths, phone authority and selected-device haptics.
- Packaging and adoption:
  - [x] Package public exports and types.
  - [x] Document how each host checks out and builds this package (in each app's development guide).
  - [ ] Make adoption reproducible. Both apps link a sibling folder, with no release or revision pin.
- Validation:
  - [x] Test the host integrations in jsdom: the 0sfs flight profiles and the foss-earth globe
    profile with simulated gamepads, and the 0sfs bindings panel's profile menu and preview.
  - [ ] Add core tests to this repository.
  - [ ] Run production-build and headless browser workflows.
  - [ ] Record actual controller, browser and WebGPU hardware evidence, kept separate from synthetic results.
- Documentation:
  - [x] Document the entry points, the apps that use them and the current validation (README).
  - [ ] Document the binding profile format and a host integration guide.
  - [ ] Document physical-device compatibility.

## Related follow-up work

- [ ] Improve detailed controller model fidelity using original or verified licensed assets.
- [ ] Add verified profiles for additional controller families and accessibility devices.
- [ ] Extend numeric axis/button workflows for complex HOTAS/wheel/pedal devices as host needs require.

Games, galleries, OBS/streaming and hardware-programming features are excluded scope, not pending milestones.
