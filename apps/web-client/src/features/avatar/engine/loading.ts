import { type AvatarFace, avatarColors, avatarShapes } from "./catalog";
import type { AvatarConfig } from "./config";

export const avatarLoadingDuration = 12000;
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** All loading channels use the same local timeline, independent of identity. */
export function sampleAvatarLoading(elapsed: number, reducedMotion = false) {
  const phase =
    (((elapsed % avatarLoadingDuration) + avatarLoadingDuration) % avatarLoadingDuration) /
    avatarLoadingDuration;
  const intensity = reducedMotion
    ? 0.35
    : smooth((phase - 0.22) / 0.22) * (1 - smooth((phase - 0.67) / 0.2));
  const pulse = reducedMotion ? 0 : Math.sin(phase * Math.PI * 30) * intensity;
  const stops = [
    [0, 0],
    [0.25, 20],
    [0.38, 50],
    [0.45, 100],
    [0.65, 400],
    [0.75, 460],
    [0.85, 480],
    [1, 500],
  ];
  const index = stops.findIndex(([at]) => at > phase);
  const [a, av] = stops[Math.max(0, index - 1)];
  const [b, bv] = stops[index < 0 ? stops.length - 1 : index];
  return {
    face: (reducedMotion || phase < 0.25 || phase >= 0.8
      ? "calm"
      : phase < 0.68
        ? "focused"
        : "surprised") as AvatarFace,
    veinOpacity: reducedMotion ? 0.45 : intensity * (0.9 + pulse * 0.1),
    ringOffset: reducedMotion ? 0 : -(av + ((bv - av) * (phase - a)) / (b - a)),
    x: pulse * 1.5,
    y: reducedMotion ? 0 : -Math.sin(phase * Math.PI * 2) * 2 - intensity * 5,
    rotation: reducedMotion ? 0 : Math.sin(phase * Math.PI * 2) * 2 + pulse * 2,
    scaleX: 1 + pulse * 0.02,
    scaleY: 1 - pulse * 0.02,
  };
}
const branches = [
  {
    body: "M143 96C133 86 139 77 130 69C124 62 128 56 122 48C131 54 129 61 136 66C142 70 141 77 143 81C149 79 154 82 160 87C153 84 149 84 145 86C144 90 147 94 146 98ZM134 70C143 67 148 63 151 57C153 65 145 72 138 74ZM128 60C120 64 115 58 110 57C117 55 120 59 127 57Z",
    ridge:
      "M144 94C136 84 142 77 133 68C127 62 130 56 124 50M136 71Q147 67 151 59M129 59Q120 62 113 57M142 84Q151 80 158 86",
  },
  {
    body: "M54 91C50 82 61 78 61 70C60 62 69 59 70 51C74 60 65 64 66 70C67 74 63 79 60 82C64 82 69 86 71 90C65 86 61 85 57 87L57 93ZM62 73C54 74 50 68 45 65C52 66 55 70 63 69ZM67 63C75 66 78 60 84 61C79 64 77 71 65 67Z",
    ridge:
      "M55 90C53 82 65 78 63 70C62 63 71 59 71 53M63 71Q53 73 47 66M67 65Q76 68 82 62M58 84Q65 83 70 89",
  },
];

export function renderLoadingRings(config: AvatarConfig, id: string, front: boolean): string {
  const color = avatarColors[config.color];
  const accent = ["lilac", "iris", "lavender", "wisteria", "rose", "blush"].includes(config.color)
    ? "#d9b36d"
    : "#8b6bc3";
  const clip = `${id}-loading-${front ? "front" : "back"}`;
  return `<g data-avatar-loading-rings="${front ? "front" : "back"}"><defs><clipPath id="${clip}"><rect x="0" y="${front ? 100 : 0}" width="200" height="100"/></clipPath></defs>${[-58, 58, 8].map((angle, i) => `<g transform="rotate(${angle} 100 100)"><g clip-path="url(#${clip})" fill="none"><ellipse cx="100" cy="100" rx="89" ry="35" stroke="${color.shade}" stroke-width="4" opacity=".25"/><ellipse cx="100" cy="100" rx="89" ry="35" stroke="${[color.base, color.shade, accent][i]}" stroke-width="2.5"/><ellipse cx="100" cy="99.5" rx="89" ry="35" stroke="${color.light}" stroke-width=".6" stroke-dasharray=".6 1.1" opacity=".8"/><ellipse data-avatar-loading-ring="" cx="100" cy="100" rx="89" ry="35" pathLength="100" stroke="${color.light}" stroke-width="1" stroke-dasharray="${["18 82", "18 32 8 42", "30 70"][i]}"/></g></g>`).join("")}</g>`;
}

export function renderLoadingVeins(config: AvatarConfig, id: string): string {
  const color = avatarColors[config.color];
  const shape = avatarShapes[config.shape];
  return `<g data-avatar-loading-veins="" opacity=".45" stroke-linecap="round" stroke-linejoin="round"><defs><clipPath id="${id}-loading-head"><path d="${shape.path}"/></clipPath><linearGradient id="${id}-loading-vein" x2="1" y2="1"><stop stop-color="${color.base}"/><stop offset=".35" stop-color="${color.shade}"/><stop offset="1" stop-color="${color.shade}"/></linearGradient></defs><g clip-path="url(#${id}-loading-head)"><g transform="translate(0 ${(shape.faceY - 100) * 0.65})">${branches.map(({ body, ridge }) => `<path d="${body}" fill="${color.shade}" stroke="${color.shade}" stroke-width="2" opacity=".4" transform="translate(.7 1.5)"/><path d="${body}" fill="url(#${id}-loading-vein)"/><path d="${ridge}" fill="none" stroke="${color.base}" stroke-width="1.8" transform="translate(-.4 -.5)"/><path d="${ridge}" fill="none" stroke="${color.light}" stroke-width=".75" opacity=".8" transform="translate(-.7 -.9)"/><path d="${body}" fill="none" stroke="${color.base}" stroke-width=".65" stroke-dasharray=".3 1.5" opacity=".55"/>`).join("")}</g></g></g>`;
}
