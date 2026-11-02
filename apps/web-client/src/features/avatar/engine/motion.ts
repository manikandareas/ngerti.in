import type { AvatarAction, AvatarState } from "./catalog";

export interface AvatarPose {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  eyeLeft: number;
  eyeRight: number;
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
  const blinkCycle = (time + 750) % 4700;
  const blink = blinkCycle < 140 ? Math.max(0.08, Math.abs(blinkCycle - 70) / 70) : 1;
  pose.eyeLeft = blink;
  pose.eyeRight = blink;
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
