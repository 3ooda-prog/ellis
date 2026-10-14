// Ellis web client. No framework, no build step; talks to the /v1 API.
// All text from the server is rendered with textContent, never as HTML.
// Creature SVG comes from public/creatures, built only from its own tables.

import { ACCENTS, FAMILIES, creatureSvg, formName, normalizeAppearance } from "./creatures/index.js";

const TOKEN_KEY = "ellis.token";
const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = { token: null, me: null, companion: null, areaNames: {}, sending: false, draft: null, wasReady: false };

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

class AuthError extends Error {}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { authorization: `Bearer ${state.token}`, ...(opts.body ? { "content-type": "application/json" } : {}), ...opts.headers },
  });
  if (res.status === 401) throw new AuthError("That token wasn't accepted. Check it and try again.");
  return res;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function fmtDue(iso) {
  if (!iso) return "";
  const tz = state.me?.user.timezone || undefined;
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// ---------- the creature ----------
let moodTimer = null;

function creatureEl() {
  return $("creature").querySelector("svg");
}

/** idle | listening | thinking | talking | happy | sad. Timed moods fall back to idle. */
function mood(name, ms) {
  const svg = creatureEl();
  if (!svg) return;
  clearTimeout(moodTimer);
  svg.classList.remove("is-listening", "is-thinking", "is-talking", "is-happy", "is-sad");
  if (name !== "idle") svg.classList.add(`is-${name}`);
  if (ms) moodTimer = setTimeout(() => mood(state.sending ? "thinking" : "idle"), ms);
}

function setGlow(appearance) {
  const hex = ACCENTS[normalizeAppearance(appearance).accent].hex;
  document.documentElement.style.setProperty("--glow", hex);
}

function renderCompanion() {
  const c = state.companion;
  $("creature").innerHTML = creatureSvg(c.appearance, c.stage, { label: c.name });
  setGlow(c.appearance);
  $("companion-name").textContent = c.name;
  $("form-name").textContent = formName(c.appearance, c.stage);
  $("message").placeholder = `Tell ${c.name} anything…`;
  renderGrowth();
}

function growthProgress(g) {
  if (!g || g.next_at === null) return 1;
  return Math.max(0, Math.min(1, (g.points - g.stage_start) / (g.next_at - g.stage_start)));
}

function renderGrowth() {
  const g = state.companion.growth;
  $("bond-fill").style.width = `${Math.round(growthProgress(g) * 100)}%`;
  const banner = $("evolve-banner");
  banner.hidden = !g?.ready;
  if (g?.ready) {
    const next = formName(state.companion.appearance, state.companion.stage + 1);
    $("evolve-banner-text").textContent = `${state.companion.name} is ready to evolve into ${next}`;
  }
}

// ---------- sign in / out ----------
function showSignin(message) {
  $("app").hidden = true;
  $("signin").hidden = false;
  $("signin-creature").innerHTML = creatureSvg({ family: "sleek", palette: "slate", accent: "teal" }, 1, { label: "Ellis" });
  const err = $("signin-error");
  err.hidden = !message;
  err.textContent = message || "";
  $("token").focus();
}

async function loadMe() {
  const res = await api("/v1/me");
  if (!res.ok) throw new Error(`Couldn't load your account (${res.status}).`);
  state.me = await res.json();
  for (const a of state.me.areas) state.areaNames[a.key] = a.name;
  state.companion = state.me.companions.find((c) => c.is_primary) || state.me.companions[0];
}

async function start() {
  state.token = readToken();
  if (!state.token) return showSignin();
  try {
    await loadMe();
  } catch (e) {
    if (e instanceof AuthError) writeToken(null);
    return showSignin(e.message);
  }
  state.wasReady = !!state.companion.growth?.ready;
  $("signin").hidden = true;
  $("app").hidden = false;
  renderCompanion();
  await Promise.all([loadLastReply(), refreshMemoryCount()]);
  if (!state.companion.appearance?.family) openCompanion(true);
  else $("message").focus();
}

$("signin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("token").value.trim();
  if (!t) return;
  writeToken(t);
  $("token").value = "";
  start();
});

$("signout").addEventListener("click", () => {
  writeToken(null);
  state.token = null;
  showSignin();
});

// ---------- conversation ----------
async function currentTurns() {
  const list = await (await api("/v1/conversations")).json();
  const open = list.conversations.find((c) => !c.ended_at);
  if (!open) return [];
  return (await (await api(`/v1/conversations/${open.id}/turns`)).json()).turns;
}

function showBubble(text, { thinking = false, error = false } = {}) {
  const b = $("bubble");
  b.hidden = false;
  b.classList.toggle("thinking", thinking);
  b.classList.toggle("error", error);
  $("bubble-text").textContent = text;
  $("receipts").replaceChildren();
}

async function loadLastReply() {
  let turns = [];
  try {
    turns = await currentTurns();
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
  }
  const last = [...turns].reverse().find((t) => t.role === "assistant");
  showBubble(last ? last.content : `Hi, I'm ${state.companion.name}. What's on your mind?`);
}

const RECEIPT_LABEL = {
  saved: "Saved",
  unconfirmed: "Not sure, saved to check",
  corrected: "Updated",
  completed: "Done",
  forgotten: "Forgotten",
};

function renderReceipts(receipts) {
  const wrap = $("receipts");
  wrap.replaceChildren();
  for (const r of receipts) {
    const chip = el("span", `receipt ${r.action}`);
    chip.append(el("b", null, `${RECEIPT_LABEL[r.action] || r.action}: `), document.createTextNode(r.record.text));
    if (r.record.due_at && r.action !== "completed") chip.append(document.createTextNode(` · ${fmtDue(r.record.due_at)}`));
    wrap.append(chip);
  }
}

/** Parse a fetch body as Server-Sent Events. */
async function readSse(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").find((l) => l.startsWith("data: "));
      if (data) onEvent(JSON.parse(data.slice(6)));
    }
  }
}

class ChatError extends Error {}

async function send(text) {
  state.sending = true;
  $("send").disabled = true;
  const said = $("you-said");
  said.hidden = false;
  said.textContent = `You: ${text}`;
  showBubble("", { thinking: true });
  mood("thinking");

  let reply = "";
  try {
    const res = await api("/v1/chat", {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ message: text, companion_id: state.companion.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ChatError(body.error === "invalid body" ? "That message couldn't be sent. Messages can be up to 8,000 characters." : `Something went wrong (${res.status}). Your message was saved.`);
    }
    await readSse(res, (e) => {
      if (e.type === "delta") {
        if (!reply) { $("bubble").classList.remove("thinking"); mood("talking"); }
        reply += e.text;
        $("bubble-text").textContent = reply;
      } else if (e.type === "receipts") {
        renderReceipts(e.receipts);
        if (e.receipts.length) mood("happy", 900);
      } else if (e.type === "error") {
        throw new ChatError(e.error);
      }
    });
    if (!creatureEl()?.classList.contains("is-happy")) mood("idle");
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    const msg = e instanceof ChatError ? e.message : "Couldn't reach Ellis. Check your connection; your message may not have been saved.";
    showBubble(msg, { error: true });
    mood("sad", 2600);
  } finally {
    state.sending = false;
    $("send").disabled = false;
    afterTurn();
  }
}

async function afterTurn() {
  refreshMemoryCount();
  try {
    await loadMe();
    renderGrowth();
    if (state.companion.growth?.ready && !state.wasReady) {
      state.wasReady = true;
      showBubble(`Something's happening… I think I'm ready to grow.`);
    }
  } catch { /* growth refresh is best-effort */ }
}

const input = $("message");
function autosize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}
input.addEventListener("input", () => {
  autosize();
  if (!state.sending) mood(input.value.trim() ? "listening" : "idle");
});
input.addEventListener("blur", () => { if (!state.sending && !input.value.trim()) mood("idle"); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || state.sending) return;
  input.value = "";
  autosize();
  send(text);
});

// ---------- sheets ----------
for (const d of document.querySelectorAll("dialog.sheet")) {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // backdrop
  for (const b of d.querySelectorAll("[data-close]")) b.addEventListener("click", () => d.close());
}

// memory
async function fetchRecords() {
  return (await (await api("/v1/records")).json()).records;
}

async function refreshMemoryCount() {
  try {
    const live = (await fetchRecords()).filter((r) => r.status === "active" || r.status === "candidate");
    const badge = $("memory-count");
    const prev = badge.textContent;
    badge.textContent = String(live.length);
    badge.hidden = live.length === 0;
    if (prev !== badge.textContent && !reducedMotion.matches) {
      badge.classList.remove("bump");
      void badge.offsetWidth;
      badge.classList.add("bump");
    }
  } catch (e) {
    if (e instanceof AuthError) showSignin(e.message);
  }
}

$("open-memory").addEventListener("click", async () => {
  $("memory-sheet").showModal();
  const body = $("memory-body");
  body.replaceChildren(el("p", "empty-note", "Loading…"));
  let records;
  try { records = await fetchRecords(); } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    body.replaceChildren(el("p", "error", "Couldn't load memories. Try again in a moment."));
    return;
  }
  const live = records.filter((r) => r.status === "active" || r.status === "candidate");
  const now = Date.now();
  const groups = [
    ["Coming up", live.filter((r) => r.kind === "event" && r.status === "active" && r.due_at && Date.parse(r.due_at) >= now)
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))],
    ["To do", live.filter((r) => r.kind === "task" && r.status === "active")],
    ["Not sure yet", live.filter((r) => r.status === "candidate")],
    ["Decisions", live.filter((r) => r.kind === "decision" && r.status === "active")],
    ["About you", live.filter((r) => r.kind === "fact" && r.status === "active")],
    ["Past events", live.filter((r) => r.kind === "event" && r.status === "active" && (!r.due_at || Date.parse(r.due_at) < now))],
    ["Recently finished", records.filter((r) => r.status === "done").slice(0, 5)],
  ];
  body.replaceChildren();
  for (const [title, items] of groups) {
    if (!items.length) continue;
    const g = el("section", "group");
    g.append(el("h3", null, title));
    const ul = el("ul");
    for (const r of items) {
      const li = el("li", `rec ${r.status}`);
      li.append(el("span", null, r.text));
      const meta = [r.area_key ? state.areaNames[r.area_key] : null, r.due_at ? fmtDue(r.due_at) : null].filter(Boolean);
      if (meta.length) li.append(el("span", "meta", meta.join(" · ")));
      ul.append(li);
    }
    g.append(ul);
    body.append(g);
  }
  if (!body.children.length) {
    body.append(el("p", "empty-note", `Nothing saved yet. Tell ${state.companion.name} about your plans, tasks or decisions and they'll show up here.`));
  }
});

// history
$("open-history").addEventListener("click", async () => {
  $("history-sheet").showModal();
  const body = $("history-body");
  body.replaceChildren(el("li", "empty-note", "Loading…"));
  try {
    const turns = await currentTurns();
    body.replaceChildren(...turns.map((t) => el("li", t.role, t.content)));
    if (!turns.length) body.replaceChildren(el("li", "empty-note", "No messages yet in this conversation."));
    body.lastElementChild?.scrollIntoView({ block: "end" });
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    body.replaceChildren(el("li", "error", "Couldn't load the conversation."));
  }
});

// ---------- companion editor ----------
function swatchColor(family, key) {
  const p = FAMILIES[family].palettes[key];
  return p.body || p.edge || p.top;
}

function radio(name, value, checked, onPick) {
  const input = el("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener("change", () => onPick(value));
  return input;
}

function renderEditor() {
  const d = state.draft;
  const stage = state.companion.stage;
  $("preview").innerHTML = creatureSvg(d.appearance, stage, { label: d.name || "Your companion" });
  $("preview-form").textContent = formName(d.appearance, stage);
  document.querySelector("#companion-sheet").style.setProperty("--glow", ACCENTS[d.appearance.accent].hex);

  const fams = $("family-options");
  fams.replaceChildren();
  for (const [key, fam] of Object.entries(FAMILIES)) {
    const label = el("label", "family");
    const mini = el("span", "mini");
    const look = normalizeAppearance({ family: key, palette: d.appearance.palette, accent: d.appearance.accent });
    mini.innerHTML = creatureSvg(look, stage, { label: fam.label });
    label.append(radio("family", key, key === d.appearance.family, (v) => {
      d.appearance = normalizeAppearance({ ...d.appearance, family: v, palette: d.appearance.palette });
      renderEditor();
    }), mini, el("span", null, fam.label));
    label.title = fam.blurb;
    fams.append(label);
  }

  const pals = $("palette-options");
  pals.replaceChildren();
  for (const [key, p] of Object.entries(FAMILIES[d.appearance.family].palettes)) {
    const label = el("label", "swatch");
    label.style.setProperty("--sw", swatchColor(d.appearance.family, key));
    label.title = p.label;
    const r = radio("palette", key, key === d.appearance.palette, (v) => { d.appearance.palette = v; renderEditor(); });
    r.setAttribute("aria-label", p.label);
    label.append(r);
    pals.append(label);
  }

  const accs = $("accent-options");
  accs.replaceChildren();
  for (const [key, a] of Object.entries(ACCENTS)) {
    const label = el("label", "swatch");
    label.style.setProperty("--sw", a.hex);
    label.title = a.label;
    const r = radio("accent", key, key === d.appearance.accent, (v) => { d.appearance.accent = v; renderEditor(); });
    r.setAttribute("aria-label", a.label);
    label.append(r);
    accs.append(label);
  }

  // evolution line and growth
  const g = state.companion.growth;
  const line = $("evolution-line");
  line.replaceChildren();
  FAMILIES[d.appearance.family].stages.forEach((st, i) => {
    const n = i + 1;
    const locked = n > stage && !state.me?.dev_tools;
    const cell = el("div", `evo${n === stage ? " current" : ""}${locked ? " locked" : ""}`);
    const mini = el("span", "mini");
    mini.innerHTML = creatureSvg(d.appearance, n, { label: locked ? "Not yet discovered" : st.name });
    cell.append(mini, el("span", null, locked ? "???" : st.name));
    line.append(cell);
  });
  $("growth-fill").style.width = `${Math.round(growthProgress(g) * 100)}%`;
  const nextName = stage < 3 ? formName(d.appearance, stage + 1) : null;
  $("growth-text").textContent = !g
    ? ""
    : g.next_at === null
      ? "Fully grown."
      : g.ready
        ? `Ready to evolve into ${nextName}.`
        : g.points >= g.next_at
          ? `Ready to evolve into ${nextName}, but you're keeping this form.`
          : `${g.points} of ${g.next_at} growth. It grows when you finish tasks, make decisions and talk most days.`;
  $("keep-form").checked = !!state.companion.keep_form;
  $("growth-section").hidden = false;
  $("dev-section").hidden = !state.me?.dev_tools;
  $("dev-evolve").disabled = stage >= 3;
  $("dev-reset").disabled = stage <= 1;
}

function openCompanion(welcome = false) {
  const c = state.companion;
  state.draft = { name: c.name, appearance: normalizeAppearance(c.appearance) };
  $("companion-name-input").value = c.name;
  $("companion-title").textContent = welcome ? "Choose your companion" : "Your companion";
  $("companion-intro").hidden = !welcome;
  $("companion-error").hidden = true;
  $("companion-save").textContent = welcome ? "Start" : "Save";
  renderEditor();
  $("companion-sheet").showModal();
}

$("open-companion").addEventListener("click", () => openCompanion(false));
$("companion-name-input").addEventListener("input", (e) => { state.draft.name = e.target.value; });

$("companion-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = state.draft.name.trim();
  const err = $("companion-error");
  if (!name) { err.hidden = false; err.textContent = "Give your companion a name."; return; }
  $("companion-save").disabled = true;
  try {
    const res = await api(`/v1/companions/${state.companion.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, appearance: state.draft.appearance, keep_form: $("keep-form").checked }),
    });
    if (!res.ok) throw new Error("Couldn't save. Try again.");
    const body = await res.json();
    state.companion = { ...state.companion, ...body.companion, growth: body.growth };
    state.wasReady = !!body.growth?.ready;
    renderCompanion();
    $("companion-sheet").close();
    mood("happy", 900);
  } catch (ex) {
    if (ex instanceof AuthError) return showSignin(ex.message);
    err.hidden = false;
    err.textContent = ex.message;
  } finally {
    $("companion-save").disabled = false;
  }
});

// ---------- evolution ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The evolution sequence: silhouette swaps that speed up, a flash, the reveal. */
async function playEvolution(before, after) {
  const dlg = $("evolve-sheet");
  const box = $("evolve-creature");
  const oldSvg = creatureSvg(before.appearance, before.stage, { label: before.name });
  const newSvg = creatureSvg(after.appearance, after.stage, { label: after.name });
  const newForm = formName(after.appearance, after.stage);
  $("evolve-title").textContent = `What? ${before.name} is evolving!`;
  $("evolve-sub").textContent = "";
  $("evolve-done").hidden = true;
  box.innerHTML = oldSvg;
  box.classList.remove("silhouette");
  dlg.showModal();

  if (!reducedMotion.matches) {
    await wait(900);
    box.classList.add("silhouette");
    let gap = 520;
    let showNew = false;
    while (gap > 60) {
      await wait(gap);
      showNew = !showNew;
      box.innerHTML = showNew ? newSvg : oldSvg;
      gap *= 0.8;
    }
    box.innerHTML = newSvg;
    const flash = $("evolve-flash");
    flash.classList.remove("go");
    void flash.offsetWidth;
    flash.classList.add("go");
    await wait(280);
  }
  box.classList.remove("silhouette");
  box.innerHTML = newSvg;
  box.querySelector("svg")?.classList.add("is-happy");
  $("evolve-title").textContent = `${after.name} evolved into ${newForm}!`;
  $("evolve-sub").textContent = FAMILIES[normalizeAppearance(after.appearance).family].stages[after.stage - 1].blurb;
  $("evolve-done").hidden = false;
  $("evolve-done").focus();
}

function applyCompanion(body) {
  state.companion = { ...state.companion, ...body.companion, growth: body.growth };
  state.wasReady = !!body.growth?.ready;
  renderCompanion();
}

$("evolve-banner").addEventListener("click", async () => {
  const before = { ...state.companion };
  const res = await api(`/v1/companions/${before.id}/evolve`, { method: "POST" }).catch((e) => e);
  if (res instanceof AuthError) return showSignin(res.message);
  if (!(res instanceof Response) || !res.ok) {
    showBubble("Not quite ready yet. Let's keep going.");
    await afterTurn();
    return;
  }
  const body = await res.json();
  await playEvolution(before, { ...before, ...body.companion });
  applyCompanion(body);
});

// Development: jump stages to preview the designs (only when the server allows it).
async function devSetStage(stage) {
  const res = await api(`/v1/dev/companions/${state.companion.id}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
  if (!res.ok) throw new Error(`Dev stage change failed (${res.status}).`);
  return res.json();
}

$("dev-evolve").addEventListener("click", async () => {
  // Uses the saved look; save first to preview a different kind or colour.
  const before = { ...state.companion };
  try {
    const body = await devSetStage(before.stage + 1);
    $("companion-sheet").close();
    await playEvolution(before, { ...before, stage: body.companion.stage });
    applyCompanion(body);
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    $("companion-error").hidden = false;
    $("companion-error").textContent = e.message;
  }
});

$("dev-reset").addEventListener("click", async () => {
  try {
    applyCompanion(await devSetStage(1));
    renderEditor();
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    $("companion-error").hidden = false;
    $("companion-error").textContent = e.message;
  }
});

$("evolve-done").addEventListener("click", () => {
  $("evolve-sheet").close();
  mood("happy", 900);
});
$("evolve-sheet").addEventListener("cancel", (e) => { if ($("evolve-done").hidden) e.preventDefault(); });

start();
