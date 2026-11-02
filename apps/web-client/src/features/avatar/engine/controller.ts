import { type AvatarAction, type AvatarState, avatarActions, avatarStates } from "./catalog";
import { subscribeAvatarFrame } from "./clock";
import { type AvatarConfig, parseAvatarConfig, seedHash } from "./config";
import { actionDuration, sampleAvatarPose } from "./motion";
import { renderAvatarSvg } from "./render";

export interface AvatarController {
  setConfig(config: AvatarConfig): void;
  setState(state: AvatarState): void;
  play(action: AvatarAction): void;
  /** Normalized gaze coordinates, clamped to [-1, 1]. */
  lookAt(x: number, y: number): void;
  dispose(): void;
}

let nextId = 0;

/** Mount the framework-independent engine. Dispose it before removing its host. */
export function mountAvatar(
  host: HTMLElement,
  input: AvatarConfig,
  options: {
    state?: AvatarState;
    animated?: boolean;
    followPointer?: boolean;
    shadow?: boolean;
  } = {},
): AvatarController {
  let config = readConfig(input);
  let state = options.state ?? "idle";
  if (!Object.hasOwn(avatarStates, state)) throw new Error("Invalid avatar state.");
  const id = `ngertiin-avatar-${++nextId}`;
  let disposed = false;
  let body: SVGGElement | null = null;
  let gaze: SVGGElement | null = null;
  let left: SVGGElement | null = null;
  let right: SVGGElement | null = null;
  let shadow: SVGEllipseElement | null = null;
  let targetX = 0;
  let targetY = 0;
  let gazeX = 0;
  let gazeY = 0;
  let lastTime = 0;
  let action: { type: AvatarAction; started: number } | undefined;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render() {
    host.innerHTML = renderAvatarSvg(config, { id, state, shadow: options.shadow });
    host.dataset.avatarState = state;
    body = host.querySelector("[data-avatar-body]");
    gaze = host.querySelector("[data-avatar-gaze]");
    left = host.querySelector('[data-avatar-eye="left"]');
    right = host.querySelector('[data-avatar-eye="right"]');
    shadow = host.querySelector("[data-avatar-shadow]");
    draw(performance.now(), reduced() || options.animated === false);
  }

  function draw(now: number, reducedMotion: boolean) {
    const elapsed = Math.min(64, lastTime ? now - lastTime : 32);
    lastTime = now;
    if (action && now - action.started >= actionDuration[action.type]) {
      action = undefined;
      delete host.dataset.avatarAction;
    }
    const offset = seedHash(config.seed) % 4700;
    const pose = sampleAvatarPose(
      now + offset,
      state,
      action
        ? {
            type: action.type,
            progress: (now - action.started) / actionDuration[action.type],
          }
        : undefined,
      reducedMotion,
    );
    const smoothing = 1 - Math.exp(-elapsed / 95);
    gazeX = reducedMotion ? 0 : gazeX + (targetX - gazeX) * smoothing;
    gazeY = reducedMotion ? 0 : gazeY + (targetY - gazeY) * smoothing;
    body?.setAttribute(
      "transform",
      `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) translate(100 130) rotate(${pose.rotation.toFixed(2)}) scale(${pose.scaleX.toFixed(3)} ${pose.scaleY.toFixed(3)}) translate(-100 -130)`,
    );
    gaze?.setAttribute(
      "transform",
      `translate(${(gazeX * 7).toFixed(2)} ${(gazeY * 5).toFixed(2)})`,
    );
    left?.setAttribute("transform", `scale(1 ${pose.eyeLeft.toFixed(3)})`);
    right?.setAttribute("transform", `scale(1 ${pose.eyeRight.toFixed(3)})`);
    shadow?.setAttribute("opacity", String(Math.max(0.2, 1 + pose.y / 45)));
    shadow?.setAttribute("rx", String(60 + pose.y / 2));
  }

  function readConfig(value: AvatarConfig) {
    const parsed = parseAvatarConfig(value);
    if (!parsed) throw new Error("Invalid avatar recipe.");
    return parsed;
  }

  function lookAt(x: number, y: number) {
    if (disposed) return;
    targetX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    targetY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  function pointer(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    lookAt(
      (event.clientX - rect.x - rect.width / 2) / (rect.width / 2),
      (event.clientY - rect.y - rect.height / 2) / (rect.height / 2),
    );
  }
  function resetPointer() {
    lookAt(0, 0);
  }
  render();
  const unsubscribe = options.animated === false ? () => {} : subscribeAvatarFrame(host, draw);
  if (options.followPointer && options.animated !== false) {
    document.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("pointerleave", resetPointer);
    window.addEventListener("blur", resetPointer);
  }

  return {
    setConfig(value) {
      if (disposed) return;
      config = readConfig(value);
      render();
    },
    setState(value) {
      if (disposed || value === state) return;
      if (!Object.hasOwn(avatarStates, value)) throw new Error("Invalid avatar state.");
      state = value;
      render();
    },
    play(type) {
      if (disposed || options.animated === false || reduced()) return;
      if (!Object.hasOwn(avatarActions, type)) throw new Error("Invalid avatar action.");
      action = { type, started: performance.now() };
      host.dataset.avatarAction = type;
    },
    lookAt,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer);
      host.replaceChildren();
      delete host.dataset.avatarState;
      delete host.dataset.avatarAction;
    },
  };
}
