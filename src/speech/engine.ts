/**
 * Speech engine — a reliable wrapper around the Web Speech API.
 *
 * Hardened for Chrome's known TTS failure modes:
 *  - "Cancel → speak in the same tick" wedges the engine after a while (all
 *    subsequent speak() calls are silently ignored). We always drain the queue
 *    and wait a beat before starting the next utterance.
 *  - If an utterance never starts (wedge), an onstart watchdog recovers:
 *    cancel → wait → retry, with a silent dummy-utterance flush as last resort.
 *  - Utterance objects are referenced until they finish, so Chrome can't
 *    garbage-collect them out of the queue mid-speech.
 *  - A resume() keepalive protects long utterances from Chrome's ~15s cutoff.
 *
 * Also: voices load reliably (voiceschanged event + polling fallback, lazy
 * re-resolve), accurate word-boundary events for karaoke highlighting, iOS
 * Safari first-tap audio unlock, and per-context rate multipliers.
 */

const VOICE_LOAD_POLL_MS = 250;
const VOICE_LOAD_POLL_MAX = 40; // ~10s
const CHUNK_MAX_CHARS = 180;
const WATCHDOG_MS = 900; // utterance must have started within this window
const KEEPALIVE_MS = 8000;
const DRAIN_TIMEOUT_MS = 250; // max wait for the queue to actually empty
const DRAIN_MAX_KICKS = 4; // pause/resume kicks before giving up draining
export interface SpeakOptions {
  /** 0.1–10 multiplier chosen by the user in Settings */
  rate?: number;
  /** 0–2 */
  pitch?: number;
  /** 0–1 */
  volume?: number;
  /** Voice URI; empty string = engine default */
  voiceURI?: string;
  /** Called per word with its index in the tokenized text */
  onWord?: (index: number) => void;
  /** Audio actually started flowing (proof the engine is alive) */
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

type Listener = () => void;

interface Token {
  cancelled: boolean;
}

interface WordToken {
  text: string;
  start: number;
}

interface Chunk {
  text: string;
  tokens: WordToken[];
  /** Index of this chunk's first word in the full text */
  tokenOffset: number;
}

class SpeechEngine {
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded = false;
  private pollTries = 0;
  private pollTimer: number | null = null;
  private listeners = new Set<Listener>();
  private token: Token = { cancelled: false };
  private startTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private keepAliveTimer: number | null = null;
  private chunks: Chunk[] = [];
  private currentChunkIdx = 0;
  private activeOptions: SpeakOptions = {};
  private currentWord = -1;
  private pendingStart = false;
  /** Single-flight guard: only one recovery chain may run per sequence. */
  private recovering = false;
  /** GC protection: keep refs to queued/active utterances until they finish. */
  private liveUtterances = new Set<SpeechSynthesisUtterance>();

  constructor() {
    if (this.supported) {
      this.refreshVoices();
      const synth = window.speechSynthesis;
      synth.addEventListener?.('voiceschanged', this.refreshVoices);
      // Some engines never fire voiceschanged
      this.pollTimer = window.setInterval(() => {
        if (this.voicesLoaded || this.pollTries++ > VOICE_LOAD_POLL_MAX) {
          this.stopPolling();
          return;
        }
        this.refreshVoices();
      }, VOICE_LOAD_POLL_MS);
    }
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** True while speech is playing OR about to play (drain delay in flight). */
  get speaking(): boolean {
    if (!this.supported) return false;
    return (
      this.pendingStart ||
      this.currentWord >= 0 ||
      window.speechSynthesis.pending ||
      window.speechSynthesis.speaking
    );
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  getVoices = (): SpeechSynthesisVoice[] => this.voices;

  refreshVoices = (): void => {
    if (!this.supported) return;
    const all = window.speechSynthesis.getVoices();
    if (all.length) {
      this.voices = all;
      if (!this.voicesLoaded) {
        this.voicesLoaded = true;
        this.stopPolling();
      }
    }
  };

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Best available default voice — LOCAL voices first (network voices can
   * hang Chrome's TTS engine, the classic "no sound after a while" bug). */
  getDefaultVoice = (): SpeechSynthesisVoice | null => {
    if (!this.voices.length) this.refreshVoices();
    if (!this.voices.length) return null;
    const english = this.voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const pool = english.length ? english : this.voices;
    const local = pool.filter((v) => v.localService);
    const preferredLocal = [
      'samantha', 'karen', 'moira', 'tessa', 'serena', 'daniel', 'alex',
      'zira', 'hazel', 'george', 'susannah', 'aria',
    ];
    for (const name of preferredLocal) {
      const hit = local.find((v) => v.name.toLowerCase().includes(name));
      if (hit) return hit;
    }
    if (local.length) return local[0];
    // No local voices at all — fall back to named network voices, then any.
    const preferredAny = ['google us english', 'google uk english female', 'jenny', 'sonia'];
    for (const name of preferredAny) {
      const hit = pool.find((v) => v.name.toLowerCase().includes(name));
      if (hit) return hit;
    }
    return pool[0] ?? null;
  };

  /** First available LOCAL English voice (for hang fallback). */
  private getLocalFallbackVoice(): SpeechSynthesisVoice | null {
    if (!this.voices.length) this.refreshVoices();
    return (
      this.voices.find(
        (v) => v.localService && v.lang.toLowerCase().startsWith('en') &&
          !/novelty|albert|bahh|bells|boing|bubbles|cellos|zarvox|bad news|good news/i.test(v.name),
      ) ?? null
    );
  }

  resolveVoice = (voiceURI?: string): SpeechSynthesisVoice | null => {
    if (voiceURI) {
      if (!this.voices.length) this.refreshVoices();
      const hit = this.voices.find((v) => v.voiceURI === voiceURI);
      if (hit) return hit;
    }
    return this.getDefaultVoice();
  };

  cancel = (): void => {
    this.token.cancelled = true;
    this.token = { cancelled: false };
    this.chunks = [];
    this.currentChunkIdx = 0;
    this.currentWord = -1;
    this.pendingStart = false;
    this.liveUtterances.clear();
    this.clearStartTimer();
    this.clearWatchdog();
    this.stopKeepAlive();
    if (this.supported) this.hardReset();
    this.notify();
  };

  /**
   * Chrome's TTS can enter a "zombie" state: speaking===true forever, no
   * audio, no events — and cancel() alone doesn't clear it, so every new
   * utterance queues behind a corpse. The pause/resume/cancel cycle kicks
   * the TTS thread and actually drains the queue.
   */
  private hardReset(): void {
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      if (synth.speaking || synth.pending) {
        synth.pause();
        synth.resume();
        synth.cancel();
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Wait until the synthesis queue is genuinely empty. If Chrome reports
   * speaking/pending but nothing drains (zombie), apply hardReset kicks.
   */
  private drainQueue = async (): Promise<void> => {
    const synth = window.speechSynthesis;
    for (let kick = 0; kick <= DRAIN_MAX_KICKS; kick++) {
      const deadline = Date.now() + DRAIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (!synth.speaking && !synth.pending) return;
        await wait(40);
      }
      // Still busy after the wait — nothing is actually playing. Kick it.
      this.hardReset();
    }
  };

  pause = (): void => {
    if (this.supported) window.speechSynthesis.pause();
  };

  resume = (): void => {
    if (this.supported) window.speechSynthesis.resume();
  };

  /**
   * Speak text. Long text is split into sentence-ish chunks so Chrome's
   * ~15s utterance cutoff can never clip speech mid-way.
   */
  speak = (text: string, options: SpeakOptions = {}): void => {
    if (!this.supported || !text.trim()) {
      options.onEnd?.();
      return;
    }
    this.cancel();
    this.activeOptions = options;
    this.chunks = chunkText(text);
    this.currentChunkIdx = 0;
    this.currentWord = -1;
    this.pendingStart = true;
    const token = this.token;
    this.notify();

    // Never speak in the same tick as cancel() — and make sure the queue is
    // GENUINELY empty first. If Chrome is zombie-speaking, drainQueue kicks it.
    void this.drainQueue().then(() => {
      if (token.cancelled) return;
      this.speakCurrentChunk(token, 0);
    });
  };

  /** Index of the word currently being spoken (-1 when idle). */
  getCurrentWordIndex = (): number => this.currentWord;

  private clearStartTimer(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer !== null) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private trackUtterance(u: SpeechSynthesisUtterance): void {
    this.liveUtterances.add(u);
  }

  private untrackUtterance(u: SpeechSynthesisUtterance): void {
    this.liveUtterances.delete(u);
  }

  private speakCurrentChunk = (token: Token, attempt: number): void => {
    if (token.cancelled) return;
    const chunk = this.chunks[this.currentChunkIdx];
    if (!chunk) {
      this.finishSequence(token);
      return;
    }

    const synth = window.speechSynthesis;
    try {
      const u = new SpeechSynthesisUtterance(chunk.text);
      this.trackUtterance(u);

      const { voiceURI, rate = 1, pitch = 1, volume = 1, onWord, onStart, onError } = this.activeOptions;
      // Final-attempt strategy: speak with NO voice bound, only a lang tag.
      // If a specific voice's asset is missing/broken, the OS default voice
      // for the lang often still works.
      if (attempt >= 3) {
        u.lang = 'en-US';
      } else {
        const voice = this.resolveVoice(voiceURI);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
      }
      u.rate = clamp(rate, 0.1, 10);
      u.pitch = clamp(pitch, 0, 2);
      u.volume = clamp(volume, 0, 1);

      u.onstart = () => {
        if (token.cancelled) return;
        this.clearWatchdog();
        this.pendingStart = false;
        this.startKeepAlive(token);
        onStart?.();
        this.notify();
      };

      u.onboundary = (event: SpeechSynthesisEvent) => {
        if (token.cancelled || event.name !== 'word') return;
        // Map char offset within the chunk back to the global word index.
        const local = wordIndexAt(chunk.tokens, event.charIndex);
        if (local !== null) {
          this.currentWord = chunk.tokenOffset + local;
          onWord?.(this.currentWord);
          this.notify();
        }
      };

      u.onend = () => {
        this.untrackUtterance(u);
        if (token.cancelled) return;
        this.clearWatchdog();
        this.currentChunkIdx += 1;
        this.speakCurrentChunk(token, 0);
      };

      u.onerror = (event) => {
        this.untrackUtterance(u);
        if (token.cancelled) return;
        const errName = (event as SpeechSynthesisErrorEvent)?.error;
        // 'canceled'/'interrupted' fire when WE cancelled the chunk — expected,
        // never recover on them (they caused retry storms otherwise).
        if (errName === 'canceled' || errName === 'interrupted') return;
        this.recoverAndRetry(token, attempt + 1, onError);
      };

      synth.speak(u);

      // Watchdog: onstart is the only real proof audio is flowing. Chrome can
      // report speaking===true forever in the zombie state while no event ever
      // fires — so we judge by onstart alone, not by synth.speaking.
      let started = false;
      const origOnStart = u.onstart;
      u.onstart = (event) => {
        started = true;
        origOnStart?.call(u, event);
      };
      this.clearWatchdog();
      this.watchdogTimer = window.setTimeout(() => {
        this.watchdogTimer = null;
        if (token.cancelled || started) return;
        this.recoverAndRetry(token, attempt + 1, onError);
      }, WATCHDOG_MS + attempt * 400);
    } catch {
      this.currentChunkIdx += 1;
      this.speakCurrentChunk(token, 0);
    }
  };

  /**
   * The engine refused to start an utterance (wedge). Ladder:
   *  1. cancel + wait + retry
   *  2. cancel + silent dummy utterance to flush the queue + retry
   *  3. give up gracefully (advance, fire onError/onEnd)
   */
  private recoverAndRetry = async (
    token: Token,
    attempt: number,
    onError?: () => void,
  ): Promise<void> => {
    if (token.cancelled || this.recovering) return;
    this.recovering = true;
    this.stopKeepAlive();
    this.clearWatchdog();

    try {
      if (attempt > 4) {
        this.currentWord = -1;
        this.pendingStart = false;
        onError?.();
        this.finishSequence(token);
        return;
      }

      // Hard-reset (cancel + pause/resume kick) and make sure the queue truly
      // drains before retrying — a plain cancel() doesn't clear the zombie.
      this.hardReset();
      await this.drainQueue();
      if (token.cancelled) return;

      // Attempt 2: the current voice itself may be the hang (network voices
      // do this a lot) — force-switch to a local English voice.
      // Attempt 3+: speak with no bound voice at all, lang tag only.
      if (attempt === 2) {
        const local = this.getLocalFallbackVoice();
        if (local && this.activeOptions.voiceURI !== local.voiceURI) {
          this.activeOptions = { ...this.activeOptions, voiceURI: local.voiceURI };
        }
      }

      this.speakCurrentChunk(token, attempt);
    } finally {
      this.recovering = false;
    }
  };

  private finishSequence(token: Token): void {
    if (token.cancelled) return;
    this.currentWord = -1;
    this.pendingStart = false;
    this.stopKeepAlive();
    this.clearWatchdog();
    this.activeOptions.onEnd?.();
    this.notify();
  }

  private startKeepAlive(token: Token): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      if (token.cancelled) {
        this.stopKeepAlive();
        return;
      }
      // Chrome's ~15s cutoff guard: nudge the engine while it should be talking.
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    }, KEEPALIVE_MS);
  }

  /** Public hard-reset for the "Reset engine & retry" button. */
  resetEngine = (): void => {
    this.cancel();
    this.hardReset();
  };

  /**
   * Must be called from a user gesture (tap/click) once to unlock iOS audio.
   * Only run on iOS/iPadOS — on desktop Chrome this silent dummy is actively
   * harmful: cancelling it mid-flight can wedge the TTS engine.
   */
  unlockAudio = (): void => {
    if (!isIOS()) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  };
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
}

/** Split text into word tokens with their character offsets. */
function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ text: m[0], start: m.index });
  }
  return tokens;
}

/** Find which word a boundary charIndex belongs to. */
function wordIndexAt(tokens: WordToken[], charIndex: number): number | null {
  if (!tokens.length) return null;
  for (let i = 0; i < tokens.length; i++) {
    if (charIndex < tokens[i].start + tokens[i].text.length) {
      // Treat indexes inside whitespace gaps as pointing at the next word.
      return charIndex <= tokens[i].start ? Math.max(0, i - 1) : i;
    }
  }
  return tokens.length - 1;
}

/**
 * Split long text into chunks at sentence/clause boundaries,
 * never splitting a chunk mid-sentence when avoidable.
 */
function chunkText(text: string): Chunk[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferTokenOffset = 0;
  let wordCount = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      buffer = '';
      return;
    }
    const tokens = tokenize(trimmed);
    chunks.push({
      text: trimmed,
      tokens,
      tokenOffset: bufferTokenOffset,
    });
    wordCount += tokens.length;
    buffer = '';
  };

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > CHUNK_MAX_CHARS && buffer.trim()) {
      flush();
      bufferTokenOffset = wordCount;
    }
    buffer += sentence;
    // A single overly long sentence still needs splitting.
    while (buffer.length > CHUNK_MAX_CHARS) {
      const slice = buffer.slice(0, CHUNK_MAX_CHARS);
      const cut = Math.max(
        slice.lastIndexOf(', '),
        slice.lastIndexOf(' '),
        CHUNK_MAX_CHARS,
      );
      const head = buffer.slice(0, cut + 1);
      buffer = buffer.slice(cut + 1);
      const trimmed = head.trim();
      if (trimmed) {
        const tokens = tokenize(trimmed);
        chunks.push({ text: trimmed, tokens, tokenOffset: bufferTokenOffset });
        wordCount += tokens.length;
        bufferTokenOffset = wordCount;
      }
    }
  }
  flush();
  return chunks;
}

export const speech = new SpeechEngine();
