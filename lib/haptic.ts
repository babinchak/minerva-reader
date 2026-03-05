/**
 * Haptic feedback for mobile.
 * - Android: Vibration API (navigator.vibrate)
 * - iOS Safari 17.4+: hidden <input switch> toggle (Apple doesn't support Vibration API)
 * Requires user gesture; no-op when unsupported.
 */

const canVibrate =
  typeof navigator !== "undefined" && "vibrate" in navigator;

/** Touch device (iOS uses switch fallback since it lacks vibrate) */
const isTouchDevice =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** Persistent switch for iOS – toggling may work from async (no create in callback) */
let iosSwitchEl: HTMLInputElement | null = null;
let iosSwitchLabel: HTMLLabelElement | null = null;

function ensureIosSwitch() {
  if (iosSwitchEl && document.body.contains(iosSwitchLabel!)) return;
  if (typeof document === "undefined") return;
  try {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitchEl = input;
    iosSwitchLabel = label;
  } catch {
    /* no-op */
  }
}

/** iOS fallback: toggle hidden switch to trigger haptic (Safari 17.4+) */
function iosHaptic() {
  if (typeof document === "undefined") return;
  try {
    ensureIosSwitch();
    if (iosSwitchLabel) iosSwitchLabel.click();
  } catch {
    /* no-op */
  }
}

function trigger(ms?: number | number[]) {
  if (canVibrate) {
    navigator.vibrate(ms ?? 40);
    return;
  }
  if (isTouchDevice) iosHaptic();
}

/** Short pulse – send button, Explain selection */
export function hapticLight() {
  trigger(40);
}

/** Medium pulse – AI response complete */
export function hapticMedium() {
  trigger(50);
}

/** Stronger pattern – markdown header appeared during streaming */
export function hapticHeader() {
  if (canVibrate) {
    navigator.vibrate([30, 15, 60]);
    return;
  }
  if (isTouchDevice) {
    iosHaptic();
    setTimeout(iosHaptic, 120);
  }
}

/** Very light – drawer snap */
export function hapticSnap() {
  trigger(20);
}

