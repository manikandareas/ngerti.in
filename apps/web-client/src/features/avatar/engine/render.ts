import { type AvatarFace, type AvatarState, avatarColors, avatarShapes } from "./catalog";
import { type AvatarConfig, parseAvatarConfig, seedRandom } from "./config";
import { renderLoadingRings, renderLoadingVeins } from "./loading";

export function faceForState(face: AvatarFace, state: AvatarState): AvatarFace {
  switch (state) {
    case "listening":
      return "curious";
    case "thinking":
      return "focused";
    case "working":
      return "focused";
    case "celebrating":
      return "excited";
    case "sleeping":
      return "sleepy";
    case "error":
      return "surprised";
    default:
      return face;
  }
}

const furCache = new Map<string, string>();

/** Dark eye shapes remain readable without a mouth, including at small sizes. */
function plushEye(x: number, face: AvatarFace, right: boolean, id: string): string {
  const side = right ? 1 : -1;
  let shape: string;
  let tilt = side * 7;
  let lift = 0;
  const pill = (width: number, height: number) =>
    `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${width / 2}"/>`;
  switch (face) {
    case "happy":
      shape = '<path d="M-7 3 Q0-9 7 3" fill="none" stroke-width="4.5" stroke-linecap="round"/>';
      tilt = side * -8;
      break;
    case "excited":
      shape = `<path d="M${side * 6}-7 L${side * -3} 0 L${side * 6} 7" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      tilt = 0;
      lift = -2;
      break;
    case "curious":
      shape = pill(right ? 12 : 8, right ? 22 : 13);
      lift = right ? -4 : 2;
      tilt = right ? 16 : 0;
      break;
    case "shy":
      shape = pill(8, 11);
      tilt = side * -22;
      lift = 5;
      break;
    case "surprised":
      shape = '<ellipse rx="7.5" ry="12"/>';
      tilt = 0;
      lift = -2;
      break;
    case "sleepy":
      shape = '<path d="M-7-1 Q0 6 7-1" fill="none" stroke-width="3.8" stroke-linecap="round"/>';
      tilt = side * 8;
      lift = 3;
      break;
    case "focused":
      shape = `<path d="M-6 ${right ? -1 : -5} L6 ${right ? -5 : -1} L6 3 Q0 7-6 3Z"/>`;
      tilt = 0;
      break;
    default:
      shape = pill(10, 17);
  }
  return `<g transform="translate(${x} ${lift}) rotate(${tilt}) scale(1.4)"><g data-avatar-eye="${right ? "right" : "left"}" filter="url(#${id}-eye-shadow)"><g fill="url(#${id}-eye-color)" stroke="url(#${id}-eye-color)" stroke-width="0">${shape}</g></g></g>`;
}

/** Render a standalone, transparent SVG. User strings never become SVG markup. */
export function renderAvatarSvg(
  input: AvatarConfig,
  options: {
    id?: string;
    state?: AvatarState;
    shadow?: boolean;
    textureHref?: string;
    surfaceOnly?: boolean;
    loading?: boolean;
  } = {},
): string {
  const config = parseAvatarConfig(input);
  if (!config) throw new Error("Invalid avatar recipe.");
  const id = (options.id ?? "ngertiin-avatar").replace(/[^a-zA-Z0-9_-]/g, "");
  if (
    options.textureHref &&
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(options.textureHref)
  ) {
    throw new Error("Invalid avatar texture.");
  }
  const body = avatarShapes[config.shape];
  const color = avatarColors[config.color];
  const face = faceForState(config.face, options.state ?? "idle");
  const random = seedRandom(config.seed);
  const spacing = +(16 + random() * 5).toFixed(2);
  const lean = +((random() - 0.5) * 5).toFixed(2);
  const width = +(0.96 + random() * 0.08).toFixed(3);
  const height = +(0.97 + random() * 0.06).toFixed(3);
  random(); // Preserve the established seeded fur pattern.
  const gradient = `${id}-clay`;
  // Layer short undercoat and longer curved guard hairs in a seeded growth field.
  let fibers = "";
  if (options.textureHref === undefined) {
    // Expression and body changes share the same seeded fur field.
    const key = JSON.stringify([config.seed, config.color]);
    const cached = furCache.get(key);
    if (cached !== undefined) fibers = cached;
    else {
      fibers = Array.from({ length: 8500 }, (_, index) => {
        const x = 15 + random() * 170;
        const y = 15 + random() * 170;
        const angle = Math.atan2(y - 72, (x - 90) * 0.85) + Math.sin(y / 17 + x / 23) * 0.35;
        const length = index < 5500 ? 1.5 + random() * 3 : 4 + random() * 7;
        const dx = Math.cos(angle) * length;
        const dy = Math.sin(angle) * length;
        const light = random() > 0.45;
        return `<path d="M${x.toFixed(2)} ${y.toFixed(2)}q${(dx * 0.35 - dy * 0.16).toFixed(2)} ${(dy * 0.35 + dx * 0.16).toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)}" stroke="${light ? "#fff7e8" : color.shade}" stroke-opacity="${light ? 0.12 + random() * 0.25 : 0.2 + random() * 0.3}" stroke-width="${index < 5500 ? ".24" : ".36"}" stroke-linecap="round"/>`;
      }).join("");
      furCache.set(key, fibers);
      const oldest = furCache.keys().next().value;
      if (furCache.size > 16 && oldest !== undefined) furCache.delete(oldest);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" fill="none" aria-hidden="true">
<defs>
<filter id="${id}-fuzz" x="-15%" y="-15%" width="130%" height="130%">
<feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" seed="12" result="noise"/>
<feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="${id}-eye-shadow" x="-100%" y="-70%" width="300%" height="300%"><feDropShadow dx="0" dy=".35" stdDeviation=".65" flood-color="#100c14" flood-opacity=".8" result="contact-shadow"/>
<feGaussianBlur in="SourceAlpha" stdDeviation=".85" result="soft-edge"/>
<feOffset in="soft-edge" dx="0" dy="1" result="inset-offset"/>
<feComposite in="SourceAlpha" in2="inset-offset" operator="out" result="inset-edge"/>
<feFlood flood-color="#08060c" flood-opacity=".85" result="inset-color"/>
<feComposite in="inset-color" in2="inset-edge" operator="in" result="inset-shadow"/>
<feMerge><feMergeNode in="contact-shadow"/><feMergeNode in="inset-shadow"/></feMerge></filter>
<radialGradient id="${id}-eye-color" cx=".32" cy=".24" r=".8"><stop stop-color="#625c68"/><stop offset=".22" stop-color="#302b36"/><stop offset=".6" stop-color="#17131d"/><stop offset="1" stop-color="#0c0911"/></radialGradient>
<mask id="${id}-fur-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><path d="${body.path}" fill="white" stroke="white" stroke-width="3" filter="url(#${id}-fuzz)"/></mask>
<radialGradient id="${gradient}" cx=".32" cy=".2" r=".9"><stop stop-color="${color.base}"/><stop offset=".5" stop-color="${color.base}"/><stop offset="1" stop-color="${color.shade}"/></radialGradient>
<radialGradient id="${id}-sheen" cx=".28" cy=".15" r=".7"><stop stop-color="#fff" stop-opacity=".4"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-ground"><stop stop-color="#252332" stop-opacity=".17"/><stop offset="1" stop-color="#252332" stop-opacity="0"/></radialGradient>
</defs>
${options.shadow ? `<ellipse data-avatar-shadow="" cx="100" cy="181" rx="60" ry="9" fill="url(#${id}-ground)"/>` : ""}
${options.surfaceOnly ? "" : `<g data-avatar-body="">${options.loading ? renderLoadingRings(config, id, false) : ""}<g transform="translate(100 110) rotate(${lean}) scale(${width} ${height}) translate(-100 -110)">`}
<g data-avatar-surface="">
${
  options.textureHref
    ? `<image href="${options.textureHref}" width="200" height="200"/>`
    : `
<path d="${body.path}" fill="url(#${gradient})" ${options.textureHref === undefined ? `filter="url(#${id}-fuzz)"` : ""}/>
<path d="${body.path}" fill="url(#${id}-sheen)"/>
${fibers ? `<g mask="url(#${id}-fur-mask)">${fibers}</g>` : ""}
`
}
</g>
${
  options.surfaceOnly
    ? ""
    : `<g transform="translate(100 ${body.faceY})"><g data-avatar-gaze="">
${plushEye(-spacing, face, false, id)}${plushEye(spacing, face, true, id)}
</g></g>${options.loading ? renderLoadingVeins(config, id) : ""}</g>${options.loading ? renderLoadingRings(config, id, true) : ""}</g>`
}
</svg>`;
}
