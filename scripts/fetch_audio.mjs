/**
 * Fetches real human phoneme recordings from Wikimedia Commons (freely
 * licensed — see ATTRIBUTIONS.md) and builds the app's audio files.
 *
 * Strategy:
 *  1. Resolve unit-file URLs via the Commons API in batches (1 call per 40).
 *  2. Download each unit from upload.wikimedia.org with pacing + 429 backoff.
 *  3. ffmpeg-concatenate units into composite sounds (qu = k+w, ai = e+i, …).
 *
 * Usage: bun scripts/fetch_audio.mjs
 */
import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT_DIR = 'public/phonemes';
const TMP = '/tmp/phoneme-units';
const TMP_TRIM = '/tmp/phoneme-units-trim';
const UA = 'PhonicsAdventure/1.0 (educational app; local dev)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Unit recordings — exact Commons titles, with fallback candidates. */
const UNITS = {
  b: ['B voiced retroflex stop.ogg', 'Voiced bilabial plosive.ogg'],
  d: ['Voiced alveolar stop.ogg', 'Voiced alveolar plosive.ogg'],
  f: ['Voiceless labiodental fricative.ogg'],
  g: ['Voiced velar stop.ogg', 'Voiced velar plosive.ogg'],
  h: ['Voiceless glottal fricative.ogg'],
  j: ['Voiced palato-alveolar affricate.ogg'],
  k: ['Voiceless velar stop.ogg', 'Voiceless velar plosive.ogg'],
  l: ['Alveolar lateral approximant.ogg'],
  m: ['Bilabial nasal.ogg'],
  n: ['Alveolar nasal.ogg'],
  p: ['Voiceless bilabial plosive.ogg', 'Voiceless bilabial stop.ogg'],
  r: ['Alveolar approximant.ogg'],
  s: ['Voiceless alveolar sibilant.ogg', 'Voiceless alveolar fricative.ogg'],
  t: ['Voiceless alveolar stop.ogg', 'Voiceless alveolar plosive.ogg'],
  v: ['Voiced labiodental fricative.ogg'],
  w: ['Labio-velar approximant.ogg', 'Voiced labio-velar approximant.ogg'],
  z: ['Voiced alveolar sibilant.ogg', 'Voiced alveolar fricative.ogg'],
  ng: ['Velar nasal.ogg'],
  ch: ['Voiceless palato-alveolar affricate.ogg'],
  sh: ['Voiceless palato-alveolar sibilant.ogg', 'Voiceless postalveolar fricative.ogg'],
  th: ['Voiceless dental fricative.ogg'],
  dh: ['Voiced dental fricative.ogg'],
  hw: ['Voiceless labialized palato-alveolar fricative.ogg', 'Voiceless palatal fricative.ogg'],
  a: ['Open front unrounded vowel.ogg'],
  ae: ['Near-open front unrounded vowel.ogg'],
  e: ['Close-mid front unrounded vowel.ogg'],
  eh: ['Open-mid front unrounded vowel.ogg'],
  ih: ['Near-close near-front unrounded vowel.ogg'],
  i: ['Close front unrounded vowel.ogg'],
  o: ['Open back rounded vowel.ogg'],
  omid: ['Close-mid back rounded vowel.ogg'],
  aw: ['Open-mid back rounded vowel.ogg'],
  uh2: ['Near-close near-back rounded vowel.ogg'],
  u2: ['Open-mid back unrounded vowel.ogg'],
  u: ['Close back rounded vowel.ogg'],
  er: ['R-colored vowel, central.ogg', 'Mid central vowel.ogg'],
  schwa: ['Mid central vowel.ogg'],
  ah: ['Open back unrounded vowel.ogg'],
};

/**
 * Unit → attribution metadata for the file actually used (the FIRST candidate
 * that exists on Commons — resolveUrls only returns pages that exist).
 * Licenses: P = public domain / CC0, C = CC BY, CS = CC BY-SA.
 */
const ATTRS = {
  b: ['B voiced retroflex stop.ogg', 'Peter Isota', 'P'],
  d: ['Voiced alveolar stop.ogg', 'Peter Isota', 'P'],
  f: ['Voiceless labiodental fricative.ogg', 'Peter Isota', 'P'],
  g: ['Voiced velar stop.ogg', 'Peter Isota', 'P'],
  h: ['Voiceless glottal fricative.ogg', 'Peter Isota', 'P'],
  j: ['Voiced palato-alveolar affricate.ogg', 'Peter Isota', 'P'],
  k: ['Voiceless velar stop.ogg', 'Peter Isota', 'P'],
  l: ['Alveolar lateral approximant.ogg', 'Peter Isota', 'P'],
  m: ['Bilabial nasal.ogg', 'Peter Isota', 'P'],
  n: ['Alveolar nasal.ogg', 'Peter Isota', 'P'],
  p: ['Voiceless bilabial plosive.ogg', 'Peter Isota', 'P'],
  r: ['Alveolar approximant.ogg', 'Peter Isota', 'P'],
  s: ['Voiceless alveolar sibilant.ogg', 'Peter Isota', 'P'],
  t: ['Voiceless alveolar stop.ogg', 'Peter Isota', 'P'],
  v: ['Voiced labiodental fricative.ogg', 'Peter Isota', 'P'],
  w: ['Labio-velar approximant.ogg', 'Peter Isota', 'P'],
  y: ['Close front unrounded vowel.ogg', 'Peter Isota', 'P'],
  z: ['Voiced alveolar sibilant.ogg', 'Peter Isota', 'P'],
  ng: ['Velar nasal.ogg', 'Peter Isota', 'P'],
  ch: ['Voiceless palato-alveolar affricate.ogg', 'Peter Isota', 'P'],
  sh: ['Voiceless palato-alveolar sibilant.ogg', 'Peter Isota', 'P'],
  th: ['Voiceless dental fricative.ogg', 'Peter Isota', 'P'],
  dh: ['Voiced dental fricative.ogg', 'Peter Isota', 'P'],
  hw: ['Voiceless labialized palato-alveolar fricative.ogg', 'Peter Isota', 'P'],
  a: ['Open front unrounded vowel.ogg', 'Peter Isota', 'P'],
  ae: ['Near-open front unrounded vowel.ogg', 'Peter Isota', 'P'],
  e: ['Close-mid front unrounded vowel.ogg', 'Peter Isota', 'P'],
  eh: ['Open-mid front unrounded vowel.ogg', 'Peter Isota', 'P'],
  ih: ['Near-close near-front unrounded vowel.ogg', 'Peter Isota', 'P'],
  i: ['Close front unrounded vowel.ogg', 'Peter Isota', 'P'],
  o: ['Open back rounded vowel.ogg', 'Peter Isota', 'P'],
  omid: ['Close-mid back rounded vowel.ogg', 'Peter Isota', 'P'],
  aw: ['Open-mid back rounded vowel.ogg', 'Peter Isota', 'P'],
  uh2: ['Near-close near-back rounded vowel.ogg', 'Peter Isota', 'P'],
  u2: ['Open-mid back unrounded vowel.ogg', 'Peter Isota', 'P'],
  u: ['Close back rounded vowel.ogg', 'Peter Isota', 'P'],
  er: ['R-colored vowel, central.ogg', 'Peter Isota', 'P'],
  schwa: ['Mid central vowel.ogg', 'Peter Isota', 'P'],
  ah: ['Open back unrounded vowel.ogg', 'Peter Isota', 'P'],
};

/** Build public/phonemes/attribution.json from the units that were used. */
function writeAttributions(builtNames) {
  const sounds = builtNames.map((name) => ({
    file: `${name}.m4a`,
    units: (COMPOSITES[name] ?? []).map((u) => ({
      file: ATTRS[u]?.[0] ?? u,
      author: ATTRS[u]?.[1] ?? 'see Wikimedia Commons file page',
      license: ATTRS[u]?.[2] === 'P' ? 'Public domain / CC0' : 'CC BY-SA 4.0',
      source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(ATTRS[u]?.[0] ?? u)}`,
    })),
  }));
  writeFileSync(
    `${OUT_DIR}/attribution.json`,
    JSON.stringify(
      {
        project: 'Phonics Adventure — phoneme recordings',
        note: 'Real human phoneme recordings from Wikimedia Commons, concatenated with ffmpeg into the final sounds. Public domain / CC0. Each unit keeps its source file below.',
        sounds,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote ${OUT_DIR}/attribution.json (${sounds.length} sounds).`);
}

/** Final sound file → sequence of units to concatenate. */
const COMPOSITES = {
  // Consonants (single units)
  b: ['b'], d: ['d'], f: ['f'], g: ['g'], h: ['h'], j: ['j'], k: ['k'],
  l: ['l'], m: ['m'], n: ['n'], p: ['p'], r: ['r'], s: ['s'], t: ['t'],
  v: ['v'], z: ['z'], ng: ['ng'], ch: ['ch'], sh: ['sh'],
  th: ['th'], 'th-voiced': ['dh'], wh: ['hw'],
  // Consonants built from units
  qu: ['k', 'w'], x: ['k', 's'], y: ['i'], w: ['w'],
  // Short vowels
  a: ['ae'], e: ['eh'], i: ['ih'], o: ['o'], u: ['u2'],
  // Long vowels
  ai: ['e', 'i'], ee: ['i'], igh: ['a', 'i'], oa: ['omid', 'uh2'],
  oo: ['u'], yoo: ['i', 'u'],
  // Schwa
  schwa: ['schwa'],
  // Vowels with r
  air: ['ae', 'r'], ar: ['ah', 'r'], eer: ['i', 'r'], er: ['er'],
  or: ['aw', 'r'], ure: ['uh2', 'r'],
  // Diphthongs & other
  aw2: ['aw'], ow: ['a', 'uh2'], oi: ['aw', 'ih'], book: ['uh2'],
};

async function resolveUrls(titles) {
  const urlByTitle = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const api =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
      `&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(batch.map((t) => 'File:' + t).join('|'))}`;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(api, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const json = await res.json();
        for (const page of json.query?.pages ?? []) {
          if (page.imageinfo?.[0]?.url && !page.missing) {
            urlByTitle.set(page.title.replace(/^File:/, ''), page.imageinfo[0].url);
          }
        }
        break;
      }
      console.log(`  API ${res.status}, retry ${attempt}…`);
      await sleep(attempt * 6000);
    }
    await sleep(2000);
  }
  return urlByTitle;
}

async function download(url, out) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(out, buf);
      return true;
    }
    if (res.status === 429) {
      console.log(`  429 — backing off ${attempt * 15}s`);
      await sleep(attempt * 15000);
    } else {
      console.log(`  HTTP ${res.status}`);
      await sleep(4000);
    }
  }
  return false;
}

/**
 * Trim + normalize a raw unit into a clean mono WAV: strips the dead air
 * around the spoken phoneme (Commons units carry seconds of silence), evens
 * loudness across units, and adds a small tail pad so chained sounds get a
 * natural gap.
 */
function trimUnit(unit) {
  const out = `${TMP_TRIM}/${unit}.wav`;
  if (existsSync(out)) return out;
  const ok = ffmpeg([
    '-i', `${TMP}/${unit}.ogg`,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.02,' +
    'areverse,' +
    'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.02,' +
    'areverse,' +
    'speechnorm=e=3:r=0.00005:l=1,' +
    'afade=t=in:st=0:d=0.008,' +
    'apad=pad_dur=0.03',
    '-ar', '44100', '-ac', '1', out,
  ]);
  if (!ok) return null;
  return keepFirstUtterance(out);
}

/**
 * The Commons unit recordings repeat the phoneme 2–3 times with gaps
 * ("k… k… k"). A flashcard needs ONE clean utterance — cut everything
 * after the first long silence.
 */
function keepFirstUtterance(file) {
  const probe = spawnSync(
    'ffmpeg',
    ['-i', file, '-af', 'silencedetect=noise=-38dB:d=0.14', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const match = /silence_start: ([\d.]+)/.exec(probe.stderr ?? '');
  if (!match) return file; // single utterance already
  const cut = Number(match[1]);
  if (cut < 0.15) return file; // degenerate — keep whole file
  const tmp2 = `${file}.cut.wav`;
  const ok = ffmpeg([
    '-i', file,
    '-t', String(cut + 0.01),
    '-af', `afade=t=out:st=${Math.max(0, cut - 0.05)}:d=0.05,apad=pad_dur=0.04`,
    tmp2,
  ]);
  if (!ok) return file;
  renameSync(tmp2, file);
  return file;
}

function ffmpeg(args) {
  return spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }).status === 0;
}

// ——— main ———
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP, { recursive: true });

// Pick the first existing candidate per unit.
const wanted = [];
for (const [unit, candidates] of Object.entries(UNITS)) {
  if (existsSync(`${TMP}/${unit}.ogg`)) continue;
  wanted.push([unit, candidates]);
}
const allTitles = wanted.flatMap(([, cands]) => cands);
console.log(`Resolving ${allTitles.length} candidate titles…`);
const urls = await resolveUrls(allTitles);

const missing = [];
for (const [unit, candidates] of wanted) {
  const hit = candidates.find((c) => urls.has(c));
  if (!hit) { missing.push(unit); continue; }
  const raw = `${TMP}/${unit}.ogg`;
  process.stdout.write(`↓ ${unit}  (${hit}) `);
  if (await download(urls.get(hit), raw)) console.log('ok');
  else { console.log('FAILED'); missing.push(unit); }
  await sleep(2500);
}
if (missing.length) console.log(`MISSING UNITS: ${missing.join(', ')}`);

// Trim + normalize every unit needed by a composite.
mkdirSync(TMP_TRIM, { recursive: true });
const neededUnits = [...new Set(Object.values(COMPOSITES).flat())];
const trimFailed = [];
for (const u of neededUnits) {
  if (!existsSync(`${TMP}/${u}.ogg`)) continue; // missing download — already reported
  if (!trimUnit(u)) trimFailed.push(u);
}
if (trimFailed.length) console.log(`TRIM FAILED: ${trimFailed.join(', ')}`);

// Build composites.
let built = 0, failed = [];
const builtNames = [];
for (const [name, seq] of Object.entries(COMPOSITES)) {
  const out = `${OUT_DIR}/${name}.m4a`;
  if (existsSync(out)) { built++; builtNames.push(name); continue; }
  const parts = seq.map((u) => `${TMP_TRIM}/${u}.wav`);
  if (parts.some((p) => !existsSync(p))) { failed.push(name); continue; }
  const inputs = parts.flatMap((p) => ['-i', p]);
  const fc = `${seq.map((_, i) => `[${i}:a]`).join('')}concat=n=${seq.length}:v=0:a=1[a]`;
  if (ffmpeg([...inputs, '-filter_complex', fc, '-map', '[a]', '-c:a', 'aac', '-b:a', '96k', out])) {
    built++;
    builtNames.push(name);
  } else failed.push(name);
}
console.log(`Built ${built}/${Object.keys(COMPOSITES).length} sounds.`);
if (failed.length) console.log(`FAILED BUILDS: ${failed.join(', ')}`);
if (builtNames.length) writeAttributions(builtNames);
rmSync('/tmp/phoneme-raw', { recursive: true, force: true });
