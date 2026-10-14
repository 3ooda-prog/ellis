// The companion registry. Each family (sleek, spirit, toy, ...) is one module
// that draws its three evolution stages. To add a family: write a module with
// the same shape as sleek.js and add it to FAMILIES below. Nothing else changes.
//
// Shared by the browser (drawing) and the server (validating saved looks).
// Every value that reaches SVG markup comes from these tables, never from
// user input, so the markup is safe to insert as HTML.

import sleek from "./sleek.js";
import spirit from "./spirit.js";
import toy from "./toy.js";

export const FAMILIES = { sleek, spirit, toy };

/** Glow/marking colour, shared by every family. */
export const ACCENTS = {
  teal: { label: "Teal", hex: "#7FE3D3" },
  amber: { label: "Amber", hex: "#FFB36B" },
  rose: { label: "Rose", hex: "#FF8FB1" },
  violet: { label: "Violet", hex: "#B79CFF" },
  frost: { label: "Frost", hex: "#EEF3FF" },
};

export const STAGES = [1, 2, 3];
export const DEFAULT_APPEARANCE = { family: "sleek", palette: "slate", accent: "teal" };

export function normalizeAppearance(a) {
  const family = a && FAMILIES[a.family] ? a.family : DEFAULT_APPEARANCE.family;
  const fam = FAMILIES[family];
  const palette = a && a.palette in fam.palettes ? a.palette : Object.keys(fam.palettes)[0];
  const accent = a && a.accent in ACCENTS ? a.accent : DEFAULT_APPEARANCE.accent;
  return { family, palette, accent };
}

/** Exactly {family, palette, accent}, each allowed. Used to validate saves. */
export function isValidAppearance(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const keys = Object.keys(a).sort().join(",");
  if (keys !== "accent,family,palette") return false;
  const fam = Object.hasOwn(FAMILIES, a.family) ? FAMILIES[a.family] : null;
  return !!fam && Object.hasOwn(fam.palettes, a.palette) && Object.hasOwn(ACCENTS, a.accent);
}

export function formName(appearance, stage) {
  const a = normalizeAppearance(appearance);
  return FAMILIES[a.family].stages[clampStage(stage) - 1].name;
}

const clampStage = (s) => (s === 2 || s === 3 ? s : 1);

let uid = 0;

/**
 * The companion as an SVG string. State classes on the root (is-thinking,
 * is-talking, is-happy, is-listening, is-sad, is-evolving) drive CSS motion.
 */
export function creatureSvg(appearance, stage = 1, { label = "Your companion" } = {}) {
  const a = normalizeAppearance(appearance);
  const fam = FAMILIES[a.family];
  const id = `c${++uid}`;
  const safe = String(label).replace(/[<>&"]/g, "");
  const inner = fam.draw({ stage: clampStage(stage), palette: fam.palettes[a.palette], accent: ACCENTS[a.accent].hex, id });
  return `<svg class="creature fam-${a.family}" viewBox="0 0 300 300" role="img" aria-label="${safe}" data-stage="${clampStage(stage)}">${inner}</svg>`;
}
