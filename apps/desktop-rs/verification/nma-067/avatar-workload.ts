// Reference-only workload. Imports the actual engine; never native runtime code.
import { type AvatarState } from "../../../../packages/avatar/src/catalog";
import { createAvatar, defaultAgentAvatar } from "../../../../packages/avatar/src/config";
import { mountAvatar } from "../../../web-client/src/features/avatar/engine/controller";
import {
  isPageVisible,
  subscribePageVisibility,
} from "../../../web-client/src/lib/page-visibility";

const root = document.querySelector<HTMLDivElement>("#avatars");
const status = document.querySelector<HTMLParagraphElement>("#status");
const start = document.querySelector<HTMLButtonElement>("#start");
const from = document.querySelector<HTMLSelectElement>("#from");
if (!root || !status || !start || !from)
  throw new Error("The reference fixture controls are missing.");
status.textContent = `Ready. Viewport ${innerWidth}×${innerHeight} @${devicePixelRatio}. No inference or application-state mutations.`;
const workloads = [1, 10, 30].flatMap((count) =>
  (["idle", "thinking", "working"] as AvatarState[]).map((state) => ({ count, state })),
);
const visible = () => isPageVisible() && !document.hidden;
let stopped = false;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

start.onclick = async () => {
  if (start.dataset.running) {
    stopped = true;
    return;
  }
  start.dataset.running = "true";
  start.textContent = "Stop benchmark matrix";
  stopped = false;
  from.disabled = true;
  let completed = 0;
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      throw new Error("Disable the fixture's reduced-motion override before the normal matrix.");
    for (let index = Number(from.value); index < workloads.length; index++) {
      const { count, state } = workloads[index];
      from.value = String(index);
      if (stopped) break;
      root.replaceChildren();
      const controllers = Array.from({ length: count }, (_, i) => {
        const host = document.createElement("div");
        const edge = count === 1 ? 128 : 32;
        host.className = "ngertiin-avatar";
        host.style.setProperty("--avatar-size", `${edge}px`);
        root.append(host);
        return mountAvatar(
          host,
          count === 1 ? defaultAgentAvatar("ignored", true) : createAvatar(`native-live-${i}`),
          { state, animated: true, followPointer: true, shadow: false },
        );
      });
      status.textContent = `${count} avatars · ${state} · preparing textures`;
      const readyCount = () => root.querySelectorAll("[data-avatar-surface] image[href]").length;
      const preparationStarted = performance.now();
      while (!stopped && readyCount() !== count && performance.now() - preparationStarted < 60000)
        await pause(200);
      if (readyCount() !== count) {
        controllers.forEach((controller) => controller.dispose());
        throw new Error("The original avatar textures did not become ready. Retry the workload.");
      }
      const layout = () =>
        [...root.children].map((host) => {
          const bounds = host.getBoundingClientRect();
          const svg = host.querySelector("svg")?.getBoundingClientRect();
          return {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            svg_width: svg?.width,
            svg_height: svg?.height,
          };
        });
      const edge = count === 1 ? 128 : 32;
      const validLayout = () =>
        layout().length === count &&
        layout().every(
          (box) =>
            Math.abs(box.width - edge) < 0.01 &&
            Math.abs(box.height - edge) < 0.01 &&
            Math.abs((box.svg_width ?? 0) - edge) < 0.01 &&
            Math.abs((box.svg_height ?? 0) - edge) < 0.01 &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= innerWidth &&
            box.y + box.height <= innerHeight,
        );
      if (!validLayout()) {
        controllers.forEach((controller) => controller.dispose());
        throw new Error(
          "Avatar layout does not match the native sizes or visible viewport. Correct it before measuring.",
        );
      }
      await document.fonts.ready;
      let warmed = 0;
      let lastWarm = performance.now();
      while (!stopped && warmed < 5000) {
        const now = performance.now();
        if (visible()) warmed += now - lastWarm;
        lastWarm = now;
        status.textContent = visible()
          ? `${count} avatars · ${state} · warming`
          : "Waiting for a visible window before warming.";
        await pause(100);
      }
      if (stopped) {
        controllers.forEach((controller) => controller.dispose());
        break;
      }
      const viewport = [innerWidth, innerHeight];
      const scale = devicePixelRatio;
      const started = new Date().toISOString();
      const began = performance.now();
      const frames: number[] = [];
      const mutations: number[] = [];
      const visibility: [number, boolean][] = [];
      let active = false;
      let visibleMs = 0;
      let lastVisibilityAt = began;
      let previous: number | undefined;
      let request = 0;
      const sampleVisibility = () => {
        const now = performance.now();
        if (active) visibleMs += now - lastVisibilityAt;
        lastVisibilityAt = now;
        const next = visible();
        if (!visibility.length || next !== active) {
          visibility.push([now - began, next]);
          previous = undefined;
        }
        active = next;
      };
      sampleVisibility();
      const unsubscribe = subscribePageVisibility(sampleVisibility);
      document.addEventListener("visibilitychange", sampleVisibility);
      const frame = (now: number) => {
        if (active && previous !== undefined) frames.push(now - previous);
        previous = now;
        request = requestAnimationFrame(frame);
      };
      request = requestAnimationFrame(frame);
      const observer = new MutationObserver(() => mutations.push(performance.now() - began));
      observer.observe(root, { attributes: true, subtree: true });
      status.textContent = `Recording ${count} avatars · ${state} · 120 visible seconds`;
      try {
        while (!stopped) {
          sampleVisibility();
          if (
            innerWidth !== viewport[0] ||
            innerHeight !== viewport[1] ||
            devicePixelRatio !== scale
          )
            throw new Error(
              "The viewport or scale changed. Restore the benchmark dimensions and retry this workload.",
            );
          if (visibleMs >= 120000) break;
          if (visibility.length >= 256 || frames.length >= 10000 || mutations.length >= 10000)
            throw new Error("The bounded measurement history is full. Retry this workload.");
          await pause(Math.min(5000, Math.max(50, 120000 - visibleMs)));
        }
        sampleVisibility();
        if (!stopped) {
          if (
            !validLayout() ||
            matchMedia("(prefers-reduced-motion: reduce)").matches ||
            frames.length === 0 ||
            mutations.length === 0 ||
            frames.some((value) => value > 1000)
          )
            throw new Error(
              "Display frames or avatar layout did not remain measurable. Restore the visible window and retry this workload.",
            );
          const response = await fetch("/v1/component-benchmark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              version: 3,
              visibility_policy: "native-and-document",
              layout_verified: true,
              render_boxes: layout(),
              expected_avatar_edge: edge,
              reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
              started_utc: started,
              ended_utc: new Date().toISOString(),
              elapsed_seconds: (performance.now() - began) / 1000,
              visible_sample_seconds: visibleMs / 1000,
              visibility_changes: visibility,
              texture_ready_count: readyCount(),
              avatars: count,
              state,
              viewport,
              device_scale: scale,
              frames_ms: frames,
              image_deliveries_ms: mutations,
              source: "Current original mountAvatar through native Tauri WKWebView",
            }),
          });
          if (!response.ok) throw new Error(`Measurement write failed: ${response.status}`);
          completed++;
        }
      } finally {
        cancelAnimationFrame(request);
        observer.disconnect();
        unsubscribe();
        document.removeEventListener("visibilitychange", sampleVisibility);
        controllers.forEach((controller) => controller.dispose());
      }
    }
    status.textContent = stopped
      ? "Benchmark stopped."
      : `${completed} original-engine workloads recorded.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Benchmark failed. Retry it.";
  } finally {
    from.disabled = false;
    start.removeAttribute("data-running");
    start.textContent = "Run benchmark matrix";
  }
};
