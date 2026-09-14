# Gamepad Tools

Controller visualization and input bindings for **[foss-earth](https://github.com/Felipegalind0/foss-earth)** and **[0SFS](https://github.com/0SFS/0SFS.github.io)**, built from scratch with Babylon.js/WebGPU support.

## Current state

The project now includes a reusable, framework-independent core in `src/core` with:

- typed action descriptors and host adapter contract
- host-neutral controller snapshots (gamepad and keyboard)
- transform and command-evaluation primitives
- versioned profile normalization/parsing
- profile persistence abstraction
- a stateful evaluator for action/command intent frames

The `browser`, `viewer` and `ui` entrypoints are scaffolded for incremental wiring.

The toolkit and host integrations are partially implemented. `foss-earth` and `0sfs` are still to be integrated.

## Scope

- Show live controller buttons, sticks, analog triggers and other browser-exposed inputs.
- Configure keyboard, button and axis bindings to actions supplied by foss-earth or 0sfs.
- Optionally display a 3D controller inside either host or on a standalone page.
- Support standard Xbox and PlayStation-style inputs, with numeric controls for unfamiliar devices.
- Save, import and export binding profiles independently of the optional model viewer.

The full implementation requires:

- host adapters in foss-earth and 0sfs
- a full Babylon/WebGPU model viewer
- headless browser verification and WebGPU proof points

Games, galleries, OBS/streaming and hardware-programming tools are outside this project's scope.

## Project identity and license

Gamepad Tools has independent project history and original implementation requirements. DualSense Studio is inspiration for controller visualization only; its source, tests, or product scope are not adopted.

## License

MIT (see LICENSE).
