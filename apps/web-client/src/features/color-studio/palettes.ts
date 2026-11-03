import { selectableAvatarColors } from "@ngertiin/avatar/catalog";

function whiteContrast(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05);
}

// Preserve the avatar shade's hue while making white message text readable.
function bubbleColor(shade: string) {
  let rgb = [1, 3, 5].map((offset) => Number.parseInt(shade.slice(offset, offset + 2), 16));
  while (whiteContrast(rgb) < 4.5) rgb = rgb.map((channel) => Math.floor(channel * 0.98));
  return {
    bubble: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
    contrast: whiteContrast(rgb),
  };
}

export const palettes = Object.entries(selectableAvatarColors).map(([id, color]) => ({
  id,
  ...color,
  ...bubbleColor(color.shade),
}));
