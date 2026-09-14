# Gamepad Tools

Controller and keyboard bindings, a binding editor, and an optional 3D controller view for
**[FOSS Earth](https://github.com/foss-earth/foss-earth.github.io)** and
**[0SFS](https://github.com/0SFS/0SFS.github.io)**, built from scratch with Babylon.js/WebGPU support.

## Current state

The core, the browser input source, the binding editor and the viewer are implemented, and both
apps use them. What has actually been checked is narrower than that — see
[Validation](#validation) and [TODO.md](TODO.md).

### Entry points

The `exports` map offers:

- **`/core`**, and the same exports from the package root:
  - `BindingRuntime`, which evaluates each input frame once for a host and passes the resulting
    intents to that host's adapter.
  - The versioned profile schema, with `normalizeProfile`, `parseProfile` and `validateProfileImport`.
  - The evaluator, which turns an input frame into axis, value, rate and command intents, and
    reports actions bound more than once in a context as conflicts.
  - Transforms: deadzone (scaled or cutoff), linear or expo response curves, inversion and scaling,
    and command thresholds with hysteresis.
  - `BindingCaptureSession`, whose phases run awaiting release → listening → candidate → confirm, so
    a control already held when capture starts cannot become the new binding.
  - `createProfileStore`, which keeps profiles per host in `localStorage`, or in memory when that is
    unavailable.
- **`/browser`**:
  - `createBrowserInputSource`, which samples the keyboard and gamepads, ignores typing in form
    fields, picks a controller itself and takes an explicit `selectDevice`.
  - `createGamepadSourceScheduler`.
- **`/ui`**: `mountBindingEditor`, which provides
  - a profile selector holding the host's built-in profiles and the saved ones, with rename,
    duplicate and delete — editing a built-in profile saves a copy instead of overwriting it;
  - **Import profile** and **Export profile** as JSON, where an import is validated and refused if it
    belongs to another host;
  - press-to-bind capture, which suppresses the host's own input and asks whether to keep or replace
    a control that is already bound;
  - live numeric axis and button values under **Input details**, where an input can be picked before
    the action, and a controller selector;
  - a **Show 3D controller** checkbox that loads the viewer only when it is ticked.
- **`/viewer`**: `createControllerViewer`.
  - Draws a generic controller from Babylon.js primitives. Sticks tilt, and triggers and buttons move.
  - Runs on WebGPU only, and reports `unavailable` otherwise. The `"webgl"` value its backend type
    allows is never produced.
  - Can be hidden; bindings keep working without it.
- **`/styles.css`**: styles for the editor.

### The apps

- **0SFS**: the flight adapter and its built-in **Xbox** and **Classic** profiles are in
  `src/flight/input/gamepadToolsAdapter.ts`; the editor sits in the flight panel's **Controls** tab;
  haptics follow the selected controller.
- **FOSS Earth**: the globe adapter and its built-in **Standard controller** profile are in
  `src/input/globeNavigation.ts`; the **Controller bindings** button opens the editor.

## Building

`dist/` is not committed and the package exports point at it, so build this checkout before an app
that links it can install or run:

```sh
npm install
npm run build
npm run typecheck
```

`npm run demo` starts a Vite development server with the standalone editor page in `demo/`.

Both apps link this repository from a sibling folder, `file:../Felipegalind0/gamepad-tools`, so run
`npm run build` again after changing `src/`. They read the rebuilt `dist/` without reinstalling.
`styles.css` is the one export served straight from `src/`.

## Validation

- This repository has no tests. `npm run typecheck` and `npm run build` pass.
- The apps test their own integrations, in jsdom:
  - 0SFS drives the flight profiles with simulated gamepads in
    `src/flight/input/gamepadProfiles.test.ts`, and covers the editor's profile selector, menu and
    preview in `src/flight/hud/GamepadBindingsPanel.test.ts`.
  - FOSS Earth drives the globe profile with simulated gamepads in
    `src/input/globeNavigation.test.ts`.
- Nothing has been recorded from a real controller or on real WebGPU hardware.

## Scope

- Show live controller buttons, sticks, analog triggers and other browser-exposed inputs.
- Configure keyboard, button and axis bindings to actions supplied by foss-earth or 0sfs.
- Optionally display a 3D controller inside either host or on a standalone page.
- Support standard Xbox and PlayStation-style inputs, with numeric controls for unfamiliar devices.
- Save, import and export binding profiles independently of the optional model viewer.

Still outstanding:

- a detailed, articulated model viewer
- headless browser verification and WebGPU proof points

Games, galleries, OBS/streaming and hardware-programming tools are outside this project's scope.

## Project identity and license

Gamepad Tools has independent project history and original implementation requirements. DualSense Studio is inspiration for controller visualization only; its source, tests, or product scope are not adopted.

## License

MIT (see LICENSE).
