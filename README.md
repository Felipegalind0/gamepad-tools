# Gamepad Tools

Controller visualization and input bindings for **[foss-earth](https://github.com/Felipegalind0/foss-earth)** and **[0sfs](https://github.com/0SFS/0SFS.github.io)**, built from scratch with **Babylon.js and WebGPU**.

**Status: implementation handoff.** This repository currently contains the scoped implementation prompt, integration research and task list. The toolkit and host integrations have not been implemented yet.

## What it will do

- Show live controller buttons, sticks, analog triggers and other browser-exposed inputs.
- Configure keyboard, button and axis bindings to actions supplied by foss-earth or 0sfs.
- Optionally display an articulated 3D controller inside either host or on a standalone page.
- Support standard Xbox and PlayStation-style inputs, with numeric controls for unfamiliar devices.
- Save, import and export binding profiles independently of the optional model viewer.

The 3D viewer uses Babylon's WebGPU engine. Bindings continue working when the viewer is hidden or unavailable.

Games, galleries, streamer/OBS features, accounts and hardware-programming tools are outside this project's scope.

## Implementation handoff

Start with the **[complete agent prompt](docs/implementation-prompt.md)**. It defines architecture, model behavior, binding capture, storage, concrete host adapters, WebGPU verification and acceptance criteria.

The **[integration research](docs/integration-research.md)** records the existing host boundaries. **[TODO.md](TODO.md)** tracks implementation milestones.

The reusable core owns input snapshots, profiles and action evaluation. foss-earth owns globe camera actions and rendering services. 0sfs owns flight response, JSBSim integration and phone-control authority. The viewer observes controller state; it does not own flight state.

## Project identity and license

Gamepad Tools has independent Git history and original implementation requirements. DualSense Studio is inspiration for controller visualization only; its source, test suite and full product scope are not adopted.

Original work in this repository is [MIT licensed](LICENSE). Third-party models and dependencies require their own verified licenses and attribution. No application assets from DualSense Studio are included.
