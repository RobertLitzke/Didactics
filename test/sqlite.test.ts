// The SQLite writer (sqlite.ts), read back by SQLite itself (sql.js).

import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { record, sqliteFile, varint } from '../src/sqlite';

type Db = { exec: (s: string) => { values: unknown[][] }[]; close: () => void };
const open = async (bytes: Uint8Array): Promise<Db> => {
  const SQL = (await initSqlJs()) as { Database: new (data: Uint8Array) => Db };
  return new SQL.Database(bytes);
};
const rows = (db: Db, sql: string) => db.exec(sql)[0]?.values ?? [];

describe('sqlite', () => {
  it('writes varints and records as SQLite does', () => {
    expect(varint(0)).toEqual([0]);
    expect(varint(127)).toEqual([127]);
    expect(varint(128)).toEqual([0x81, 0]);
    expect(varint(300)).toEqual([0x82, 0x2c]);
    expect(varint(-1)).toHaveLength(9);
    expect([...record([null, 0, 1, 2, 'a'])]).toEqual([6, 0, 8, 9, 1, 15, 2, 97]);
  });

  it('writes a small database that reads back', async () => {
    const db = await open(sqliteFile([{ name: 't', sql: 'CREATE TABLE t (id integer primary key, a text, b integer, c real, d blob)', rowid: 0, rows: [[2, 'two', -5, 1.5, new Uint8Array([1, 2])], [1, 'one', 2 ** 40, 0.25, null]] }]));
    expect(rows(db, 'SELECT * FROM t ORDER BY id')).toEqual([[1, 'one', 2 ** 40, 0.25, null], [2, 'two', -5, 1.5, new Uint8Array([1, 2])]]);
    expect(rows(db, 'PRAGMA integrity_check')).toEqual([['ok']]);
  });

  it('writes many rows, long text and indexes that SQLite finds sound', async () => {
    const N = 5000;
    const big = 'x'.repeat(20_000);
    const t = Array.from({ length: N }, (_, i) => [i * 3 + 1, `note ${i} ${'·'.repeat(i % 50)}`, i % 7, i % 13 === 0 ? big + i : 'short', (N - i) * 1.25]);
    const db = await open(sqliteFile(
      [
        { name: 'notes', sql: 'CREATE TABLE notes (id integer primary key, flds text not null, mid integer not null, data text not null, f real not null)', rowid: 0, rows: t },
        { name: 'empty', sql: 'CREATE TABLE empty (usn integer not null, oid integer not null)', rows: [] },
      ],
      [
        { name: 'ix_mid', table: 'notes', sql: 'CREATE INDEX ix_mid on notes (mid)', columns: [2] },
        { name: 'ix_flds', table: 'notes', sql: 'CREATE INDEX ix_flds on notes (mid, flds)', columns: [2, 1] },
        { name: 'ix_data', table: 'notes', sql: 'CREATE INDEX ix_data on notes (data)', columns: [3] },
      ],
    ));
    expect(rows(db, 'PRAGMA integrity_check')).toEqual([['ok']]);
    expect(rows(db, 'SELECT count(*), sum(id), max(length(data)) FROM notes')).toEqual([[N, t.reduce((n, r) => n + (r[0] as number), 0), Math.max(...t.map((r) => (r[3] as string).length))]]);
    expect(rows(db, 'SELECT count(*) FROM notes WHERE mid = 3')).toEqual([[t.filter((r) => r[2] === 3).length]]);
    expect(rows(db, 'SELECT flds FROM notes WHERE id = 7')).toEqual([[t[2][1]]]);
    expect(rows(db, 'SELECT count(*) FROM empty')).toEqual([[0]]);
  });
});
