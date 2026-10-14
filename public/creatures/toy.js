// Toy family: a matte vinyl-figure look, two-tone like an outfit, with a
// small face. Grows from a pocket-sized figure into a tall one with an
// antenna and a glowing belt.

const STAGE = {
  1: { scale: 0.72, top: 66, ear: 0, antenna: false, belt: false, badges: 0 },
  2: { scale: 0.9, top: 66, ear: 0, antenna: false, belt: false, badges: 1 },
  3: { scale: 0.92, top: 44, ear: 10, antenna: true, belt: true, badges: 2 },
};

function draw({ stage, palette: p, accent, id }) {
  const s = STAGE[stage];
  const T = s.top;
  const e = s.ear;
  const bodyPath = `M150 ${T} C196 ${T} 214 ${T + 36} 214 ${T + 84} L214 196 C214 228 190 244 150 244 C110 244 86 228 86 196 L86 ${T + 84} C86 ${T + 36} 104 ${T} 150 ${T} Z`;
  const glow = `filter="url(#${id}g)"`;
  const badge = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="${accent}"/><circle cx="${x}" cy="${y}" r="3" fill="${p.bottomLight}"/>`;
  return `<defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.topLight}"/><stop offset="1" stop-color="${p.top}"/></linearGradient>
    <linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bottomLight}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient>
    <clipPath id="${id}k"><path d="${bodyPath}"/></clipPath>
    <filter id="${id}f"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="${id}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse class="shadow" cx="150" cy="250" rx="${62 * s.scale + 6}" ry="7" fill="currentColor" opacity=".14"/>
  <g class="hop"><g transform="translate(150 250) scale(${s.scale}) translate(-150 -250)"><g class="sway">
    ${s.antenna ? `<g class="antenna"><path d="M150 ${T + 2} L150 ${T - 24}" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="${T - 28}" r="6" fill="${accent}" ${glow}/></g>` : ""}
    <path d="M102 ${T + 34} L102 ${T - 8 - e} Q104 ${T - 16 - e} 112 ${T - 12 - e} L136 ${T + 8} Z" fill="${p.top}"/>
    <path d="M198 ${T + 34} L198 ${T - 8 - e} Q196 ${T - 16 - e} 188 ${T - 12 - e} L164 ${T + 8} Z" fill="${p.top}"/>
    <g clip-path="url(#${id}k)">
      <rect x="80" y="${T - 6}" width="140" height="${256 - T}" fill="url(#${id}a)"/>
      <path d="M80 178 Q150 196 220 178 L220 250 L80 250 Z" fill="url(#${id}c)"/>
      ${s.belt ? `<path d="M80 180 Q150 198 220 180" stroke="${accent}" stroke-width="6" fill="none" ${glow} opacity=".9"/>` : ""}
      <ellipse cx="118" cy="${T + 32}" rx="26" ry="16" fill="#fff" opacity=".35" filter="url(#${id}f)"/>
    </g>
    <rect x="78" y="164" width="16" height="34" rx="8" fill="${p.top}"/>
    <rect x="206" y="164" width="16" height="34" rx="8" fill="${p.top}"/>
    <g class="eyes"><circle cx="130" cy="${T + 74}" r="5.5" fill="${p.ink}"/><circle cx="170" cy="${T + 74}" r="5.5" fill="${p.ink}"/></g>
    <path d="M146 ${T + 86} Q150 ${T + 89} 154 ${T + 86}" stroke="${p.ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    ${s.badges >= 1 ? badge(176, 210) : ""}${s.badges >= 2 ? badge(124, 214) : ""}
  </g></g></g>`;
}

export default {
  id: "toy",
  label: "Toy",
  blurb: "A matte designer figure with a tiny face.",
  stages: [
    { name: "Nib", blurb: "Pocket-sized." },
    { name: "Bao", blurb: "Badged and ready." },
    { name: "Bastion", blurb: "Tall, belted and lit up." },
  ],
  palettes: {
    sage: { label: "Sage", top: "#8FA894", topLight: "#B3C7B6", bottom: "#E2D8C6", bottomLight: "#F2EBDD", ink: "#2C2F2D" },
    rose: { label: "Rose", top: "#C99393", topLight: "#E3B5B2", bottom: "#46434D", bottomLight: "#5E5A66", ink: "#2C2A30" },
    sky: { label: "Sky", top: "#8FAFD6", topLight: "#B6CDEA", bottom: "#3B4A6B", bottomLight: "#53648A", ink: "#22283A" },
    butter: { label: "Butter", top: "#E3C77E", topLight: "#F0DCA4", bottom: "#6E6A48", bottomLight: "#878259", ink: "#2E2C20" },
    lilac: { label: "Lilac", top: "#AE9CD3", topLight: "#CCBFE6", bottom: "#EEE6D8", bottomLight: "#F7F2EA", ink: "#2B2833" },
    clay: { label: "Clay", top: "#C48A6E", topLight: "#DDAA90", bottom: "#E8D8C3", bottomLight: "#F4EADD", ink: "#2E2622" },
  },
  draw,
};
