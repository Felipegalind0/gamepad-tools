# Agent instructions

## Scope

- Build an original controller visualization and binding toolkit specifically for foss-earth and 0sfs. Read `docs/implementation-prompt.md` before implementation.
- Babylon.js/WebGPU is required for the first 3D implementation. Keep the core/editor usable without a GPU or model.
- DualSense Studio is inspiration only. Do not fork, translate or import its application code, history or tests.
- Do not add games, galleries, streaming/OBS, accounts, leaderboards or a hardware-diagnostics/programming suite.
- Keep reusable source/profile/evaluation logic in this repository. Host-specific adapters remain in foss-earth and 0sfs.
- Preserve 0sfs phone/local authority and the host-owned JSBSim boundary. Respect existing host instructions before editing or testing them.

## Rendering and testing

- Prefer terminal/scripts/APIs/headless tests. Do not use a visible browser or the user's cursor when headless verification suffices.
- Verify the active backend and real hardware GPU before reporting GPU benchmark results. Software rendering is not hardware acceleration evidence.
- Do not make the optional viewer own the host input loop, flight state or shared engine lifetime. Hiding it must leave bindings operational.
- Separate synthetic tests from actual controller/browser/transport observations.
- Keep scope, implementation status and validation claims accurate in documentation.
