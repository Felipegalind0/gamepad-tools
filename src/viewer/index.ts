import {
  ArcRotateCamera,
  Color3,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core";
import type { ControllerInputFrame } from "../core/contracts.js";

export interface ControllerViewerHandle {
  setSnapshot(frame: ControllerInputFrame): void;
  setVisible(visible: boolean): void;
  dispose(): void;
  isDisposed: boolean;
}

export interface ControllerViewerOptions {
  canvas?: HTMLCanvasElement;
  frame?: ControllerInputFrame;
  hostVisible?: boolean;
  showAxes?: boolean;
  showButtons?: boolean;
  onStatus?(status: ControllerViewerStatus): void;
}

export type ViewerBackend = "webgpu" | "webgl" | "fallback" | "unavailable";

export interface ControllerViewerStatus {
  backend: ViewerBackend;
  message?: string;
}

interface ControllerNodes {
  leftStick: AbstractMesh;
  rightStick: AbstractMesh;
  leftTrigger: AbstractMesh;
  rightTrigger: AbstractMesh;
  buttons: AbstractMesh[];
}

function selectedGamepad(frame: ControllerInputFrame): ControllerInputFrame["gamepads"][number] | undefined {
  return frame.gamepads.find((gamepad) => gamepad.mapping === "standard") ?? frame.gamepads[0];
}

function makeMaterial(scene: Scene, name: string, color: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = new Color3(0.12, 0.12, 0.12);
  material.roughness = 0.78;
  return material;
}

function createController(scene: Scene): ControllerNodes {
  const bodyMaterial = makeMaterial(scene, "controller-body", "#202c3a");
  const trimMaterial = makeMaterial(scene, "controller-trim", "#7bd4e8");
  const darkMaterial = makeMaterial(scene, "controller-dark", "#111827");
  const faceMaterials = ["#67d96f", "#e87162", "#58a9e8", "#e1bf57"]
    .map((color, index) => makeMaterial(scene, "face-" + index, color));
  const body = MeshBuilder.CreateBox("controller-body", { width: 5.7, height: 1.0, depth: 2.25 }, scene);
  body.material = bodyMaterial;
  body.scaling.x = 1.05;
  const leftGrip = MeshBuilder.CreateSphere("left-grip", { diameter: 2.0, segments: 24 }, scene);
  leftGrip.position.set(-2.0, -0.55, 0.15);
  leftGrip.scaling.set(0.72, 0.85, 1.05);
  leftGrip.material = bodyMaterial;
  const rightGrip = leftGrip.clone("right-grip")!;
  rightGrip.position.x = 2.0;

  const makeStick = (name: string, x: number): AbstractMesh => {
    const stick = MeshBuilder.CreateCylinder(name, { diameter: 0.82, height: 0.24, tessellation: 32 }, scene);
    stick.position.set(x, 0.68, 0.08);
    stick.material = darkMaterial;
    return stick;
  };
  const leftStick = makeStick("left-stick", -1.1);
  const rightStick = makeStick("right-stick", 1.08);

  const buttons: AbstractMesh[] = [];
  const positions = [[1.78, 0.72, 0.36], [2.18, 0.72, 0.0], [1.38, 0.72, 0.0], [1.78, 0.72, -0.36]];
  positions.forEach((position, index) => {
    const button = MeshBuilder.CreateCylinder("face-" + index, { diameter: 0.34, height: 0.16, tessellation: 24 }, scene);
    button.position.set(position[0], position[1], position[2]);
    button.material = faceMaterials[index];
    buttons.push(button);
  });
  const dpad = MeshBuilder.CreateBox("dpad", { width: 0.88, height: 0.14, depth: 0.88 }, scene);
  dpad.position.set(-1.85, 0.66, 0.02);
  dpad.material = trimMaterial;
  buttons.push(dpad);
  const menu = MeshBuilder.CreateBox("menu", { width: 0.46, height: 0.12, depth: 0.2 }, scene);
  menu.position.set(0, 0.66, -0.46);
  menu.material = trimMaterial;
  buttons.push(menu);

  const leftTrigger = MeshBuilder.CreateBox("left-trigger", { width: 1.1, height: 0.26, depth: 0.72 }, scene);
  leftTrigger.position.set(-1.75, 0.6, 1.22);
  leftTrigger.material = darkMaterial;
  const rightTrigger = leftTrigger.clone("right-trigger")!;
  rightTrigger.position.x = 1.75;
  return { leftStick, rightStick, leftTrigger, rightTrigger, buttons };
}

export function createControllerViewer(options: ControllerViewerOptions = {}): ControllerViewerHandle {
  let disposed = false;
  let visible = options.hostVisible !== false;
  let latest = options.frame;
  let engine: WebGPUEngine | null = null;
  let scene: Scene | null = null;
  let nodes: ControllerNodes | null = null;
  let resizeListener: (() => void) | null = null;
  let renderLoop: (() => void) | null = null;

  const publish = (status: ControllerViewerStatus): void => options.onStatus?.(status);
  const updateNodes = (): void => {
    if (!nodes || !latest) {
      return;
    }
    const pad = selectedGamepad(latest);
    const axis = (index: number): number => pad?.axes[index] ?? 0;
    const button = (index: number): number => pad?.buttons[index] ?? 0;
    nodes.leftStick.rotation.x = axis(1) * 0.42;
    nodes.leftStick.rotation.z = -axis(0) * 0.42;
    nodes.rightStick.rotation.x = axis(3) * 0.42;
    nodes.rightStick.rotation.z = -axis(2) * 0.42;
    nodes.leftTrigger.rotation.x = -button(6) * 0.48;
    nodes.rightTrigger.rotation.x = -button(7) * 0.48;
    nodes.buttons.forEach((mesh, index) => {
      const value = index < 4 ? button(index) : index === 4
        ? Math.max(button(12), button(13), button(14), button(15))
        : Math.max(button(8), button(9));
      mesh.position.y = (index < 4 ? 0.72 : 0.66) - value * 0.1;
    });
  };
  const startRenderLoop = (): void => {
    if (!engine || !scene || !visible || !renderLoop) {
      return;
    }
    engine.runRenderLoop(renderLoop);
  };
  const stopRenderLoop = (): void => {
    if (engine && renderLoop) {
      engine.stopRenderLoop(renderLoop);
    }
  };

  const initialize = async (): Promise<void> => {
    if (!options.canvas) {
      publish({ backend: "fallback", message: "No canvas was supplied; bindings remain available." });
      return;
    }
    if (typeof navigator === "undefined") {
      publish({ backend: "unavailable", message: "The viewer requires a browser." });
      return;
    }
    try {
      if (!await WebGPUEngine.IsSupportedAsync) {
        publish({ backend: "unavailable", message: "WebGPU is unavailable; bindings still work without 3D." });
        return;
      }
      if (disposed) {
        return;
      }
      const webgpu = new WebGPUEngine(options.canvas, { adaptToDeviceRatio: true });
      await webgpu.initAsync();
      if (disposed) {
        webgpu.dispose();
        return;
      }
      engine = webgpu;
      scene = new Scene(webgpu);
      scene.clearColor.set(0.035, 0.055, 0.08, 1);
      const camera = new ArcRotateCamera("controller-camera", -Math.PI / 2, 1.08, 8.2, Vector3.Zero(), scene);
      camera.lowerRadiusLimit = 5.4;
      camera.upperRadiusLimit = 10;
      camera.attachControl(options.canvas, true);
      const light = new HemisphericLight("controller-light", new Vector3(-0.5, 1, -0.4), scene);
      light.intensity = 1.25;
      nodes = createController(scene);
      renderLoop = () => {
        updateNodes();
        scene?.render();
      };
      resizeListener = () => engine?.resize();
      window.addEventListener("resize", resizeListener);
      updateNodes();
      publish({ backend: "webgpu" });
      startRenderLoop();
    } catch (error) {
      publish({
        backend: "unavailable",
        message: error instanceof Error ? "WebGPU viewer failed: " + error.message : "WebGPU viewer failed to initialize.",
      });
    }
  };

  void initialize();
  return {
    get isDisposed(): boolean {
      return disposed;
    },
    setSnapshot(frame) {
      latest = frame;
      updateNodes();
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      if (options.canvas) {
        options.canvas.hidden = !visible;
      }
      if (visible) {
        startRenderLoop();
      } else {
        stopRenderLoop();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopRenderLoop();
      if (resizeListener) {
        window.removeEventListener("resize", resizeListener);
      }
      scene?.dispose();
      engine?.dispose();
      scene = null;
      engine = null;
      nodes = null;
    },
  };
}

export function queryViewerStatus(): ControllerViewerStatus {
  if (typeof navigator === "undefined") {
    return { backend: "unavailable", message: "server-side environment" };
  }

  return { backend: "webgpu", message: "WebGPU initializes when a viewer canvas is mounted." };
}
