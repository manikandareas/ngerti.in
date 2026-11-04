import type { AvatarAction, AvatarState } from "./catalog";

export interface AvatarPose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  eyeLeft: number;
  eyeRight: number;
  gazeX: number;
  gazeY: number;
}

const ease = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

function blinkAt(time: number) {
  const cycle = Math.floor(time / 12000);
  const phase = time % 12000;
  const offset = Math.sin(cycle * 7.31) * 550;
  const starts = [2100 + offset, 6200 - offset, 10000 + offset * 0.5];
  if (cycle % 3 === 1) starts.push(6460 - offset);
  for (const start of starts) {
    const elapsed = phase - start;
    if (elapsed < 0 || elapsed > 190) continue;
    // Eyelids close quickly, then reopen more softly. Occasionally blink twice.
    const open = elapsed < 55 ? 1 - ease(elapsed / 55) : ease((elapsed - 55) / 135);
    return 0.06 + open * 0.94;
  }
  return 1;
}

function idleFocus(step: number) {
  if (step % 4 === 0) return { x: 0, y: 0 };
  return { x: Math.sin(step * 4.73) * 0.34, y: Math.sin(step * 2.37) * 0.2 };
}

export const actionDuration: Record<AvatarAction, number> = {
  boop: 650,
  wave: 1100,
  hop: 850,
  wiggle: 900,
  spin: 1100,
  wink: 650,
};

export function sampleAvatarPose(
  time: number,
  state: AvatarState,
  action?: { type: AvatarAction; progress: number },
  reducedMotion = false,
): AvatarPose {
  const pose: AvatarPose = {
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    eyeLeft: 1,
    eyeRight: 1,
    gazeX: 0,
    gazeY: 0,
  };
  if (reducedMotion) return pose;
  const t = time / 1000;
  const breathe = Math.sin(t * 2);
  pose.y = breathe * 1.5;
  pose.scaleX = 1 - breathe * 0.006;
  pose.scaleY = 1 + breathe * 0.006;
  switch (state) {
    case "listening":
      pose.rotation = -5 + Math.sin(t * 1.5) * 2;
      break;
    case "thinking":
      pose.rotation = Math.sin(t * 1.3) * 6;
      pose.y -= 2;
      break;
    case "working":
      pose.rotation = Math.sin(t * 5) * 2.5;
      break;
    case "celebrating":
      pose.y -= Math.abs(Math.sin(t * 4)) * 9;
      pose.rotation = Math.sin(t * 4) * 8;
      break;
    case "sleeping":
      pose.rotation = 7;
      pose.scaleY = 1 + breathe * 0.015;
      break;
    case "error":
      pose.x = Math.sin(t * 3) * 1.5;
      break;
  }
  const focusStep = Math.floor(time / 3600);
  const previous = idleFocus(focusStep - 1);
  const next = idleFocus(focusStep);
  const settle = ease((time % 3600) / 220);
  if (state !== "sleeping") {
    pose.gazeX = previous.x + (next.x - previous.x) * settle;
    pose.gazeY = previous.y + (next.y - previous.y) * settle;
  }
  pose.eyeLeft = blinkAt(time);
  pose.eyeRight = blinkAt(time - 8);
  if (!action || action.progress < 0 || action.progress >= 1) return pose;
  const p = action.progress;
  const envelope = Math.sin(Math.PI * p);
  switch (action.type) {
    case "boop":
      pose.scaleX += envelope * 0.12;
      pose.scaleY -= envelope * 0.1;
      pose.y += envelope * 5;
      break;
    case "wave":
      pose.rotation += Math.sin(p * Math.PI * 5) * envelope * 17;
      break;
    case "hop":
      pose.y -= Math.sin(p * Math.PI) * 30;
      pose.scaleX -= envelope * 0.04;
      pose.scaleY += envelope * 0.08;
      break;
    case "wiggle":
      pose.x += Math.sin(p * Math.PI * 6) * envelope * 7;
      pose.rotation += Math.sin(p * Math.PI * 6) * envelope * 9;
      break;
    case "spin":
      pose.rotation += 360 * (1 - (1 - p) ** 3);
      pose.scaleX -= envelope * 0.18;
      break;
    case "wink":
      pose.eyeRight = Math.max(0.08, 1 - envelope * 2);
      break;
  }
  return pose;
}
