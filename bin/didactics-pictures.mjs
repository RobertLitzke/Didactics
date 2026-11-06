#!/usr/bin/env node
// A course's picture pipeline (src/picture-tools.ts), from a course folder:
//
//   didactics-pictures find <course dir>                  contact sheet from tools/photo-search.json
//   didactics-pictures fetch <course dir> [--all] [--prune] [--width 1024] [--paleoart <list.json>]
//   didactics-pictures check <course dir>... [--paleoart <list.json>] [--live]
//   didactics-pictures paleoart --out <list.json>         save Commons' inaccurate-paleoart list
//   didactics-pictures migrate <photos.json>...           give old photo records a kind
//
// --user-agent "<Name>/0.1 (<url>)" names the course to the sources (each
// asks for one); by default it is made from course.json's title. BHL_API_KEY
// and SI_API_KEY in the environment unlock BHL's and the Smithsonian's APIs.
// The sources must be reachable: run it on your own computer.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { checkPictures, fetchPictures, fetchPaleoart, findCandidates, migrateFile } from '../lib/picture-tools.js';

const [command, ...args] = process.argv.slice(2);
const flags = {};
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (['--all', '--prune', '--live'].includes(a)) flags[a.slice(2)] = true;
  else if (a.startsWith('--')) flags[a.slice(2)] = args[++i];
  else rest.push(a);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
function userAgent(dir) {
  if (flags['user-agent']) return flags['user-agent'];
  const meta = dir && existsSync(join(dir, 'course.json')) ? readJson(join(dir, 'course.json')) : null;
  const name = (meta?.title ?? basename(resolve(dir ?? '.'))).replace(/\W+/g, '') || 'Didactics';
  return `${name}Course/0.1 (https://github.com/RobertLitzke/Didactics)`;
}
const paleoart = () => (flags.paleoart ? readJson(flags.paleoart) : undefined);
const usage = () => {
  console.error(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(1);
};

if (command === 'fetch' && rest[0]) {
  const dir = resolve(rest[0]);
  const r = await fetchPictures({ dir, userAgent: userAgent(dir), redo: flags.all, prune: flags.prune, width: flags.width ? Number(flags.width) : undefined, paleoart: paleoart() });
  console.log(`${r.records} pictures in ${join(rest[0], 'src/data/photos.json')}${r.failed.length ? `; ${r.failed.length} not fetched` : ''}`);
  if (r.failed.length) process.exitCode = 1;
} else if (command === 'find' && rest[0]) {
  const dir = resolve(rest[0]);
  const specFile = join(dir, 'tools/photo-search.json');
  if (!existsSync(specFile)) {
    console.error(`no ${specFile}: write one ({ categories?, sources?, features?, minWidth?, field? })`);
    process.exit(1);
  }
  const out = await findCandidates({ dir, userAgent: userAgent(dir), spec: readJson(specFile), perKey: Number(process.env.PER_KEY ?? 60), title: `${basename(dir)} picture candidates` });
  console.log(`\nOpen ${out} to pick.`);
} else if (command === 'check' && rest.length) {
  let bad = 0;
  for (const d of rest) {
    const dir = resolve(d);
    const file = existsSync(join(dir, 'src/data/photos.json')) ? join(dir, 'src/data/photos.json') : dir;
    const r = await checkPictures(readJson(file), { paleoart: paleoart(), live: flags.live ? { userAgent: userAgent(dir) } : undefined });
    for (const p of [...r.problems, ...r.paleoart]) console.log(`${d}: ${p.id}: ${p.problem}`);
    bad += r.problems.length + r.paleoart.length;
  }
  console.log(bad ? `${bad} problems` : 'every picture is in order');
  if (bad) process.exitCode = 1;
} else if (command === 'paleoart' && flags.out) {
  const { writeFileSync } = await import('node:fs');
  const list = await fetchPaleoart({ userAgent: userAgent(rest[0]) });
  writeFileSync(flags.out, `${JSON.stringify(list, null, 1)}\n`);
  console.log(`${list.files.length} files from ${list.from.join(', ')} saved to ${flags.out}`);
} else if (command === 'migrate' && rest.length) {
  for (const f of rest) console.log(`${f}: ${migrateFile(f)} records given a kind`);
} else usage();
