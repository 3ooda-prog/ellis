// Ellis web client. No framework, no build step; talks to the /v1 API.
// All text from the server is rendered with textContent, never as HTML.
"use strict";

const TOKEN_KEY = "ellis.token";
const $ = (id) => document.getElementById(id);

const state = { token: null, me: null, areaNames: {}, sending: false };

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
  if (res.status === 401) throw new AuthError("Your token was not accepted.");
  return res;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---------- dates ----------
function fmtDue(iso) {
  if (!iso) return "";
  const tz = state.me?.user.timezone || undefined;
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

// ---------- sign in / out ----------
function showSignin(message) {
  $("app").hidden = true;
  $("signin").hidden = false;
  const err = $("signin-error");
  err.hidden = !message;
  err.textContent = message || "";
  $("token").focus();
}

async function start() {
  state.token = readToken();
  if (!state.token) return showSignin();
  try {
    const res = await api("/v1/me");
    if (!res.ok) throw new Error(`Could not load your account (${res.status}).`);
    state.me = await res.json();
  } catch (e) {
    if (e instanceof AuthError) writeToken(null);
    return showSignin(e.message);
  }
  for (const a of state.me.areas) state.areaNames[a.key] = a.name;
  const primary = state.me.companions.find((c) => c.is_primary) || state.me.companions[0];
  $("companion-name").textContent = primary ? primary.name : "Ellis";
  $("signin").hidden = true;
  $("app").hidden = false;
  await Promise.all([loadHistory(), loadMemory()]);
  $("message").focus();
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
  $("log").replaceChildren();
  showSignin();
});

// ---------- conversation ----------
function addTurn(role, text) {
  const li = el("li", `turn ${role}`);
  const bubble = el("div", "bubble", text);
  li.append(bubble);
  $("log").querySelector(".empty")?.remove();
  $("log").append(li);
  scrollToEnd();
  return { li, bubble };
}

function scrollToEnd() {
  const log = $("log");
  log.scrollTop = log.scrollHeight;
}

function showEmpty() {
  const name = $("companion-name").textContent;
  const li = el("li", "empty", `Say hello to ${name}. Mention plans, tasks or decisions and they'll be remembered.`);
  $("log").append(li);
}

async function loadHistory() {
  $("log").replaceChildren();
  try {
    const list = await (await api("/v1/conversations")).json();
    const open = list.conversations.find((c) => !c.ended_at);
    if (open) {
      const { turns } = await (await api(`/v1/conversations/${open.id}/turns`)).json();
      for (const t of turns) addTurn(t.role, t.content);
    }
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
  }
  if (!$("log").children.length) showEmpty();
}

const RECEIPT_LABEL = {
  saved: "Saved",
  unconfirmed: "Not sure, saved to check",
  corrected: "Updated",
  completed: "Done",
  forgotten: "Forgotten",
};

function renderReceipts(li, receipts) {
  if (!receipts.length) return;
  const wrap = el("div", "receipts");
  for (const r of receipts) {
    const chip = el("span", `receipt ${r.action}`);
    chip.append(el("b", null, `${RECEIPT_LABEL[r.action] || r.action}: `), document.createTextNode(r.record.text));
    if (r.record.due_at && r.action !== "completed") chip.append(document.createTextNode(` · ${fmtDue(r.record.due_at)}`));
    wrap.append(chip);
  }
  li.append(wrap);
  scrollToEnd();
}

/** Parse a fetch body as Server-Sent Events, calling onEvent for each complete event. */
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

async function send(text) {
  state.sending = true;
  $("send").disabled = true;
  $("status").textContent = "Thinking…";
  addTurn("user", text);
  const { li, bubble } = addTurn("assistant", "");
  bubble.classList.add("typing");

  let gotText = false;
  try {
    const res = await api("/v1/chat", {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error === "invalid body" ? "That message couldn't be sent. Messages can be up to 8,000 characters." : `Something went wrong (${res.status}).`);
    }
    await readSse(res, (e) => {
      if (e.type === "delta") {
        gotText = true;
        bubble.textContent += e.text;
        $("status").textContent = "Replying…";
        scrollToEnd();
      } else if (e.type === "receipts") {
        renderReceipts(li, e.receipts);
      } else if (e.type === "error") {
        throw new Error(e.error);
      }
    });
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    if (!gotText) li.remove();
    const last = $("log").lastElementChild;
    last?.append(el("div", "note error", `${e.message} Your message was kept.`));
    last?.classList.add("failed");
  } finally {
    bubble.classList.remove("typing");
    state.sending = false;
    $("send").disabled = false;
    $("status").textContent = "Here";
    loadMemory();
  }
}

const input = $("message");
function autosize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}
input.addEventListener("input", autosize);
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

// ---------- memory ----------
async function loadMemory() {
  let records;
  try {
    records = (await (await api("/v1/records")).json()).records;
  } catch (e) {
    if (e instanceof AuthError) return showSignin(e.message);
    return;
  }
  const live = records.filter((r) => r.status === "active" || r.status === "candidate");
  $("memory-count").textContent = String(live.length);

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

  const body = $("memory-body");
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
    body.append(el("p", "note", "Nothing saved yet. As you talk, the things worth keeping show up here."));
  }
}

function setMemoryOpen(open) {
  $("memory").classList.toggle("open", open);
  $("memory-toggle").setAttribute("aria-expanded", String(open));
}
$("memory-toggle").addEventListener("click", () => setMemoryOpen(!$("memory").classList.contains("open")));
$("memory-close").addEventListener("click", () => setMemoryOpen(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMemoryOpen(false); });

start();
