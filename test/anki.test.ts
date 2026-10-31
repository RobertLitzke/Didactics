import initSqlJs from 'sql.js';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardRow, crc32, toApkg } from '../src/anki';
import { addNote, answer, dayAfter, dayStart, emptyCollection, ensureDeck, Rating, suspend, type Collection } from '../src/srs';

const T0 = new Date(2026, 9, 27, 12, 0, 0).getTime();

/** The files in a stored (uncompressed) zip. */
function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, Uint8Array> = {};
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    out[name] = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    at += 30 + nameLen + size;
  }
  return out;
}

export function sample(): Collection {
  let col = ensureDeck(emptyCollection(T0), 'quiz', 'Course::Quiz', T0);
  col = ensureDeck(col, 'l3', 'Course::Lesson 3', T0);
  col = addNote(col, 'l3', { id: 'q1', front: 'Which <cloud> rains?', choices: ['Nimbostratus', 'Cirrus', 'Altocumulus'], answer: 0, extra: 'Thick & grey.', tags: ['lesson 3'] }, T0);
  col = addNote(col, 'l3', { id: 'q2', front: 'Learning one', choices: ['a', 'b'], answer: 1 }, T0 + 1);
  col = addNote(col, 'quiz', { id: 'q3', front: 'Front', back: 'Back', extra: 'More' }, T0 + 2);
  col = addNote(col, 'quiz', { id: 'q4', front: 'Suspended', back: 'x' }, T0 + 3);
  col = addNote(col, 'quiz', { id: 'q5', front: 'Lapsed', back: 'x' }, T0 + 4);
  col = answer(col, 'q1/0', Rating.Easy, T0);
  col = answer(col, 'q2/0', Rating.Good, T0);
  col = answer(col, 'q4/0', Rating.Easy, T0);
  col = suspend(col, 'q4/0', true, T0);
  col = answer(col, 'q5/0', Rating.Easy, T0);
  col = answer(col, 'q5/0', Rating.Again, col.cards['q5/0'].due + 3600_000);
  return col;
}

describe('anki', () => {
  it('computes zip checksums', () => {
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('writes a package Anki can read, with the cards where they are', async () => {
    const SQL = (await initSqlJs()) as { Database: new (data?: Uint8Array) => { exec: (s: string) => { values: unknown[][] }[] } };
    const col = sample();
    const now = T0 + 6 * 86400_000;
    const bytes = await toApkg(col, { now, media: { q1: { name: 'q1.svg', data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') } }, sourceLabel: () => 'Lesson 3' });
    if (process.env.APKG_OUT) writeFileSync(process.env.APKG_OUT, bytes);
    const files = unzip(bytes);
    expect(Object.keys(files).sort()).toEqual(['0', 'collection.anki2', 'media']);
    expect(JSON.parse(new TextDecoder().decode(files.media))).toEqual({ 0: 'q1.svg' });
    const db = new SQL.Database(files['collection.anki2']);
    const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];
    expect(rows('SELECT ver FROM col')[0][0]).toBe(11);
    expect(rows('PRAGMA integrity_check')).toEqual([['ok']]);
    const decks = JSON.parse(rows('SELECT decks FROM col')[0][0] as string) as Record<string, { name: string }>;
    expect(Object.values(decks).map((d) => d.name).sort()).toEqual(['Course', 'Course::Lesson 3', 'Course::Quiz', 'Default']);
    const notes = rows('SELECT guid, flds, tags FROM notes ORDER BY id');
    expect(notes).toHaveLength(5);
    const q1 = (notes[0][1] as string).split('\x1f');
    expect(q1[0]).toBe('Which &lt;cloud&gt; rains?');
    expect(q1[1]).toBe('<ol class="choices" type="A"><li>Nimbostratus</li><li>Cirrus</li><li>Altocumulus</li></ol>');
    expect(q1[2]).toBe('Nimbostratus');
    expect(q1[3]).toBe('Thick &amp; grey.');
    expect(q1[4]).toBe('<img src="q1.svg">');
    expect(notes[0][2]).toBe(' lesson_3 ');
    const cards = rows('SELECT type, queue, due, ivl, factor, reps, lapses, data FROM cards ORDER BY id');
    const crt = rows('SELECT crt FROM col')[0][0] as number;
    expect(crt * 1000).toBe(dayStart(T0));
    // q1: review, due on the day of its interval.
    expect(cards[0].slice(0, 2)).toEqual([2, 2]);
    expect(cards[0][2]).toBe(Math.round((col.cards['q1/0'].due - dayStart(T0)) / 86400_000));
    expect(JSON.parse(cards[0][7] as string)).toMatchObject({ s: expect.any(Number), d: expect.any(Number) });
    // q2: learning, due in epoch seconds.
    expect(cards[1].slice(0, 3)).toEqual([1, 1, Math.round(col.cards['q2/0'].due / 1000)]);
    // q3: new, by position.
    expect(cards[2].slice(0, 3)).toEqual([0, 0, 1]);
    // q4: a suspended review card.
    expect(cards[3].slice(0, 2)).toEqual([2, -1]);
    // q5: relearning, one lapse.
    expect(cards[4].slice(0, 2)).toEqual([3, 1]);
    expect(cards[4][6]).toBe(1);
    expect(rows('SELECT count(*) FROM revlog')[0][0]).toBe(col.revlog.length);
    expect(rows('SELECT ease, type FROM revlog ORDER BY id')[0]).toEqual([4, 0]);
  });

  it('encodes a review card due on a later day', () => {
    const col = sample();
    const c = { ...col.cards['q1/0'], due: dayAfter(T0, 10), interval: 10 };
    expect(cardRow(c, col, dayStart(T0), 0)).toMatchObject({ type: 2, queue: 2, due: 10, ivl: 10 });
  });
});
