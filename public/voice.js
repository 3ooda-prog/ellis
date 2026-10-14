// Voice in and out, using the browser's own speech services (free, no keys).
//   Listening: SpeechRecognition (Chrome, Edge, Safari; not Firefox).
//   Speaking:  speechSynthesis (all modern browsers).
// Replies are spoken sentence by sentence as they stream in, so the companion
// starts talking before the whole reply has arrived.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

export const canListen = !!Recognition;
export const canSpeak = !!synth && typeof SpeechSynthesisUtterance !== "undefined";

/** Each family sounds a little different. */
const VOICE_SHAPE = {
  sleek: { pitch: 1.0, rate: 1.02 },
  spirit: { pitch: 1.2, rate: 0.98 },
  toy: { pitch: 1.12, rate: 1.06 },
};

// Names of voices that sound natural, best first. Falls back to any English voice.
const PREFERRED = [/natural/i, /neural/i, /google uk english female/i, /samantha/i, /serena/i, /karen/i, /moira/i, /google us english/i, /microsoft aria/i, /microsoft jenny/i];

function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = english.find((x) => re.test(x.name));
    if (v) return v;
  }
  return english.find((v) => v.localService) ?? english[0] ?? voices[0] ?? null;
}

/**
 * Speaks text as it streams. Call push() with each delta, then finish().
 * onStart/onEnd fire once around the whole reply (for the talking mood).
 */
export class Speaker {
  constructor({ family = "sleek", onStart, onEnd } = {}) {
    this.family = family;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.buffer = "";
    this.pending = 0;
    this.active = false;
    this.finished = false;
  }

  push(delta) {
    this.buffer += delta;
    // Speak each complete sentence; keep the unfinished tail buffered.
    const re = /[^.!?…]+[.!?…]+["')\]]*\s+/g;
    let m;
    let last = 0;
    while ((m = re.exec(this.buffer))) {
      this.#say(m[0]);
      last = re.lastIndex;
    }
    this.buffer = this.buffer.slice(last);
  }

  finish() {
    this.finished = true;
    if (this.buffer.trim()) this.#say(this.buffer);
    this.buffer = "";
    if (this.pending === 0) this.#done();
  }

  cancel() {
    this.finished = true;
    this.buffer = "";
    synth?.cancel();
    this.pending = 0;
    this.#done();
  }

  #say(text) {
    const clean = text.replace(/[*_#`>~]/g, "").trim();
    if (!clean || !canSpeak) return;
    const u = new SpeechSynthesisUtterance(clean);
    const shape = VOICE_SHAPE[this.family] ?? VOICE_SHAPE.sleek;
    const voice = pickVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.pitch = shape.pitch;
    u.rate = shape.rate;
    this.pending++;
    u.onstart = () => {
      if (!this.active) { this.active = true; this.onStart?.(); }
    };
    const settle = () => {
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0 && this.finished) this.#done();
    };
    u.onend = settle;
    u.onerror = settle;
    synth.speak(u);
  }

  #done() {
    if (this.ended) return;
    this.ended = true;
    this.active = false;
    this.onEnd?.();
  }
}

/** iOS and some browsers only allow speech after a user gesture. Call from a tap. */
export function primeSpeech() {
  if (!canSpeak) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch { /* ignore */ }
}

export function stopSpeaking() {
  synth?.cancel();
}

/**
 * One listening session. Resolves with the final transcript ("" if nothing
 * was heard). onInterim receives the words so far, for live display.
 */
export function listenOnce({ onInterim, lang } = {}) {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error("unsupported"));
    const rec = new Recognition();
    rec.lang = lang || navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    let settled = false;
    const finish = (fn) => { if (!settled) { settled = true; fn(); } };

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return finish(() => resolve(finalText.trim()));
      finish(() => reject(Object.assign(new Error(e.error || "speech error"), { code: e.error })));
    };
    rec.onend = () => finish(() => resolve(finalText.trim()));

    listenOnce.current = rec;
    try { rec.start(); } catch (err) { finish(() => reject(err)); }
  });
}

export function stopListening() {
  try { listenOnce.current?.stop(); } catch { /* ignore */ }
}
