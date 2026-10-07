/**
 * Which keys the control that has focus uses itself. The bindings of whatever
 * is behind the page's controls, a vehicle's keys or a camera's, leave those
 * keys to it and take the rest: a slider moving its thumb with the arrow keys
 * still lets W, A, S and D fly, where a text field takes every key, since each
 * one types.
 *
 * A focused control takes:
 * - every key, when it is a text field, a text area, a dropdown or editable
 *   content, or has role textbox, searchbox or combobox;
 * - the arrows, Page Up, Page Down, Home and End, when it is a range input or
 *   has role slider, spinbutton or scrollbar;
 * - Space, when it is a checkbox or has role checkbox or switch;
 * - Space and the arrows, when it is a radio button or has role radio;
 * - Space and Enter, when it is a button or a summary, or has role button;
 *   Enter, when it is a link or has role link;
 * - Space, Enter, the arrows, Home and End, when it is an item of a menu,
 *   list, tab strip, tree or grid (role menuitem, option, tab, treeitem or
 *   gridcell), and the arrows, Home and End when it is the menu, list, tab
 *   strip, tree, grid, radio group or toolbar itself;
 * - exactly the keys it names in `data-takes-keys`, whatever else it is: a
 *   space-separated list of `KeyboardEvent.key` values, with "Space" for the
 *   space bar, for a control whose keys none of the above describes.
 *
 * Anything else, such as the page's body or a plain element, takes no key.
 */

/** The attribute a control names its keys in. */
export const TAKES_KEYS_ATTRIBUTE = "data-takes-keys";

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
const SLIDER = new Set([...ARROWS, "PageUp", "PageDown", "Home", "End"]);
const SPACE = new Set([" "]);
const RADIO = new Set([" ", ...ARROWS]);
const BUTTON = new Set([" ", "Enter"]);
const LINK = new Set(["Enter"]);
const ITEM = new Set([" ", "Enter", ...ARROWS, "Home", "End"]);
const GROUP = new Set([...ARROWS, "Home", "End"]);
const NONE = new Set<string>();

/** Input types whose every key types into them. */
const TEXT_INPUTS = new Set([
  "text", "search", "email", "url", "tel", "password", "number",
  "date", "time", "datetime-local", "month", "week",
]);

const ROLE_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  slider: SLIDER, spinbutton: SLIDER, scrollbar: SLIDER,
  checkbox: SPACE, switch: SPACE,
  radio: RADIO,
  button: BUTTON,
  link: LINK,
  menuitem: ITEM, menuitemcheckbox: ITEM, menuitemradio: ITEM, option: ITEM, tab: ITEM, treeitem: ITEM, gridcell: ITEM,
  menu: GROUP, menubar: GROUP, listbox: GROUP, tablist: GROUP, tree: GROUP, treegrid: GROUP, grid: GROUP, radiogroup: GROUP, toolbar: GROUP,
};
const EVERY_KEY_ROLES = new Set(["textbox", "searchbox", "combobox"]);

/** The keys a control names in its `data-takes-keys`, or null when it names none. */
function namedKeys(element: Element): ReadonlySet<string> | null {
  const named = element.getAttribute(TAKES_KEYS_ATTRIBUTE);
  if (named === null) return null;
  return new Set(named.split(/\s+/).filter(Boolean).map(key => (key === "Space" ? " " : key)));
}

/** "every" for a control that takes every key, else the keys it takes. */
function keysOf(target: EventTarget | null): "every" | ReadonlySet<string> {
  // An element of the page, whichever window it came from.
  if (!target || typeof (target as Element).getAttribute !== "function") return NONE;
  const element = target as HTMLElement;
  const named = namedKeys(element);
  if (named) return named;
  if (element.isContentEditable) return "every";
  const role = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (role && EVERY_KEY_ROLES.has(role)) return "every";
  if (role && ROLE_KEYS[role]) return ROLE_KEYS[role];
  switch (element.tagName) {
    case "TEXTAREA":
    case "SELECT":
      return "every";
    case "INPUT": {
      const type = (element as HTMLInputElement).type;
      if (TEXT_INPUTS.has(type)) return "every";
      if (type === "range") return SLIDER;
      if (type === "checkbox") return SPACE;
      if (type === "radio") return RADIO;
      return type === "hidden" ? NONE : BUTTON;
    }
    case "BUTTON":
    case "SUMMARY":
      return BUTTON;
    case "A":
      return element.hasAttribute("href") ? LINK : NONE;
    default:
      return NONE;
  }
}

/** Whether the focused control `target`, a key event's target, uses `key`, a `KeyboardEvent.key`, itself. */
export function controlTakesKey(target: EventTarget | null, key: string): boolean {
  const keys = keysOf(target);
  return keys === "every" || keys.has(key);
}

/** Whether the focused control `target` takes every key, as a text field does. */
export function controlTakesEveryKey(target: EventTarget | null): boolean {
  return keysOf(target) === "every";
}
