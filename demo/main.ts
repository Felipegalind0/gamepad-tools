import "../src/styles.css";
import { createBrowserInputSource } from "../src/browser/index.js";
import {
  BindingRuntime,
  createDefaultProfile,
  type ActionIntentFrame,
  type HostInputAdapter,
} from "../src/core/index.js";
import { mountBindingEditor } from "../src/ui/index.js";

const output = document.createElement("pre");
const adapter: HostInputAdapter = {
  namespace: "foss-earth",
  actions: [
    { id: "demo.axis", label: "Demo axis", category: "Demo", kind: "axis", range: [-1, 1], contexts: ["demo"], available: true },
    { id: "demo.command", label: "Demo command", category: "Demo", kind: "command", contexts: ["demo"], available: true },
  ],
  getContext: () => "demo",
  applyIntents(frame: ActionIntentFrame) {
    output.textContent = JSON.stringify(frame.intents, null, 2);
  },
  setBindingCapture() {},
};
const source = createBrowserInputSource();
const runtime = new BindingRuntime({
  adapter,
  profile: createDefaultProfile("foss-earth"),
});
source.subscribe((frame) => runtime.dispatch(frame));
source.start({ intervalMs: 33 });
const app = document.querySelector<HTMLElement>("#app")!;
mountBindingEditor({ root: app, runtime, source });
document.body.append(output);
