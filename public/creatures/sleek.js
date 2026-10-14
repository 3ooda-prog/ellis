// Sleek family: a fox-like creature with soft shading, no outlines and
// glowing markings in the accent colour. Grows from a small kit into a
// maned, two-tailed adult.

const STAGE = {
  1: { scale: 0.7, ear: 40, tails: 1, tailScale: 0.8, mane: false, diamond: false, bands: false },
  2: { scale: 0.88, ear: 14, tails: 1, tailScale: 1, mane: false, diamond: true, bands: false },
  3: { scale: 0.95, ear: -2, tails: 2, tailScale: 1.05, mane: true, diamond: true, bands: true },
};

const EYE = "#1C2130";

function draw({ stage, palette: p, accent, id }) {
  const s = STAGE[stage];
  const t = s.ear;
  const glow = `filter="url(#${id}g)"`;
  // The placement transform sits on an outer group so the CSS tail sway
  // (which sets transform on .tail) does not replace it.
  const tail = (extra = "") => `<g ${extra}><g class="tail">
      <path d="M188 252 C252 254 284 204 266 152 C256 122 230 116 222 134 C240 152 240 196 200 222 Z" fill="url(#${id}t)"/>
      <path d="M255 176 C262 166 263 154 259 144" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round" ${glow} opacity=".9"/>
    </g></g>`;
  const ear = (dir) => {
    const m = (x) => (dir < 0 ? x : 300 - x); // mirror for the right ear
    return `<path d="M${m(120)} 84 C${m(108)} 58 ${m(104)} ${t + 20} ${m(110)} ${t} C${m(128)} ${t + 12} ${m(142)} 48 ${m(144)} 70 Z" fill="${p.body}"/>
      <path d="M${m(123)} 72 C${m(116)} 54 ${m(114)} ${t + 26} ${m(116)} ${t + 16} C${m(126)} ${t + 26} ${m(134)} 52 ${m(136)} 66 Z" fill="${p.dark}"/>
      <path d="M${m(110)} ${t} C${m(112)} ${t + 8} ${m(116)} ${t + 14} ${m(120)} ${t + 18}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round" ${glow}/>`;
  };
  const eye = (x, dir) =>
    `<path d="M${x - 13 * dir} 99 C${x - 6 * dir} 91 ${x + 6 * dir} 91 ${x + 11 * dir} 100 C${x + 4 * dir} 106 ${x - 6 * dir} 106 ${x - 13 * dir} 99 Z" fill="${EYE}"/>
     <ellipse cx="${x}" cy="98.5" rx="5" ry="5" fill="${accent}"/><ellipse cx="${x}" cy="98.5" rx="1.8" ry="4" fill="${EYE}"/>
     <circle cx="${x + 2}" cy="96" r="1.4" fill="#fff"/>`;

  return `<defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.body}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>
    <linearGradient id="${id}t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${p.dark}"/><stop offset=".75" stop-color="${p.body}"/><stop offset="1" stop-color="${p.cream}"/></linearGradient>
    <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse class="shadow" cx="160" cy="262" rx="${78 * s.scale + 8}" ry="8" fill="currentColor" opacity=".12"/>
  <g class="hop"><g transform="translate(150 262) scale(${s.scale}) translate(-150 -262)"><g class="sway">
    ${s.tails === 2 ? tail(`transform="rotate(-26 196 246) translate(4 6) scale(.92)" opacity=".9"`) : ""}
    ${tail(s.tailScale !== 1 ? `transform="translate(196 246) scale(${s.tailScale}) translate(-196 -246)"` : "")}
    <path d="M150 124 C186 124 202 162 202 206 C202 242 186 258 150 258 C114 258 98 242 98 206 C98 162 114 124 150 124 Z" fill="url(#${id}b)"/>
    <path d="M122 198 C120 224 120 244 117 256 C124 261 135 261 138 256 C138 238 139 220 141 202 Z" fill="${p.body}"/>
    <path d="M178 198 C180 224 180 244 183 256 C176 261 165 261 162 256 C162 238 161 220 159 202 Z" fill="${p.body}"/>
    <ellipse cx="127" cy="257" rx="12" ry="5" fill="${p.dark}"/><ellipse cx="173" cy="257" rx="12" ry="5" fill="${p.dark}"/>
    ${s.bands ? `<path d="M121 236 L139 236 M161 236 L179 236" stroke="${accent}" stroke-width="4" stroke-linecap="round" ${glow} opacity=".85"/>` : ""}
    ${s.mane
      ? `<path d="M150 124 C178 120 198 136 202 158 C206 178 192 192 180 186 C178 202 164 206 150 222 C136 206 122 202 120 186 C108 192 94 178 98 158 C102 136 122 120 150 124 Z" fill="${p.cream}"/>
         <path d="M112 176 Q118 184 126 184 M188 176 Q182 184 174 184" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round" ${glow} opacity=".8"/>`
      : `<path d="M150 138 C172 138 180 164 174 186 C168 202 159 196 150 212 C141 196 132 202 126 186 C120 164 128 138 150 138 Z" fill="${p.cream}"/>`}
    <g class="head">
      ${ear(-1)}${ear(1)}
      <path d="M150 62 C176 62 194 80 194 100 C194 118 177 132 161 140 L150 147 L139 140 C123 132 106 118 106 100 C106 80 124 62 150 62 Z" fill="${p.body}"/>
      <path d="M150 106 C163 106 169 118 163 128 L150 141 L137 128 C131 118 137 106 150 106 Z" fill="${p.cream}"/>
      ${s.diamond ? `<path d="M150 70 L156 80 L150 90 L144 80 Z" fill="${accent}" ${glow} opacity=".9"/>` : ""}
      <g class="eyes">${eye(134, 1)}${eye(166, -1)}</g>
      <path d="M145 125 Q150 121 155 125 Q150 131 145 125 Z" fill="${EYE}"/>
    </g>
  </g></g></g>`;
}

export default {
  id: "sleek",
  label: "Sleek",
  blurb: "A graceful fox-like creature with glowing markings.",
  stages: [
    { name: "Kit", blurb: "Small and curious." },
    { name: "Vael", blurb: "Grown into its markings." },
    { name: "Aurivael", blurb: "Maned, two-tailed and glowing." },
  ],
  palettes: {
    slate: { label: "Slate", body: "#62718C", dark: "#3E4A62", cream: "#E8E2D6" },
    sand: { label: "Sand", body: "#C9A27E", dark: "#8E6A4C", cream: "#F4ECDF" },
    ash: { label: "Ash", body: "#8C8C95", dark: "#56565F", cream: "#EEECEA" },
    moss: { label: "Moss", body: "#7E8F6E", dark: "#55624A", cream: "#ECEDE0" },
    ember: { label: "Ember", body: "#B5694F", dark: "#7E4130", cream: "#F2E3D6" },
    night: { label: "Night", body: "#40445C", dark: "#25273B", cream: "#CDCFDC" },
  },
  draw,
};
