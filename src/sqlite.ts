// A small SQLite file writer: tables (and their indexes) of rows in, the bytes
// of a database file out, in SQLite's own file format
// (https://www.sqlite.org/fileformat.html). It writes, it never reads or
// updates, which keeps it to a page of code: each table's rows are sorted by
// rowid and packed into leaf pages, interior pages are built above them, and
// sqlite_master names them all. An Anki package is such a file (anki.ts), and
// this saves a megabyte of SQLite compiled to WebAssembly in every course.

export type SqlValue = null | number | string | Uint8Array;

export interface SqlTable {
  name: string;
  /** Its CREATE TABLE statement, kept in sqlite_master as SQLite would. */
  sql: string;
  /** Its rows, each the table's columns in order. */
  rows: readonly SqlValue[][];
  /**
   * The column that is the rowid ("id integer primary key"), stored as NULL
   * in the row as SQLite does. Without one, rows are numbered from 1.
   */
  rowid?: number;
}

export interface SqlIndex {
  name: string;
  table: string;
  /** Its CREATE INDEX statement. */
  sql: string;
  /** The indexed columns, by position in the table. */
  columns: number[];
}

const PAGE = 4096;
/** Usable bytes in a page (no reserved space). */
const U = PAGE;

const enc = new TextEncoder();

/** SQLite's variable-length integer: 7 bits a byte, big-endian, the ninth byte whole. */
export function varint(n: number): number[] {
  let v = BigInt(n);
  if (v < 0n) v += 1n << 64n;
  if (v > 0x00ffffffffffffffn) {
    const out = [Number(v & 0xffn)];
    v >>= 8n;
    for (let i = 0; i < 8; i++) {
      out.unshift(Number(v & 0x7fn) | 0x80);
      v >>= 7n;
    }
    return out;
  }
  const out = [Number(v & 0x7fn)];
  v >>= 7n;
  while (v > 0n) {
    out.unshift(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  return out;
}

/** A row as a record: a header of serial types, then the values. */
export function record(values: readonly SqlValue[]): Uint8Array {
  const types: number[] = [];
  const body: number[][] = [];
  for (const v of values) {
    if (v === null) {
      types.push(0);
      body.push([]);
    } else if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) {
      if (v === 0) types.push(8), body.push([]);
      else if (v === 1) types.push(9), body.push([]);
      else {
        const [t, n] = v >= -128 && v < 128 ? [1, 1] : v >= -32768 && v < 32768 ? [2, 2] : v >= -8388608 && v < 8388608 ? [3, 3] : v >= -2147483648 && v < 2147483648 ? [4, 4] : v >= -(2 ** 47) && v < 2 ** 47 ? [5, 6] : [6, 8];
        types.push(t);
        let b = BigInt(v);
        if (b < 0n) b += 1n << BigInt(n * 8);
        const bytes: number[] = [];
        for (let i = 0; i < n; i++) {
          bytes.unshift(Number(b & 0xffn));
          b >>= 8n;
        }
        body.push(bytes);
      }
    } else if (typeof v === 'number') {
      types.push(7);
      const dv = new DataView(new ArrayBuffer(8));
      dv.setFloat64(0, v);
      body.push([...new Uint8Array(dv.buffer)]);
    } else if (typeof v === 'string') {
      const b = enc.encode(v);
      types.push(b.length * 2 + 13);
      body.push([...b]);
    } else {
      types.push(v.length * 2 + 12);
      body.push([...v]);
    }
  }
  const typeBytes = types.flatMap(varint);
  // The header's size counts its own varint.
  let size = typeBytes.length + 1;
  if (varint(size).length > 1) size = typeBytes.length + varint(typeBytes.length + 2).length;
  const out = new Uint8Array(size + body.reduce((n, b) => n + b.length, 0));
  out.set([...varint(size), ...typeBytes], 0);
  let at = size;
  for (const b of body) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** The pages written so far, numbered from 1. */
class Pages {
  list: Uint8Array[] = [];
  add(page: Uint8Array): number {
    this.list.push(page);
    return this.list.length;
  }
  reserve(): number {
    return this.add(new Uint8Array(PAGE));
  }
}

/** How much of a payload stays in its cell, the rest going to overflow pages (table leaves: maxLocal U-35; index pages: smaller). */
function localSize(p: number, index: boolean): number {
  const x = index ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 35;
  if (p <= x) return p;
  const m = Math.floor(((U - 12) * 32) / 255) - 23;
  const k = m + ((p - m) % (U - 4));
  return k <= x ? k : m;
}

/** A cell's payload part, spilling into a chain of overflow pages if it is too long. */
function payloadPart(payload: Uint8Array, index: boolean, pages: Pages): number[] {
  const local = localSize(payload.length, index);
  if (local === payload.length) return [...payload];
  let rest = payload.subarray(local);
  const chain: Uint8Array[] = [];
  while (rest.length) {
    const page = new Uint8Array(PAGE);
    const n = Math.min(rest.length, U - 4);
    page.set(rest.subarray(0, n), 4);
    chain.push(page);
    rest = rest.subarray(n);
  }
  const numbers = chain.map(() => pages.reserve());
  chain.forEach((page, i) => {
    new DataView(page.buffer).setUint32(0, numbers[i + 1] ?? 0);
    pages.list[numbers[i] - 1] = page;
  });
  const first = new Uint8Array(4);
  new DataView(first.buffer).setUint32(0, numbers[0]);
  return [...payload.subarray(0, local), ...first];
}

/** A run of cells that fills a page without overflowing it, greedily: [first, last] by index. */
function fill(sizes: readonly number[], from: number, room: number): number {
  let used = 0;
  let i = from;
  while (i < sizes.length && (i === from || used + sizes[i] + 2 <= room)) {
    used += sizes[i] + 2;
    i++;
  }
  return i - 1;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/**
 * A table b-tree from its leaf cells (in rowid order): leaves, then interior
 * levels of (child, its largest rowid) cells with the last child as the
 * page's right pointer, until one page is the root. With `rootPage` the root
 * is written there, after `headerAt` bytes (page 1's file header).
 */
function tableTree(cells: { cell: number[]; key: number[] }[], pages: Pages, rootPage?: number, headerAt = 0): number {
  const place = (single: boolean) => (single && rootPage ? rootPage : pages.reserve());
  const at = (page: number) => (page === rootPage ? headerAt : 0);
  // Leaves.
  let level: { page: number; key: number[] }[] = [];
  const sizes = cells.map((c) => c.cell.length);
  const runs: [number, number][] = [];
  for (let i = 0; i < cells.length || runs.length === 0; ) {
    const end = cells.length ? fill(sizes, i, PAGE - 8 - headerAt) : -1;
    runs.push([i, end]);
    i = end + 1;
    if (!cells.length) break;
  }
  for (const [a, b] of runs) {
    const page = place(runs.length === 1);
    writePage(pages.list[page - 1], at(page), 0x0d, cells.slice(a, b + 1).map((c) => c.cell));
    level.push({ page, key: cells[b]?.key ?? [] });
  }
  // Interior levels.
  while (level.length > 1) {
    const items = level.slice(0, -1).map((c) => [...u32(c.page), ...c.key]);
    const next: { page: number; key: number[] }[] = [];
    const groups: [number, number][] = [];
    // Children a..b in one page: cells for a..b-1, b as the right pointer.
    const room = PAGE - 12 - headerAt;
    const sizes = items.map((x) => x.length);
    for (let i = 0; i < level.length; ) {
      let end = Math.min(level.length - 1, fill(sizes, i, room) + 1);
      // Never leave one child alone for a page of its own: take it, or leave two.
      if (end === level.length - 2) {
        const used = sizes.slice(i, end + 1).reduce((n, x) => n + x + 2, 0);
        if (used <= room) end++;
        else end--;
      }
      groups.push([i, end]);
      i = end + 1;
    }
    for (const [a, b] of groups) {
      const page = place(groups.length === 1);
      writePage(pages.list[page - 1], at(page), 0x05, items.slice(a, b), level[b].page);
      next.push({ page, key: level[b].key });
    }
    level = next;
  }
  return level[0].page;
}

/**
 * An index b-tree from its entries in key order. An index's interior cells
 * hold entries of their own (each then in no leaf): pages of entries with
 * one entry between each two going up a level as their divider.
 */
function indexTree(entries: number[][], pages: Pages): number {
  /** Split items into page runs and the dividers between them, each run non-empty. */
  const split = (sizes: number[], room: number): { runs: [number, number][]; dividers: number[] } => {
    const runs: [number, number][] = [];
    const dividers: number[] = [];
    let i = 0;
    do {
      const end = sizes.length ? fill(sizes, i, room) : -1;
      runs.push([i, end]);
      i = end + 1;
      if (i < sizes.length) {
        dividers.push(i);
        i++;
        if (i >= sizes.length) {
          // A divider with nothing after it: the run before gives up its last entry as the divider instead.
          const last = runs[runs.length - 1];
          const d = dividers.pop()!;
          dividers.push(last[1]);
          last[1]--;
          runs.push([d, d]);
        }
      }
    } while (i < sizes.length);
    return { runs, dividers };
  };

  let items = entries;
  let children: number[] | undefined;
  for (;;) {
    const cellOf = (k: number) => (children ? [...u32(children[k]), ...items[k]] : items[k]);
    const { runs, dividers } = split(items.map((_, k) => cellOf(k).length), PAGE - (children ? 12 : 8));
    const made: number[] = [];
    for (const [a, b] of runs) {
      const page = pages.reserve();
      const cells: number[][] = [];
      for (let k = a; k <= b; k++) cells.push(cellOf(k));
      // An interior run a..b: child k left of entry k, and child b+1 to its right.
      writePage(pages.list[page - 1], 0, children ? 0x02 : 0x0a, cells, children ? children[b + 1] : undefined);
      made.push(page);
    }
    if (made.length === 1) return made[0];
    items = dividers.map((k) => items[k]);
    children = made;
  }
}

/** One b-tree page: its header (at `at`), the cell pointers, and the cells packed at its end. */
function writePage(buf: Uint8Array, at: number, flag: number, cells: number[][], right?: number): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const interior = flag === 0x05 || flag === 0x02;
  const headerSize = interior ? 12 : 8;
  let content = PAGE;
  const pointers: number[] = [];
  for (const c of cells) {
    content -= c.length;
    buf.set(c, content);
    pointers.push(content);
  }
  if (at + headerSize + 2 * cells.length > content) throw new Error('sqlite: a page overflowed');
  dv.setUint8(at, flag);
  dv.setUint16(at + 1, 0);
  dv.setUint16(at + 3, cells.length);
  dv.setUint16(at + 5, content === 65536 ? 0 : content);
  dv.setUint8(at + 7, 0);
  if (interior) dv.setUint32(at + 8, right ?? 0);
  pointers.forEach((p, k) => dv.setUint16(at + headerSize + 2 * k, p));
}

/** Compare two values as SQLite orders them in an index (BINARY collation): NULL, numbers, text, blobs. */
function compareValues(a: SqlValue, b: SqlValue): number {
  const rank = (v: SqlValue) => (v === null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : 3);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 1) return (a as number) - (b as number);
  const ba = ra === 2 ? enc.encode(a as string) : (a as Uint8Array);
  const bb = rb === 2 ? enc.encode(b as string) : (b as Uint8Array);
  for (let i = 0; i < Math.min(ba.length, bb.length); i++) if (ba[i] !== bb[i]) return ba[i] - bb[i];
  return ba.length - bb.length;
}

/** The database file's bytes. */
export function sqliteFile(tables: readonly SqlTable[], indexes: readonly SqlIndex[] = []): Uint8Array {
  const pages = new Pages();
  pages.reserve(); // page 1: the file header and sqlite_master's root, written last
  const master: SqlValue[][] = [];

  for (const t of tables) {
    const rows = t.rows.map((r, i) => {
      const rowid = t.rowid === undefined ? i + 1 : (r[t.rowid] as number);
      const values = t.rowid === undefined ? r : r.map((v, k) => (k === t.rowid ? null : v));
      return { rowid, values };
    }).sort((a, b) => a.rowid - b.rowid);
    const cells = rows.map(({ rowid, values }) => {
      const payload = record(values);
      return { cell: [...varint(payload.length), ...varint(rowid), ...payloadPart(payload, false, pages)], key: varint(rowid), rowid };
    });
    const root = tableTree(cells, pages);
    master.push(['table', t.name, t.name, root, t.sql]);

    for (const ix of indexes.filter((x) => x.table === t.name)) {
      const keys = rows.map(({ rowid, values }) => [...ix.columns.map((c) => (c === t.rowid ? rowid : values[c])), rowid] as SqlValue[])
        .sort((a, b) => {
          for (let k = 0; k < a.length; k++) {
            const d = compareValues(a[k], b[k]);
            if (d) return d;
          }
          return 0;
        });
      // An index's interior cells carry a whole key, so every entry is a cell; the leaves hold the rest.
      const root = indexTree(keys.map((k) => {
        const payload = record(k);
        return [...varint(payload.length), ...payloadPart(payload, true, pages)];
      }), pages);
      master.push(['index', ix.name, ix.table, root, ix.sql]);
    }
  }

  const masterCells = master.map((r, i) => {
    const payload = record(r);
    return { cell: [...varint(payload.length), ...varint(i + 1), ...payloadPart(payload, false, pages)], key: varint(i + 1) };
  });
  // sqlite_master's root must be page 1; if it needs more than one page, its leaves go elsewhere.
  tableTree(masterCells, pages, 1, 100);

  const count = pages.list.length;
  const out = new Uint8Array(count * PAGE);
  pages.list.forEach((p, i) => out.set(p, i * PAGE));
  const h = new DataView(out.buffer);
  out.set(enc.encode('SQLite format 3\0'), 0);
  h.setUint16(16, PAGE);
  h.setUint8(18, 1);
  h.setUint8(19, 1);
  h.setUint8(20, 0);
  h.setUint8(21, 64);
  h.setUint8(22, 32);
  h.setUint8(23, 32);
  h.setUint32(24, 1);
  h.setUint32(28, count);
  h.setUint32(32, 0);
  h.setUint32(36, 0);
  h.setUint32(40, 1);
  h.setUint32(44, 4);
  h.setUint32(48, 0);
  h.setUint32(52, 0);
  h.setUint32(56, 1);
  h.setUint32(60, 0);
  h.setUint32(64, 0);
  h.setUint32(68, 0);
  h.setUint32(92, 1);
  h.setUint32(96, 3045000);
  return out;
}
