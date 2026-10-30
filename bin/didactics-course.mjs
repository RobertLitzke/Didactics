#!/usr/bin/env node
// The course as one JSON file, from the repository (src/course.ts has the format).
//
//   didactics-course export src/data [more folders or files] [--title "Clouds"] [--out course.json] [--skip src/data/photos.json] [--code src]
//   didactics-course import course.json [--dry-run]
//
// --code adds the words written in the source files under each folder it
// names (src/code-text.ts), and import writes edited ones back into them.
//   didactics-course upgrade src/data              lessons and reference files in the old `kind` shape to typed blocks
//
// Paths are kept relative to the folder it is run in, so run it from the
// repository root, the same root the app's import.meta.glob paths start from.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { exportCourse, formatJson, readCourse, upgradeLesson, upgradeReference } from '../lib/course.js';

const [command, ...args] = process.argv.slice(2);
const flags = {};
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run') flags.dryRun = true;
  else if (a.startsWith('--')) (flags[a.slice(2)] ??= []).push(args[++i]);
  else rest.push(a);
}

// TypeScript reads the code, so only load it when there is code to read.
const codeScan = () => import('../lib/code-scan.js');

const rel = (p) => relative(process.cwd(), resolve(p)).split(sep).join('/');
const jsonUnder = (p) => (statSync(p).isDirectory()
  ? readdirSync(p).sort().flatMap((f) => jsonUnder(`${p}/${f}`))
  : p.endsWith('.json') ? [rel(p)] : []);
// A file written over keeps its layout: what it had on one line stays on one line.
const layout = (path, json) => formatJson(json, existsSync(path) ? readFileSync(path, 'utf8') : undefined);
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

function fail(lines) {
  for (const l of [].concat(lines)) console.error(l);
  process.exit(1);
}

if (command === 'export') {
  if (!rest.length) fail('Name the folders or files the course keeps its words in, such as: didactics-course export src/data');
  const skip = new Set((flags.skip ?? []).map(rel));
  const files = {};
  for (const path of rest.flatMap(jsonUnder)) if (!skip.has(path)) files[path] = JSON.parse(readFileSync(path, 'utf8'));
  const out = flags.out?.[0] ?? 'course.json';
  let code;
  if (flags.code) {
    const { codeTable, readSources } = await codeScan();
    code = codeTable(readSources(process.cwd(), flags.code));
  }
  write(out, formatJson(exportCourse(flags.title?.[0] ?? 'Course', files, new Date(), code)));
  const strings = code ? Object.values(code).reduce((n, t) => n + Object.keys(t).length, 0) : 0;
  console.log(`Wrote ${Object.keys(files).length} files${code ? ` and ${strings} strings from ${Object.keys(code).length} source files` : ''} into ${out}.`);
} else if (command === 'import') {
  const [file] = rest;
  if (!file || !existsSync(file)) fail('Name the course file to read, such as: didactics-course import course.json');
  const { files, code, problems } = readCourse(JSON.parse(readFileSync(file, 'utf8')));
  // Every source file is rewritten in memory first, so a problem in one writes none.
  const sources = [];
  if (Object.keys(code).length) {
    const { rewriteCode } = await codeScan();
    for (const [path, edits] of Object.entries(code)) {
      if (path.split('/').includes('..') || !existsSync(path)) {
        problems.push(`code ${path}: no such source file here`);
        continue;
      }
      const now = readFileSync(path, 'utf8');
      const next = rewriteCode(path, now, edits);
      problems.push(...next.problems);
      if (next.source !== now) sources.push([path, next.source, Object.keys(edits).length]);
    }
  }
  if (problems.length) fail(['Nothing was written. The course file has these problems:', ...problems.map((p) => `  ${p}`)]);
  let changed = 0;
  for (const [path, json] of Object.entries(files)) {
    const now = existsSync(path) ? readFileSync(path, 'utf8') : null;
    const next = layout(path, json);
    if (now === next) continue;
    changed++;
    console.log(`${now === null ? 'new    ' : 'changed'} ${path}`);
    if (!flags.dryRun) write(path, next);
  }
  for (const [path, text, n] of sources) {
    changed++;
    console.log(`changed ${path} (${n} string${n === 1 ? '' : 's'})`);
    if (!flags.dryRun) write(path, text);
  }
  const all = Object.keys(files).length + sources.length;
  console.log(changed ? `${flags.dryRun ? 'Would write' : 'Wrote'} ${changed} of ${all} files.` : 'Every file already matches.');
} else if (command === 'upgrade') {
  let changed = 0;
  for (const path of rest.flatMap(jsonUnder)) {
    const text = readFileSync(path, 'utf8');
    const raw = JSON.parse(text);
    const up = upgradeReference(upgradeLesson(raw));
    if (JSON.stringify(up) === JSON.stringify(raw)) continue;
    write(path, formatJson(up, text));
    changed++;
    console.log(`upgraded ${path}`);
  }
  console.log(`${changed} files upgraded. Check each callout's type: a figure the guess got wrong is reported by lessonProblems or referenceProblems.`);
} else {
  fail([
    'didactics-course export <folders or files> [--title T] [--out course.json] [--skip path] [--code src]',
    'didactics-course import <course.json> [--dry-run]',
    'didactics-course upgrade <folders or files>',
  ]);
}
