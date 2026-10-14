// Ellis's companion creature: a soft, round vector character built from parts.
// Shared by the browser (drawing) and the server (validating saved looks), so
// the list of allowed options lives in exactly one place.
//
// Every value that reaches the SVG markup comes from the lookup tables below,
// never from user input, so the markup is safe to insert as HTML.

export const OPTIONS = {
  species: ["mochi", "foxling", "bunbun", "sprout"],
  color: ["peach", "mint", "sky", "lilac", "butter", "coral", "sage", "midnight"],
  pattern: ["none", "spots", "stripes"],
  eyes: ["round", "sparkle", "sleepy"],
  accessory: ["none", "scarf", "bow", "cap", "flower", "glasses"],
};

export const LABELS = {
  species: { mochi: "Mochi", foxling: "Foxling", bunbun: "Bunbun", sprout: "Sprout" },
  color: {
    peach: "Peach", mint: "Mint", sky: "Sky", lilac: "Lilac",
    butter: "Butter", coral: "Coral", sage: "Sage", midnight: "Midnight",
  },
  pattern: { none: "Plain", spots: "Spots", stripes: "Stripes" },
  eyes: { round: "Bright", sparkle: "Sparkly", sleepy: "Content" },
  accessory: { none: "Nothing", scarf: "Scarf", bow: "Bow", cap: "Cap", flower: "Flower", glasses: "Glasses" },
};

export const DEFAULT_APPEARANCE = { species: "mochi", color: "peach", pattern: "none", eyes: "round", accessory: "none" };

// body, belly, shade (patterns and arms), inner (ears and cheeks)
export const PALETTE = {
  peach: ["#FFB89A", "#FFE6D8", "#EE8D6A", "#FF9C8C"],
  mint: ["#9FE3C8", "#E0F8EE", "#5DBF9C", "#FFB0BE"],
  sky: ["#A9D2FF", "#E3F1FF", "#6EA6EC", "#FFB0BE"],
  lilac: ["#CBB8FF", "#F0EAFF", "#9A82EE", "#FFB0CF"],
  butter: ["#FFDF86", "#FFF5D2", "#EDB940", "#FFA98C"],
  coral: ["#FF9494", "#FFE3DE", "#E36565", "#FFD0C4"],
  sage: ["#B9D0A0", "#EEF4E3", "#849E69", "#FFB3A8"],
  midnight: ["#6470B0", "#CDD3F2", "#424B8A", "#FF9FC0"],
};

const INK = "#3A2E3A";
let clipCounter = 0; // several creatures can share a page; each needs its own clip id

/** Fill in defaults and drop anything not in OPTIONS. */
export function normalizeAppearance(a) {
  const out = { ...DEFAULT_APPEARANCE };
  if (a && typeof a === "object") {
    for (const key of Object.keys(OPTIONS)) {
      if (OPTIONS[key].includes(a[key])) out[key] = a[key];
    }
  }
  return out;
}

/** True when every key is present and allowed. Used to validate saves. */
export function isValidAppearance(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(OPTIONS).length &&
    keys.every((k) => k in OPTIONS && OPTIONS[k].includes(a[k]))
  );
}

const BODY = {
  mochi: "M100 54 C146 54 170 90 170 130 C170 165 140 180 100 180 C60 180 30 165 30 130 C30 90 54 54 100 54 Z",
  foxling: "M100 50 C144 50 168 88 168 128 C168 165 140 180 100 180 C60 180 32 165 32 128 C32 88 56 50 100 50 Z",
  bunbun: "M100 58 C146 58 168 92 168 132 C168 166 140 180 100 180 C60 180 32 166 32 132 C32 92 54 58 100 58 Z",
  sprout: "M100 50 C142 50 166 90 166 130 C166 166 138 180 100 180 C62 180 34 166 34 130 C34 90 58 50 100 50 Z",
};

function backParts(species, c) {
  const [body, , shade, inner] = c;
  const s = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;
  switch (species) {
    case "mochi":
      return `<g class="ears">
        <circle cx="62" cy="70" r="15" fill="${body}" ${s}/><circle cx="62" cy="70" r="7" fill="${inner}"/>
        <circle cx="138" cy="70" r="15" fill="${body}" ${s}/><circle cx="138" cy="70" r="7" fill="${inner}"/></g>`;
    case "foxling":
      return `<path class="tail" d="M156 158 C188 156 196 124 184 104 C178 96 170 100 172 108 C178 130 166 142 150 144 Z" fill="${body}" ${s}/>
        <path class="tail-tip" d="M184 104 C178 96 170 100 172 108 C174 114 176 118 178 120 C186 116 188 110 184 104 Z" fill="#FFFFFF" opacity=".9"/>
        <g class="ears">
        <path d="M52 92 Q36 50 46 22 Q78 36 94 60 Z" fill="${body}" ${s}/><path d="M56 78 Q48 52 52 36 Q72 46 82 62 Z" fill="${inner}"/>
        <path d="M148 92 Q164 50 154 22 Q122 36 106 60 Z" fill="${body}" ${s}/><path d="M144 78 Q152 52 148 36 Q128 46 118 62 Z" fill="${inner}"/></g>`;
    case "bunbun":
      return `<g class="ears">
        <path d="M74 70 C60 34 62 8 76 8 C90 8 94 36 90 68 Z" fill="${body}" ${s}/><path d="M77 60 C70 36 71 20 77 20 C84 20 85 38 83 60 Z" fill="${inner}"/>
        <path d="M126 70 C140 34 138 8 124 8 C110 8 106 36 110 68 Z" fill="${body}" ${s}/><path d="M123 60 C130 36 129 20 123 20 C116 20 115 38 117 60 Z" fill="${inner}"/></g>`;
    default:
      return "";
  }
}

function topParts(species) {
  if (species !== "sprout") return "";
  return `<g class="sprout">
    <path d="M100 52 Q99 40 103 30" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M103 31 C110 14 132 12 140 20 C132 32 116 38 103 31 Z" fill="#8FD694" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M101 35 C92 22 74 20 66 28 C76 38 92 41 101 35 Z" fill="#B5E8A8" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/></g>`;
}

function pattern(kind, shade, clip) {
  if (kind === "spots") {
    return `<g clip-path="url(#${clip})" fill="${shade}" opacity=".45">
      <circle cx="58" cy="100" r="9"/><circle cx="146" cy="116" r="11"/><circle cx="124" cy="78" r="6"/><circle cx="48" cy="150" r="7"/></g>`;
  }
  if (kind === "stripes") {
    return `<g clip-path="url(#${clip})" fill="none" stroke="${shade}" stroke-width="6" stroke-linecap="round" opacity=".5">
      <path d="M86 50 Q88 62 85 72"/><path d="M100 48 Q101 62 100 74"/><path d="M114 50 Q112 62 115 72"/></g>`;
  }
  return "";
}

function eyes(kind) {
  if (kind === "sleepy") {
    return `<g class="eyes sleepy" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round">
      <path d="M70 112 Q78 120 86 112"/><path d="M114 112 Q122 120 130 112"/></g>`;
  }
  const big = kind === "sparkle";
  const rx = big ? 9 : 7.5, ry = big ? 11 : 9.5;
  const one = (x) => `<g class="eye"><ellipse cx="${x}" cy="112" rx="${rx}" ry="${ry}" fill="${INK}"/>
      <circle cx="${x + 2.6}" cy="${big ? 107.5 : 108.5}" r="${big ? 3.6 : 2.8}" fill="#FFFFFF"/>
      ${big ? `<circle cx="${x - 3}" cy="116" r="1.7" fill="#FFFFFF"/>` : ""}</g>`;
  return `<g class="eyes"><g class="pupils">${one(78)}${one(122)}</g></g>`;
}

function accessory(kind) {
  const s = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;
  switch (kind) {
    case "scarf":
      return `<g class="acc scarf"><path d="M40 146 Q100 168 160 146 L161 160 Q100 182 39 160 Z" fill="#E8607A" ${s}/>
        <path d="M124 164 L130 190 L144 186 L138 160 Z" fill="#E8607A" ${s}/>
        <path d="M60 154 L64 166 M84 160 L86 172 M108 162 L108 174" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>`;
    case "bow":
      return `<g class="acc bow"><path d="M140 62 L120 50 L122 74 Z" fill="#FF7EB0" ${s}/><path d="M140 62 L160 50 L158 74 Z" fill="#FF7EB0" ${s}/>
        <circle cx="140" cy="62" r="6" fill="#FF5C9C" ${s}/></g>`;
    case "cap":
      return `<g class="acc cap"><path d="M56 80 Q62 36 100 34 Q138 36 144 80 Z" fill="#5B8DEF" ${s}/>
        <path d="M118 74 Q150 68 166 78 Q150 86 120 84 Z" fill="#4374D6" ${s}/><circle cx="100" cy="34" r="5" fill="#FFD166" ${s}/></g>`;
    case "flower":
      return `<g class="acc flower" ${s}>${[0, 72, 144, 216, 288]
        .map((d) => `<circle cx="${(62 + 9 * Math.cos((d * Math.PI) / 180)).toFixed(1)}" cy="${(64 + 9 * Math.sin((d * Math.PI) / 180)).toFixed(1)}" r="7" fill="#FFFFFF"/>`)
        .join("")}<circle cx="62" cy="64" r="6" fill="#FFD166"/></g>`;
    case "glasses":
      return `<g class="acc glasses" fill="#FFFFFF" fill-opacity=".18" stroke="${INK}" stroke-width="3">
        <circle cx="78" cy="112" r="16"/><circle cx="122" cy="112" r="16"/><path d="M94 110 Q100 105 106 110" fill="none"/></g>`;
    default:
      return "";
  }
}

/**
 * The creature as an SVG string. `state` classes on the root (is-thinking,
 * is-talking, is-happy, is-listening, is-sad) drive the CSS animations.
 */
export function creatureSvg(appearance, { title = "Your companion" } = {}) {
  const a = normalizeAppearance(appearance);
  const c = PALETTE[a.color];
  const [body, belly, shade] = c;
  const safeTitle = String(title).replace(/[<>&"]/g, "");
  const s = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"`;
  const clip = `ellis-clip-${++clipCounter}`;
  return `<svg class="creature" viewBox="0 0 200 200" role="img" aria-label="${safeTitle}" data-species="${a.species}">
  <defs><clipPath id="${clip}"><path d="${BODY[a.species]}"/></clipPath></defs>
  <ellipse class="shadow" cx="100" cy="186" rx="52" ry="7" fill="currentColor" opacity=".14"/>
  <g class="hop"><g class="bob">
    ${backParts(a.species, c)}
    <g class="torso">
      <path class="body" d="${BODY[a.species]}" fill="${body}" ${s}/>
      ${pattern(a.pattern, shade, clip)}
      <ellipse cx="100" cy="150" rx="40" ry="24" fill="${belly}"/>
      <ellipse class="arm arm-l" cx="36" cy="140" rx="9" ry="14" fill="${body}" ${s}/>
      <ellipse class="arm arm-r" cx="164" cy="140" rx="9" ry="14" fill="${body}" ${s}/>
      <ellipse cx="76" cy="180" rx="15" ry="8" fill="${body}" ${s}/>
      <ellipse cx="124" cy="180" rx="15" ry="8" fill="${body}" ${s}/>
      <g class="face">
        <ellipse class="cheek" cx="60" cy="128" rx="9" ry="5.5" fill="${c[3]}" opacity=".75"/>
        <ellipse class="cheek" cx="140" cy="128" rx="9" ry="5.5" fill="${c[3]}" opacity=".75"/>
        ${eyes(a.eyes)}
        <path class="mouth smile" d="M91 126 Q95.5 131 100 127 Q104.5 131 109 126" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path class="mouth open" d="M93 125 Q100 139 107 125 Z" fill="#8A3B4E" ${s} opacity="0"/>
      </g>
      ${accessory(a.accessory)}
    </g>
    ${topParts(a.species)}
  </g></g>
  <g class="sparkles" fill="#FFD166" stroke="${INK}" stroke-width="2" opacity="0">
    <path d="M30 60 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z"/>
    <path d="M170 44 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z"/>
    <path d="M176 120 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 Z"/>
  </g>
</svg>`;
}
