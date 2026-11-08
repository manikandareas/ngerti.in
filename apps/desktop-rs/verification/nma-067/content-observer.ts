// Reference-only observer of the actual current client. Never shipped in the Rust app.
import { isPageVisible, subscribePageVisibility } from "../../../web-client/src/lib/page-visibility";

const button = document.createElement("button");
button.textContent = "Measure content · 120 visible seconds";
button.setAttribute("aria-label", button.textContent);
Object.assign(button.style, {
  position: "fixed", left: "12px", bottom: "12px", zIndex: "2147483647",
  padding: "8px 12px", background: "#fcfcfc", color: "#1c1c1c",
  border: "1px solid #d5d5d5", borderRadius: "8px", font: "12px system-ui",
});
document.body.append(button);
const visible = () => isPageVisible() && !document.hidden;
const shown = (node: Element) => {
  const box = node.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
};
button.onclick = async () => {
  const candidates = [
    ["source-2mib-100000-lines-bounded-preview", '[data-source-code][aria-label="Code viewer large.ts"][data-virtualized="true"]'],
    ["table-10000-by-20", '.rich-table:has(table[aria-rowcount="10001"])'],
    ["pdf-current-fixture", "[data-pdf-viewer]"],
  ];
  const found = candidates.map(([workload, selector]) => ({
    workload, root: [...document.querySelectorAll(selector)].find(shown),
  })).find((entry) => entry.root);
  if (!found?.root) {
    button.textContent = "Open the source, expanded table or PDF fixture first";
    return;
  }
  button.disabled = true;
  const root = found.root;
  if (found.workload === "pdf-current-fixture" && root.querySelectorAll("[data-pdf-page]").length !== 200) {
    button.textContent = "Open the 200-page PDF fixture before measuring";
    button.disabled = false;
    return;
  }
  const started = new Date().toISOString();
  const began = performance.now();
  const viewport = [innerWidth, innerHeight];
  const scale = devicePixelRatio;
  const frames: number[] = [];
  const changes: number[] = [];
  const events: { at_ms: number; type: string }[] = [];
  const visibility: [number, boolean][] = [];
  let active = false, visibleMs = 0, lastAt = began, previous: number | undefined, request = 0;
  const sample = () => {
    const now = performance.now();
    if (active) visibleMs += now - lastAt;
    lastAt = now;
    const next = visible();
    if (!visibility.length || next !== active) {
      visibility.push([now - began, next]);
      previous = undefined;
    }
    active = next;
  };
  sample();
  const unsubscribe = subscribePageVisibility(sample);
  document.addEventListener("visibilitychange", sample);
  const input = (event: Event) => {
    if (events.length < 10000) events.push({ at_ms: performance.now() - began, type: event.type });
  };
  for (const type of ["click", "keydown", "input", "scroll"]) root.addEventListener(type, input, true);
  const observer = new MutationObserver(() => changes.push(performance.now() - began));
  observer.observe(root, { attributes: true, childList: true, subtree: true, characterData: true });
  const frame = (now: number) => {
    if (active && previous !== undefined) frames.push(now - previous);
    previous = now;
    request = requestAnimationFrame(frame);
  };
  request = requestAnimationFrame(frame);
  try {
    while (visibleMs < 120000) {
      sample();
      if (!root.isConnected || !shown(root) || innerWidth !== viewport[0] || innerHeight !== viewport[1]
          || devicePixelRatio !== scale || visibility.length >= 256 || frames.length >= 10000
          || changes.length >= 10000 || events.length >= 10000)
        throw new Error("Content, viewport or bounded history changed. Retry the fixture.");
      button.textContent = `Recording ${found.workload} · ${Math.floor(visibleMs / 1000)}/120 visible seconds`;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    sample();
    if (!frames.length || frames.some((value) => value > 1000))
      throw new Error("Display frames were not continuously measurable. Retry the visible fixture.");
    const response = await fetch("/v1/content-benchmark", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1, workload: found.workload, started_utc: started, ended_utc: new Date().toISOString(),
        elapsed_seconds: (performance.now() - began) / 1000, visible_seconds: visibleMs / 1000,
        viewport, device_scale: scale, visibility_changes: visibility,
        visibility_policy: "native-and-document", frames_ms: frames, mutations_ms: changes, events,
        source_language: root.getAttribute("data-language"),
        source_virtualized: root.getAttribute("data-virtualized"),
        table_rows: root.querySelector("table")?.getAttribute("aria-rowcount"),
        pdf_pages: root.querySelectorAll("[data-pdf-page]").length,
        boundary: "Actual current Tauri client content; browser rAF is not GPUI draw/work timing. Process CPU/RSS and fixture hashes are separate.",
      }),
    });
    if (!response.ok) throw new Error(`Measurement write failed: ${response.status}`);
    button.textContent = "Content measurement saved";
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : "Content measurement failed";
  } finally {
    cancelAnimationFrame(request);
    observer.disconnect();
    unsubscribe();
    document.removeEventListener("visibilitychange", sample);
    for (const type of ["click", "keydown", "input", "scroll"]) root.removeEventListener(type, input, true);
    button.disabled = false;
  }
};
