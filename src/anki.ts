// A collection (srs.ts) as an Anki package (.apkg): Anki opens it with File >
// Import, and with "Import any learning progress" ticked the cards keep where
// they are: new, learning or review, their intervals, ease, lapses, due dates,
// FSRS memory, and the whole review log. Notes keep a guid from their id, so
// exporting again later and importing over the first import updates the same
// notes rather than adding copies.
//
// An .apkg is a zip of an SQLite database in Anki's long-standing schema 11
// (collection.anki2) and the media files, numbered, with a "media" file naming
// them. The database file is written by sqlite.ts.

import { sqliteFile, type SqlIndex, type SqlTable, type SqlValue } from './sqlite';
import { configOf, dayStart, DAY, type Card, type Collection, type Deck, type Note } from './srs';

/** A file to go in the package, such as a note's picture. */
export interface MediaFile {
  name: string;
  data: Uint8Array;
}

export interface ApkgOptions {
  now?: number;
  /** Each note's picture, by note id: shown above its question. */
  media?: Readonly<Record<string, MediaFile>>;
  /** A note's words as HTML. Default: the words, escaped. */
  html?: (text: string) => string;
  /** Where each note came from, in words, for the Source field ("Lesson 3, check"). */
  sourceLabel?: (note: Note) => string;
}

// ---- Anki's schema 11 -----------------------------------------------------------------

const TABLES = {
  col: 'CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null)',
  notes: 'CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null)',
  cards: 'CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null)',
  revlog: 'CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null)',
  graves: 'CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null)',
};

/** Anki's indexes, by table and column positions. */
const INDEXES: SqlIndex[] = [
  { name: 'ix_notes_usn', table: 'notes', sql: 'CREATE INDEX ix_notes_usn on notes (usn)', columns: [4] },
  { name: 'ix_cards_usn', table: 'cards', sql: 'CREATE INDEX ix_cards_usn on cards (usn)', columns: [5] },
  { name: 'ix_revlog_usn', table: 'revlog', sql: 'CREATE INDEX ix_revlog_usn on revlog (usn)', columns: [2] },
  { name: 'ix_cards_nid', table: 'cards', sql: 'CREATE INDEX ix_cards_nid on cards (nid)', columns: [1] },
  { name: 'ix_cards_sched', table: 'cards', sql: 'CREATE INDEX ix_cards_sched on cards (did, queue, due)', columns: [2, 7, 8] },
  { name: 'ix_revlog_cid', table: 'revlog', sql: 'CREATE INDEX ix_revlog_cid on revlog (cid)', columns: [1] },
  { name: 'ix_notes_csum', table: 'notes', sql: 'CREATE INDEX ix_notes_csum on notes (csum)', columns: [8] },
];

/** The note types, with fixed ids so a second export matches the first. */
export const CHOICE_MODEL_ID = 1761955200001;
export const BASIC_MODEL_ID = 1761955200002;

const CSS = `.card { font-family: system-ui, sans-serif; font-size: 20px; text-align: left; color: #222; background: #fff; max-width: 40em; margin: 0 auto; }
.picture img { max-width: 100%; max-height: 50vh; display: block; margin: 0 auto 0.6em; }
.question { font-weight: 600; margin-bottom: 0.5em; }
.choices { padding-left: 1.6em; }
.choices li { margin: 0.2em 0; }
.answer { font-weight: 700; color: #1a7f37; }
.why { margin-top: 0.6em; color: #444; }
.source { margin-top: 1em; font-size: 0.7em; color: #888; }
.nightMode .card, .card.nightMode { color: #eee; background: #222; }
.nightMode .why { color: #ccc; }`;

function field(name: string, ord: number) {
  return { name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] };
}

function model(id: number, name: string, fields: string[], qfmt: string, afmt: string, mod: number) {
  return {
    id, name, type: 0, mod, usn: -1, sortf: 0, did: 1, tags: [], vers: [],
    flds: fields.map(field),
    tmpls: [{ name: 'Card 1', ord: 0, qfmt, afmt, bqfmt: '', bafmt: '', did: null }],
    css: CSS,
    latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    latexsvg: false,
    req: [[0, 'any', [0]]],
  };
}

const CHOICE_FIELDS = ['Question', 'Choices', 'Answer', 'Why', 'Picture', 'Source'];
const BASIC_FIELDS = ['Front', 'Back', 'Why', 'Picture', 'Source'];
const PICTURE = '{{#Picture}}<div class="picture">{{Picture}}</div>{{/Picture}}';
const AFTER = '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}{{#Source}}<div class="source">{{Source}}</div>{{/Source}}';

function models(mod: number) {
  return {
    [CHOICE_MODEL_ID]: model(CHOICE_MODEL_ID, 'Didactics multiple choice', CHOICE_FIELDS,
      `${PICTURE}<div class="question">{{Question}}</div>{{Choices}}`,
      `{{FrontSide}}<hr id="answer"><div class="answer">{{Answer}}</div>${AFTER}`, mod),
    [BASIC_MODEL_ID]: model(BASIC_MODEL_ID, 'Didactics basic', BASIC_FIELDS,
      `${PICTURE}<div class="question">{{Front}}</div>`,
      `{{FrontSide}}<hr id="answer"><div class="answer">{{Back}}</div>${AFTER}`, mod),
  };
}

function deckJson(id: number, name: string, mod: number, desc = '') {
  return {
    id, name, desc, mod, usn: -1, conf: 1, dyn: 0, collapsed: false, browserCollapsed: false,
    extendNew: 0, extendRev: 0, newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0],
  };
}

function dconf(col: Collection) {
  const c = configOf(col);
  return {
    1: {
      id: 1, name: 'Default', mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true, dyn: false,
      new: { bury: false, delays: c.learnSteps, initialFactor: Math.round(c.startingEase * 1000), ints: [c.graduatingInterval, c.easyInterval, 0], order: 1, perDay: c.newPerDay, separate: true },
      lapse: { delays: c.relearnSteps, leechAction: 1, leechFails: c.leech, minInt: c.minimumInterval, mult: c.lapseInterval },
      rev: { bury: false, ease4: c.easyBonus, fuzz: 0.05, ivlFct: c.intervalModifier, maxIvl: c.maximumInterval, minSpace: 1, perDay: c.reviewsPerDay, hardFactor: c.hardInterval },
      desiredRetention: c.retention,
    },
  };
}

// ---- Rows -----------------------------------------------------------------------------

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

/** Anki's note checksum: the first 8 hex digits of the SHA-1 of the sort field, as a number. */
async function checksum(text: string): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(stripHtml(text)));
  const b = new Uint8Array(digest);
  return ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
}

/** Ids for Anki: whole numbers from the given times, in order, none twice. */
function numbered<T>(items: readonly T[], time: (x: T) => number, key: (x: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  let last = 0;
  for (const x of [...items].sort((a, b) => time(a) - time(b) || key(a).localeCompare(key(b)))) {
    last = Math.max(Math.floor(time(x)), last + 1);
    out.set(key(x), last);
  }
  return out;
}

const TYPE = { new: 0, learning: 1, review: 2, relearning: 3 } as const;
const LOG_TYPE = { new: 0, learning: 0, review: 1, relearning: 2 } as const;

/** A card's cards row: type, queue, due, ivl, factor, left and data, in Anki's encoding. */
export function cardRow(c: Card, col: Collection, crt: number, position: number): { type: number; queue: number; due: number; ivl: number; factor: number; left: number; data: string } {
  const cfg = configOf(col);
  const type = TYPE[c.type];
  const queue = c.queue === 'suspended' ? -1 : c.queue === 'buried' ? -3 : type === 3 ? 1 : type;
  let due: number;
  if (c.type === 'new') due = position;
  else if (c.type === 'review') due = Math.round((c.due - crt) / DAY);
  else due = Math.round(c.due / 1000);
  const steps = c.type === 'relearning' ? cfg.relearnSteps : cfg.learnSteps;
  const remaining = Math.max(1, steps.length - c.step);
  const left = c.type === 'learning' || c.type === 'relearning' ? remaining * 1000 + remaining : 0;
  const data = c.stability !== undefined && c.difficulty !== undefined && c.type !== 'new'
    ? JSON.stringify({ s: round(c.stability, 4), d: round(c.difficulty, 3), dr: cfg.retention, ...(c.lastReview !== undefined ? { lrt: Math.floor(c.lastReview / 1000) } : {}) })
    : '';
  return {
    type,
    queue,
    due,
    ivl: c.type === 'review' || c.type === 'relearning' ? Math.max(1, Math.round(c.interval)) : 0,
    factor: c.type === 'new' ? 0 : Math.round((c.ease || cfg.startingEase) * 1000),
    left,
    data,
  };
}

const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places;

/** An interval in the review log's encoding: days, or negative seconds while learning. */
const logInterval = (days: number) => (days >= 1 ? Math.round(days) : -Math.max(1, Math.round(days * 86400)));

/** The collection as an .apkg file's bytes. */
export async function toApkg(col: Collection, o: ApkgOptions = {}): Promise<Uint8Array> {
  const now = o.now ?? Date.now();
  const html = o.html ?? escapeHtml;
  const secs = Math.floor(now / 1000);
  const crt = dayStart(Math.min(col.created, now), configOf(col).rollover);
  const rows: Record<keyof typeof TABLES, SqlValue[][]> = { col: [], notes: [], cards: [], revlog: [], graves: [] };
  {

    // Decks, with every parent a name implies ("A::B" needs "A").
    const decks = new Map<string, Deck>(Object.values(col.decks).map((d) => [d.name, d]));
    for (const d of [...decks.values()]) {
      const parts = d.name.split('::');
      for (let i = 1; i < parts.length; i++) {
        const name = parts.slice(0, i).join('::');
        if (!decks.has(name)) decks.set(name, { id: `parent:${name}`, name, created: d.created - 1 });
      }
    }
    const deckIds = numbered([...decks.values()], (d) => Math.max(d.created, 2), (d) => d.id);
    const decksJson: Record<string, unknown> = { 1: deckJson(1, 'Default', secs) };
    for (const d of decks.values()) decksJson[deckIds.get(d.id)!] = deckJson(deckIds.get(d.id)!, d.name, secs, d.description ?? '');

    const notes = Object.values(col.notes);
    const noteIds = numbered(notes, (n) => n.created, (n) => n.id);
    const cards = Object.values(col.cards).filter((c) => col.notes[c.note]);
    const cardIds = numbered(cards, (c) => c.created, (c) => c.id);

    // Media: numbered files in the zip, named in the "media" file.
    const files: MediaFile[] = [];
    const pictureOf = new Map<string, string>();
    const names = new Set<string>();
    for (const n of notes) {
      const m = o.media?.[n.id];
      if (!m) continue;
      if (!names.has(m.name)) {
        names.add(m.name);
        files.push(m);
      }
      pictureOf.set(n.id, `<img src="${escapeHtml(m.name)}">`);
    }

    rows.col.push([
      1, Math.floor(crt / 1000), now, now, 11, 0, 0, 0,
      JSON.stringify({ activeDecks: [1], curDeck: 1, newSpread: 0, collapseTime: 1200, timeLim: 0, estTimes: true, dueCounts: true, curModel: CHOICE_MODEL_ID, nextPos: cards.length + 1, sortType: 'noteFld', sortBackwards: false, addToCur: true }),
      JSON.stringify(models(secs)),
      JSON.stringify(decksJson),
      JSON.stringify(dconf(col)),
      '{}',
    ]);

    for (const n of notes) {
      const source = o.sourceLabel?.(n) ?? '';
      const picture = pictureOf.get(n.id) ?? '';
      const why = n.extra ? html(n.extra) : '';
      const fields = n.model === 'choice'
        ? [html(n.front), `<ol class="choices" type="A">${(n.choices ?? []).map((c) => `<li>${html(c)}</li>`).join('')}</ol>`, html(n.back), why, picture, escapeHtml(source)]
        : [html(n.front), html(n.back), why, picture, escapeHtml(source)];
      const tags = n.tags.map((t) => t.replace(/\s+/g, '_')).filter(Boolean);
      rows.notes.push([
        noteIds.get(n.id)!, n.guid, n.model === 'choice' ? CHOICE_MODEL_ID : BASIC_MODEL_ID, Math.floor(n.modified / 1000), -1,
        tags.length ? ` ${tags.join(' ')} ` : '', fields.join('\x1f'), stripHtml(fields[0]), await checksum(fields[0]), 0, '',
      ]);
    }

    let position = 0;
    for (const c of [...cards].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
      const r = cardRow(c, col, crt, c.type === 'new' ? ++position : 0);
      const deck = col.decks[c.deck];
      rows.cards.push([
        cardIds.get(c.id)!, noteIds.get(c.note)!, deck ? deckIds.get(deck.id)! : 1, c.ord, Math.floor(c.modified / 1000), -1,
        r.type, r.queue, r.due, r.ivl, r.factor, c.reps, c.lapses, r.left, 0, 0, 0, r.data,
      ]);
    }

    for (const l of col.revlog) {
      const cid = cardIds.get(l.card);
      if (!cid) continue;
      rows.revlog.push([
        l.id, cid, -1, l.rating, logInterval(l.interval), logInterval(l.lastInterval), Math.round(l.ease * 1000), l.took, LOG_TYPE[l.type],
      ]);
    }

    const media: Record<string, string> = {};
    const tables: SqlTable[] = (Object.keys(TABLES) as (keyof typeof TABLES)[]).map((name) => ({ name, sql: TABLES[name], rows: rows[name], ...(name === 'graves' ? {} : { rowid: 0 }) }));
    const entries: { name: string; data: Uint8Array }[] = [{ name: 'collection.anki2', data: sqliteFile(tables, INDEXES) }];
    files.forEach((f, i) => {
      media[String(i)] = f.name;
      entries.push({ name: String(i), data: f.data });
    });
    entries.push({ name: 'media', data: new TextEncoder().encode(JSON.stringify(media)) });
    return zip(entries, now);
  }
}

// ---- Zip ------------------------------------------------------------------------------

let crcTable: Uint32Array | undefined;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip of the files, stored without compression (Anki reads it either way). */
export function zip(files: readonly { name: string; data: Uint8Array }[], now: number = Date.now()): Uint8Array {
  const d = new Date(now);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const size = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, size, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
