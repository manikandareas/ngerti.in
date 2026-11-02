import { type AvatarFace, type AvatarState, avatarColors, avatarShapes } from "./catalog";
import { type AvatarConfig, parseAvatarConfig, seedRandom } from "./config";

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

function eye(x: number, face: AvatarFace, right: boolean): string {
  const open = face !== "happy" && face !== "excited" && face !== "sleepy";
  let drawing: string;
  if (open) {
    const radius = face === "surprised" ? 6 : 4.5;
    const height = face === "focused" ? 5 : face === "shy" ? 6 : 7.5;
    drawing = `<ellipse cx="0" cy="0" rx="${radius}" ry="${height}" fill="#293239"/><ellipse cx="-1.3" cy="-2.5" rx="1.4" ry="1.8" fill="#fff" opacity=".9"/>`;
  } else {
    const d = face === "sleepy" ? "M-6 0Q0 4 6 0" : "M-6 1Q0-8 6 1";
    drawing = `<path d="${d}" fill="none" stroke="#293239" stroke-width="3.6" stroke-linecap="round"/>`;
  }
  const eyebrow =
    face === "curious" && right
      ? '<path d="M-5-15Q0-19 5-16" fill="none" stroke="#293239" stroke-width="2.3" stroke-linecap="round"/>'
      : "";
  return `<g transform="translate(${x} 0)">${eyebrow}<g data-avatar-eye="${right ? "right" : "left"}">${drawing}</g></g>`;
}

function mouth(face: AvatarFace): string {
  const stroke = 'fill="none" stroke="#293239" stroke-width="2.8" stroke-linecap="round"';
  switch (face) {
    case "surprised":
      return '<ellipse cx="0" cy="16" rx="4" ry="5.5" fill="#293239"/>';
    case "excited":
      return '<path d="M-9 12Q0 10 9 12Q8 25 0 25Q-8 25-9 12Z" fill="#293239"/><path d="M-5 21Q0 17 5 21Q0 27-5 21" fill="#f3a7b9"/>';
    case "curious":
      return `<path d="M-3 16Q1 12 5 15" ${stroke}/>`;
    case "sleepy":
      return `<path d="M-4 17Q0 19 4 17" ${stroke}/>`;
    case "focused":
      return `<path d="M-4 16L4 16" ${stroke}/>`;
    case "shy":
      return `<path d="M-5 15Q0 20 5 15" ${stroke}/>`;
    default:
      return `<path d="M-7 13Q0 22 7 13" ${stroke}/>`;
  }
}

/** Render a standalone, transparent SVG. User strings never become SVG markup. */
export function renderAvatarSvg(
  input: AvatarConfig,
  options: { id?: string; state?: AvatarState; shadow?: boolean } = {},
): string {
  const config = parseAvatarConfig(input);
  if (!config) throw new Error("Invalid avatar recipe.");
  const id = (options.id ?? "ngertiin-avatar").replace(/[^a-zA-Z0-9_-]/g, "");
  const body = avatarShapes[config.shape];
  const color = avatarColors[config.color];
  const face = faceForState(config.face, options.state ?? "idle");
  const random = seedRandom(config.seed);
  const spacing = +(16 + random() * 5).toFixed(2);
  const lean = +((random() - 0.5) * 5).toFixed(2);
  const width = +(0.96 + random() * 0.08).toFixed(3);
  const height = +(0.97 + random() * 0.06).toFixed(3);
  const freckles = random() > 0.55;
  const gradient = `${id}-clay`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" fill="none" aria-hidden="true">
<defs>
<radialGradient id="${gradient}" cx=".32" cy=".2" r=".9"><stop stop-color="${color.base}"/><stop offset=".5" stop-color="${color.base}"/><stop offset="1" stop-color="${color.shade}"/></radialGradient>
<radialGradient id="${id}-sheen" cx=".28" cy=".15" r=".7"><stop stop-color="#fff" stop-opacity=".4"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}-ground"><stop stop-color="#252332" stop-opacity=".17"/><stop offset="1" stop-color="#252332" stop-opacity="0"/></radialGradient>
</defs>
${options.shadow ? `<ellipse data-avatar-shadow="" cx="100" cy="181" rx="60" ry="9" fill="url(#${id}-ground)"/>` : ""}
<g data-avatar-body=""><g transform="translate(100 110) rotate(${lean}) scale(${width} ${height}) translate(-100 -110)">
<path d="${body.path}" fill="url(#${gradient})"/>
<path d="${body.path}" fill="url(#${id}-sheen)"/>
<g transform="translate(100 ${body.faceY})"><g data-avatar-gaze="">
${eye(-spacing, face, false)}${eye(spacing, face, true)}
${mouth(face)}
${freckles ? `<g fill="#735f59" opacity=".23"><circle cx="-${spacing + 11}" cy="9" r="1"/><circle cx="-${spacing + 7}" cy="11" r="1"/><circle cx="${spacing + 11}" cy="9" r="1"/><circle cx="${spacing + 7}" cy="11" r="1"/></g>` : ""}
</g></g></g></g>
</svg>`;
}
