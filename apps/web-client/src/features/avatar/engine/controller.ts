import { type AvatarAction, type AvatarState, avatarActions, avatarStates } from "./catalog";
import { subscribeAvatarFrame } from "./clock";
import { type AvatarConfig, parseAvatarConfig, seedHash } from "./config";
import { sampleAvatarLoading } from "./loading";
import { actionDuration, sampleAvatarPose } from "./motion";
import { renderAvatarSvg } from "./render";
import { furTextureKey, loadFurTexture } from "./texture";

export interface AvatarController {
  setConfig(config: AvatarConfig): void;
  setState(state: AvatarState): void;
  setLoading(loading: boolean): void;
  play(action: AvatarAction): void;
  /** Normalized gaze coordinates, clamped to [-1, 1]. */
  lookAt(x: number, y: number): void;
  dispose(): void;
}

let nextId = 0;

function writeAttribute(element: Element | null | undefined, name: string, value: string) {
  if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

/** Mount the framework-independent engine. Dispose it before removing its host. */
export function mountAvatar(
  host: HTMLElement,
  input: AvatarConfig,
  options: {
    state?: AvatarState;
    loading?: boolean;
    animated?: boolean;
    followPointer?: boolean;
    shadow?: boolean;
    onReady?: () => void;
  } = {},
): AvatarController {
  let config = readConfig(input);
  let state = options.state ?? "idle";
  if (!Object.hasOwn(avatarStates, state)) throw new Error("Invalid avatar state.");
  const id = `ngertiin-avatar-${++nextId}`;
  let loading = options.loading ?? false;
  let loadingStarted = performance.now();
  let loadingFace = sampleAvatarLoading(0).face;
  let rings: NodeListOf<SVGElement> | undefined;
  let veins: SVGElement | null = null;
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
  let headX = 0;
  let headY = 0;
  let pointerActive = false;
  // Small idle portraits retain blinking and gaze without repainting every body on every frame.
  const width = host.getBoundingClientRect().width;
  const compact = width < 48;
  let lastTime = 0;
  let action: { type: AvatarAction; started: number } | undefined;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  let textureKey = "";
  let textureHref = "";
  function render() {
    if (textureKey !== furTextureKey(config)) {
      textureKey = furTextureKey(config);
      textureHref = "";
      host.dataset.avatarReady = "false";
      const requestedKey = textureKey;
      const pixels = width * (window.devicePixelRatio || 1);
      // Sidebar, header and detail portraits share a Retina-ready texture for the same identity.
      const textureSize = Math.min(768, Math.max(256, 2 ** Math.ceil(Math.log2(pixels || 64))));
      void loadFurTexture(config, textureSize)
        .then(async (href) => {
          const decoded = new Image();
          decoded.src = href;
          await decoded.decode();
          if (disposed || textureKey !== requestedKey) return;
          textureHref = href;
          const surface = host.querySelector("[data-avatar-surface]");
          const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
          image.setAttribute("href", href);
          image.setAttribute("width", "200");
          image.setAttribute("height", "200");
          surface?.replaceChildren(image);
          host.dataset.avatarReady = "true";
          options.onReady?.();
        })
        .catch(() => {
          // Keep the lightweight shaded fallback usable if image decoding fails.
          if (disposed || textureKey !== requestedKey) return;
          host.dataset.avatarReady = "true";
          options.onReady?.();
        });
    }
    host.innerHTML = renderAvatarSvg(loading ? { ...config, face: loadingFace } : config, {
      loading,
      id,
      state: loading ? "idle" : state,
      shadow: options.shadow,
      textureHref,
    });
    host.dataset.avatarState = state;
    rings = host.querySelectorAll("[data-avatar-loading-ring]");
    veins = host.querySelector("[data-avatar-loading-veins]");
    host.dataset.avatarLoading = String(loading);
    body = host.querySelector("[data-avatar-body]");
    gaze = host.querySelector("[data-avatar-gaze]");
    left = host.querySelector('[data-avatar-eye="left"]');
    right = host.querySelector('[data-avatar-eye="right"]');
    shadow = host.querySelector("[data-avatar-shadow]");
    draw(performance.now(), reduced() || options.animated === false);
  }

  function draw(now: number, reducedMotion: boolean) {
    const loadingPose = sampleAvatarLoading(now - loadingStarted, reducedMotion);
    if (loading && loadingFace !== loadingPose.face) {
      loadingFace = loadingPose.face;
      render();
      return;
    }
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
    if (compact && state === "idle" && !action && !loading) {
      pose.x = pose.y = pose.rotation = 0;
      pose.scaleX = pose.scaleY = 1;
    }
    if (loading) {
      Object.assign(pose, {
        x: loadingPose.x,
        y: loadingPose.y,
        rotation: loadingPose.rotation,
        scaleX: loadingPose.scaleX,
        scaleY: loadingPose.scaleY,
      });
      rings?.forEach((ring) => {
        writeAttribute(ring, "stroke-dashoffset", String(loadingPose.ringOffset));
      });
      writeAttribute(veins, "opacity", String(loadingPose.veinOpacity));
    }
    const focusX = pointerActive ? targetX : pose.gazeX;
    const focusY = pointerActive ? targetY : pose.gazeY;
    const smoothing = 1 - Math.exp(-elapsed / 65);
    const headSmoothing = 1 - Math.exp(-elapsed / 180);
    gazeX = reducedMotion ? 0 : gazeX + (focusX - gazeX) * smoothing;
    gazeY = reducedMotion ? 0 : gazeY + (focusY - gazeY) * smoothing;
    // Eyes find the target first; the head catches up with a smaller, slower turn.
    headX = reducedMotion ? 0 : headX + (focusX - headX) * headSmoothing;
    headY = reducedMotion ? 0 : headY + (focusY - headY) * headSmoothing;
    writeAttribute(
      body,
      "transform",
      `translate(${(pose.x + headX * 2).toFixed(2)} ${(pose.y + headY).toFixed(2)}) translate(100 130) rotate(${(pose.rotation + headX * 5).toFixed(2)}) scale(${(pose.scaleX * (1 - Math.abs(headX) * 0.025)).toFixed(3)} ${pose.scaleY.toFixed(3)}) translate(-100 -130)`,
    );
    writeAttribute(
      gaze,
      "transform",
      `translate(${(gazeX * 13).toFixed(2)} ${(gazeY * 8).toFixed(2)})`,
    );
    writeAttribute(
      left,
      "transform",
      `scale(${(1 - Math.max(0, headX) * 0.18).toFixed(3)} ${pose.eyeLeft.toFixed(3)})`,
    );
    writeAttribute(
      right,
      "transform",
      `scale(${(1 + Math.min(0, headX) * 0.18).toFixed(3)} ${pose.eyeRight.toFixed(3)})`,
    );
    writeAttribute(shadow, "opacity", String(Math.max(0.2, 1 + pose.y / 45)));
    writeAttribute(shadow, "rx", String(60 + pose.y / 2));
  }

  function readConfig(value: AvatarConfig) {
    const parsed = parseAvatarConfig(value);
    if (!parsed) throw new Error("Invalid avatar recipe.");
    return parsed;
  }

  function lookAt(x: number, y: number, active = true) {
    if (disposed) return;
    pointerActive = active;
    targetX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    targetY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  render();
  const unsubscribe =
    options.animated === false
      ? () => {}
      : subscribeAvatarFrame(host, draw, options.followPointer ? lookAt : undefined);

  return {
    setLoading(value) {
      if (disposed || value === loading) return;
      loading = value;
      loadingStarted = performance.now();
      loadingFace = sampleAvatarLoading(0).face;
      action = undefined;
      delete host.dataset.avatarAction;
      render();
    },
    setConfig(value) {
      if (disposed) return;
      const next = readConfig(value);
      if (JSON.stringify(next) === JSON.stringify(config)) return;
      config = next;
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
      host.replaceChildren();
      delete host.dataset.avatarLoading;
      delete host.dataset.avatarState;
      delete host.dataset.avatarAction;
      delete host.dataset.avatarReady;
    },
  };
}
