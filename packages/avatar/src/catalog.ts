export const avatarShapes = {
  circle: {
    label: "Circle",
    path: "M169 99C172 137 143 166 104 169C64 173 32 145 31 106C29 69 54 36 94 32C132 27 166 57 169 99Z",
    faceY: 100,
  },
  oval: {
    label: "Oval",
    path: "M177 99C181 130 148 154 103 157C61 160 24 140 22 106C19 75 54 46 97 43C138 40 174 65 177 99Z",
    faceY: 97,
  },
  squircle: {
    label: "Square",
    path: "M67 35L136 39Q164 41 162 69L166 130Q167 164 136 166L66 162Q35 161 36 130L32 66Q30 34 67 35Z",
    faceY: 100,
  },
  capsule: {
    label: "Capsule",
    path: "M60 59L143 65C166 67 182 86 176 106C174 130 161 143 137 142L57 138C34 137 20 122 22 101C24 78 40 58 60 59Z",
    faceY: 95,
  },
  triangle: {
    label: "Triangle",
    path: "M92 34Q103 16 114 37L174 139Q187 163 161 166L39 162Q15 161 29 139Z",
    faceY: 119,
  },
  diamond: {
    label: "Diamond",
    path: "M87 29Q99 16 113 32L172 82Q189 96 175 111L117 171Q103 188 88 175L30 116Q13 102 27 87Z",
    faceY: 100,
  },
  pentagon: {
    label: "Pentagon",
    path: "M91 29Q102 23 112 32L170 75Q178 82 173 94L151 155Q147 168 135 165L63 169Q50 169 47 156L28 79Q25 70 32 66Z",
    faceY: 106,
  },
  hexagon: {
    label: "Hexagon",
    path: "M69 33L135 39Q143 39 149 49L176 94Q181 103 175 113L143 158Q137 168 126 165L62 161Q51 161 47 152L22 99Q17 89 27 80L57 40Q61 31 69 33Z",
    faceY: 100,
  },
} as const;

export const avatarColors = {
  mint: { label: "Mint", light: "#9debc3", base: "#57d69f", shade: "#25976f" },
  lilac: { label: "Lilac", light: "#d3a8f5", base: "#af77e4", shade: "#7944b2" },
  peach: { label: "Peach", light: "#ffc59b", base: "#ff9c73", shade: "#d56a4c" },
  sky: { label: "Sky", light: "#a1e1fc", base: "#64bdef", shade: "#3289c1" },
  butter: { label: "Butter", light: "#ffe997", base: "#f8cf49", shade: "#c89724" },
  rose: { label: "Rose", light: "#ffa8d4", base: "#ee78b0", shade: "#bd447e" },
  tangerine: { label: "Tangerine", light: "#ffc079", base: "#ff963f", shade: "#d36628" },
  iris: { label: "Iris", light: "#b0bdff", base: "#8498ef", shade: "#5164bd" },
  matcha: { label: "Matcha", light: "#d3e989", base: "#accf57", shade: "#779b2f" },
  pearl: { label: "Pearl", light: "#f8faff", base: "#cbd6e6", shade: "#8f9fb5" },
  seafoam: { label: "Seafoam", light: "#9aebd8", base: "#50cfb6", shade: "#219681" },
  aqua: { label: "Aqua", light: "#9beaf1", base: "#52cfdf", shade: "#259aa9" },
  pistachio: { label: "Pistachio", light: "#dfef8b", base: "#bed856", shade: "#8da334" },
  lemon: { label: "Lemon", light: "#fff68b", base: "#f2e34f", shade: "#c4b42a" },
  melon: { label: "Coral", light: "#ffb0a3", base: "#ff8279", shade: "#d25151" },
  blush: { label: "Bubblegum", light: "#ffb3cf", base: "#f98fb8", shade: "#cf5f91" },
  wisteria: { label: "Orchid", light: "#e8acf2", base: "#cf80e1", shade: "#a049b6" },
  lavender: { label: "Lavender", light: "#c5b3ff", base: "#a28aea", shade: "#7356bc" },
  oat: { label: "Honey", light: "#f8d18a", base: "#e9b355", shade: "#b9812c" },
  mist: { label: "Ocean", light: "#a0d5e8", base: "#6fb2ce", shade: "#3b7f9e" },
} as const;

// Retired colors remain readable for stored recipes, but are not offered for new identities.
const retiredColors = new Set(["oat", "butter", "tangerine", "pistachio", "lemon", "pearl"]);
export const selectableAvatarColors = Object.fromEntries(
  Object.entries(avatarColors).filter(([color]) => !retiredColors.has(color)),
) as Partial<typeof avatarColors>;

export const avatarFaces = {
  happy: "Happy",
  curious: "Curious",
  calm: "Calm",
  excited: "Excited",
  shy: "Shy",
  surprised: "Surprised",
  sleepy: "Sleepy",
  focused: "Focused",
} as const;

export const avatarStates = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  working: "Working",
  celebrating: "Celebrating",
  sleeping: "Sleeping",
  error: "Needs help",
} as const;

export const avatarActions = {
  boop: "Boop!",
  wave: "Wave",
  hop: "Hop",
  wiggle: "Wiggle",
  spin: "Spin",
  wink: "Wink",
} as const;

export type AvatarShape = keyof typeof avatarShapes;
export type AvatarColor = keyof typeof avatarColors;
export type AvatarFace = keyof typeof avatarFaces;
export type AvatarState = keyof typeof avatarStates;
export type AvatarAction = keyof typeof avatarActions;
