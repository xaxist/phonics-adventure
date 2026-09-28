# Phonics Adventure

A playful, offline-capable learn-to-read PWA built with React + TypeScript + Vite.
261 lessons across 7 themed worlds, a Web Speech voice engine, word-match quizzes,
stars, and celebrations.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/phonics/
```

## Build & checks

```bash
npm run build      # typecheck (tsc -b) + production build with PWA service worker
npm run lint
node test.js       # Puppeteer smoke test (expects dev server on :5173)
```

## Features

- **Home** — mascot hero, "Continue where you left off", star total, world cards with progress rings
- **Worlds** — Short Vowel Valley, Blend Beach, Digraph Desert, Magic E Mountain, Vowel Team Tropics, R-Controlled River, Multi-Syllable Meadow
- **Lesson stepper** — Learn (rule + pronunciation) → Words (tap-to-hear cards, slow replay) → Sentences (karaoke word highlighting, swipe/arrow/space controls) → Quiz
- **Word Match quiz** — hear a word, pick it from 4 same-letter options; 1–3 stars per lesson
- **Quiz Arcade** (`#/practice`) — three word games drawn from every word the child
  has already learned: **Word Match** (hear it, pick it), **First Sound** (which word
  starts with the same sound?) and **Spell It** (tap the shuffled letter tiles in
  order). Mixed decks of 8 rounds, a streak flame, 1–3 stars per game and a
  best-streak / games-played store (`phonics_arcade_v1`)
- **Celebration** — confetti, animated stars, next-lesson chaining
- **Voice engine** (`src/speech/engine.ts`) — reliable voice loading, chunked utterances (no Chrome 15s cutoff), accurate word-boundary events, iOS audio unlock
- **Settings** — all English voices (search, offline/online badges, preview), speed presets + slider, pitch, volume, sound effects, auto-read words, reset progress
- **Sound Cards** (ages 2–4) — all 44 phonemes as full-screen cards in Jolly Phonics
  teaching order: giant Capital+small letter pair, keyword emoji, tap-to-hear,
  turtle slow replay, swipe/arrows, 8 group dots; tap counts persist and each
  sound earns an "explored" star after 5 taps. The phoneme itself is *synthesized*
  with Web Audio DSP (`src/speech/phonemeSynth.ts` — formant vowels, filtered-noise
  fricatives, burst stops) so /s/ is a true "sss" rather than TTS letter-spelling,
  then the keyword word is spoken via TTS (with a respelling fallback)
- **Hash routing** (`#/world/2`, `#/lesson/x`, `#/sounds`) so browser back/forward work
- **PWA** — installable, works offline, custom owl mascot + hand-drawn SVG worlds

## Structure

```
src/
  components/        # screens (Home, WorldPath, LessonView, Quiz, PracticeArcade, SoundCards, SettingsSheet)
    ui/              # primitives (Button, Modal, Toggle, Slider, ProgressRing, ConfirmDialog)
  speech/            # engine.ts (TTS wrapper), sfx.ts (Web Audio effects)
  state/             # settings.ts, progress.ts, soundProgress.ts, arcade.ts (versioned localStorage stores)
  hooks/             # useSpeech, useHashRoute
  utils/             # quiz builders, rule parsing, pronunciation fixes
  database.json      # 7 worlds / 261 lessons content
public/
  mascot.svg         # owl mascot (also the favicon)
  worlds/world-*.svg # world illustrations
```
