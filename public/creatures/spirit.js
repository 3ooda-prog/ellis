// Spirit family: a soft glowing form with eyes and no mouth. Mood shows
// through light and motion. Grows from a small orb into a crowned flame.

function draw({ stage, palette: p, accent, id }) {
  const glowDefs = `<defs>
    <radialGradient id="${id}h" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}b" cx=".42" cy=".42" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="${p.light}"/><stop offset="1" stop-color="${p.edge}"/></radialGradient>
    <filter id="${id}s"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="${id}m" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  const eyes = (cx, cy, gap, rx, ry) => `<g class="eyes">
      <ellipse cx="${cx - gap}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.eye}"/><ellipse cx="${cx + gap}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.eye}"/>
      <circle cx="${cx - gap + 2}" cy="${cy - ry * 0.4}" r="${rx * 0.32}" fill="#fff" opacity=".9"/><circle cx="${cx + gap + 2}" cy="${cy - ry * 0.4}" r="${rx * 0.32}" fill="#fff" opacity=".9"/>
    </g>`;
  const motes = (pts) =>
    `<g class="motes" fill="${accent}" filter="url(#${id}m)">${pts
      .map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`)
      .join("")}</g>`;
  const wisps = (y, spread, size) => `<g class="wisps" fill="${p.light}" opacity=".7">
      <path d="M${150 - spread} ${y} C${140 - spread} ${y + size} ${144 - spread} ${y + size * 2} ${156 - spread} ${y + size * 2.1} C${148 - spread} ${y + size * 1.5} ${150 - spread} ${y + size * 0.8} ${160 - spread} ${y + 4} Z"/>
      <path d="M${150 + spread} ${y} C${160 + spread} ${y + size} ${156 + spread} ${y + size * 2} ${144 + spread} ${y + size * 2.1} C${152 + spread} ${y + size * 1.5} ${150 + spread} ${y + size * 0.8} ${140 + spread} ${y + 4} Z"/>
    </g>`;

  let body;
  if (stage === 1) {
    body = `<circle cx="150" cy="196" r="84" fill="url(#${id}h)"/>
      ${wisps(228, 18, 8)}
      <circle class="flame" cx="150" cy="196" r="42" fill="url(#${id}b)" filter="url(#${id}s)"/>
      ${eyes(150, 200, 14, 5, 7.5)}
      ${motes([[96, 160, 2.2, 0.6], [206, 150, 1.8, 0.5], [214, 214, 2.4, 0.45]])}`;
  } else if (stage === 2) {
    body = `<circle cx="150" cy="160" r="120" fill="url(#${id}h)"/>
      ${wisps(226, 32, 14)}
      <path class="flame" d="M150 50 C163 86 208 110 208 164 C208 206 181 232 150 232 C119 232 92 206 92 164 C92 122 127 104 138 76 C142 66 146 57 150 50 Z" fill="url(#${id}b)" filter="url(#${id}s)"/>
      ${eyes(150, 170, 18, 6.5, 10)}
      ${motes([[70, 110, 3, 0.6], [228, 96, 2.5, 0.5], [240, 190, 3.5, 0.45], [62, 200, 2, 0.5], [200, 60, 2, 0.4]])}`;
  } else {
    body = `<circle cx="150" cy="150" r="140" fill="url(#${id}h)"/>
      <ellipse class="orbit" cx="150" cy="168" rx="122" ry="34" fill="none" stroke="${accent}" stroke-opacity=".35" stroke-width="1.5"/>
      ${wisps(232, 40, 14)}
      <path class="flame side" d="M96 150 C80 122 82 96 92 80 C96 104 110 116 118 128 Z" fill="url(#${id}b)" filter="url(#${id}s)" opacity=".85"/>
      <path class="flame side" d="M204 150 C220 122 218 96 208 80 C204 104 190 116 182 128 Z" fill="url(#${id}b)" filter="url(#${id}s)" opacity=".85"/>
      <path class="flame" d="M150 22 C164 64 216 96 216 158 C216 208 186 238 150 238 C114 238 84 208 84 158 C84 110 124 88 137 58 C142 46 146 34 150 22 Z" fill="url(#${id}b)" filter="url(#${id}s)"/>
      ${eyes(150, 158, 20, 7, 11)}
      ${motes([[32, 168, 4, 0.8], [268, 170, 4, 0.8], [150, 202, 2.5, 0.0], [60, 92, 2.5, 0.5], [244, 70, 2.2, 0.5], [262, 236, 3, 0.4], [40, 240, 2.4, 0.4]])}`;
  }
  return `${glowDefs}
  <ellipse class="shadow" cx="150" cy="268" rx="${stage === 1 ? 34 : stage === 2 ? 48 : 60}" ry="6" fill="currentColor" opacity=".08"/>
  <g class="hop"><g class="float">${body}</g></g>`;
}

export default {
  id: "spirit",
  label: "Spirit",
  blurb: "A calm glowing spirit that speaks through light.",
  stages: [
    { name: "Glim", blurb: "A tiny spark." },
    { name: "Wisp", blurb: "A steady flame." },
    { name: "Lumen", blurb: "Crowned and orbited by light." },
  ],
  palettes: {
    moon: { label: "Moon", light: "#C9D3FF", edge: "#8C9DF0", glow: "#9FB2FF", eye: "#2A2F48" },
    ember: { label: "Ember", light: "#FFD7B8", edge: "#F2996A", glow: "#FFB98A", eye: "#4A2E2A" },
    aurora: { label: "Aurora", light: "#C6F5E4", edge: "#5CCFAE", glow: "#8FE8CC", eye: "#1F3A33" },
    rose: { label: "Rose", light: "#FFD2E1", edge: "#EE8AB0", glow: "#FFB0CC", eye: "#47242F" },
    dusk: { label: "Dusk", light: "#DCCFFF", edge: "#9F86F0", glow: "#BBA6FF", eye: "#2C2448" },
    sun: { label: "Sun", light: "#FFEDB8", edge: "#F0BC48", glow: "#FFD77A", eye: "#4A3A16" },
  },
  draw,
};
