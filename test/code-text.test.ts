// @vitest-environment happy-dom
// The words a course writes in its code: found, carried in the course file,
// written back into the source, and shown edited in the running page.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { codeTable, rewriteCode, scanCode } from '../src/code-scan';
import { codeSwaps, codeTextProblems, isProse, liveCodeText, swapCodeText, templateParts } from '../src/code-text';
import { courseEdits } from '../src/course';

const SOURCE = `import { el } from 'didactics/dom';
// 'A comment is not words'
const COL = { 'Key name': '#ff00aa', fill: 'var(--ink)' };
type Floor = 'The low floor' | 'high';
export const label = (n: number) => el('p.note', { style: 'opacity: 0.5' }, \`\${n} drop\${n === 1 ? '' : 's'} fall\`);
export const path = 'M10,20 L30,40 Z';
export const title = 'Steam you can see is not vapour';
export const again = "Steam you can see is not vapour";
export const quote = 'Don\\'t look';
export const heading = 'Cirrus';
export const id = 'cirrus';
export const at = \`translate(\${1} \${2})\`;
export const photo = \`photos/\${id}.webp\`;
const m = COL['Key name'];
`;

describe('which strings are words', () => {
  it('takes sentences and capitalised words, and leaves ids, CSS, paths and files', () => {
    for (const s of ['clear gap', 'Cirrus', 'Pick a cloud first.', '−5 to −25 °C: the seeding window', 'Heights in']) expect(isProse(s), s).toBe(true);
    for (const s of ['cirrus', 'btn-ghost', 'opacity: 0.5', 'var(--ink)', 'M10,20 L30,40 Z', 'translate(10 20)', '12px Georgia', '3 3', '°C', 'photos/x.webp', '#/journal/glossary']) expect(isProse(s), s).toBe(false);
  });

  it('finds words in a source file, but not modules, keys, types or comments', () => {
    const found = scanCode('src/a.ts', SOURCE).map((s) => s.text);
    expect(found).toEqual(["${n} drop${n === 1 ? '' : 's'} fall", 'Steam you can see is not vapour', 'Steam you can see is not vapour', "Don't look", 'Cirrus']);
    expect(codeTable({ 'src/a.ts': SOURCE, 'src/b.ts': "export const x = 'x';" })).toEqual({
      'src/a.ts': { "${n} drop${n === 1 ? '' : 's'} fall": "${n} drop${n === 1 ? '' : 's'} fall", 'Steam you can see is not vapour': 'Steam you can see is not vapour', "Don't look": "Don't look", Cirrus: 'Cirrus' },
    });
  });

  it('splits a template into words and the code between them', () => {
    expect(templateParts("${n} drop${n === 1 ? '' : 's'} fall\\n")).toEqual({ texts: ['', ' drop', ' fall\n'], exprs: ['n', "n === 1 ? '' : 's'"] });
    expect(templateParts('a ${f({ b: 1 })} c')).toEqual({ texts: ['a ', ' c'], exprs: ['f({ b: 1 })'] });
  });
});

describe('writing edits back', () => {
  it('writes each edited string in its own quotes, everywhere it is used', () => {
    const { source, problems } = rewriteCode('src/a.ts', SOURCE, {
      'Steam you can see is not vapour': 'The "steam" is droplets',
      "Don't look": "Don't stare",
      "${n} drop${n === 1 ? '' : 's'} fall": "Falling: ${n} drop${n === 1 ? '' : 's'}",
      Cirrus: 'Cirrus',
    });
    expect(problems).toEqual([]);
    expect(source).toContain(`export const title = 'The "steam" is droplets';`);
    expect(source).toContain(`export const again = "The \\"steam\\" is droplets";`);
    expect(source).toContain(`export const quote = 'Don\\'t stare';`);
    expect(source).toContain("`Falling: ${n} drop${n === 1 ? '' : 's'}`");
    expect(scanCode('src/a.ts', source).map((s) => s.text)).toContain('The "steam" is droplets');
  });

  it('refuses edits that are not in the file or would break a template', () => {
    expect(rewriteCode('src/a.ts', SOURCE, { 'Gone now': 'x' }).problems).toEqual(['src/a.ts: "Gone now" is no longer in the file']);
    const broken = rewriteCode('src/a.ts', SOURCE, { "${n} drop${n === 1 ? '' : 's'} fall": 'drops ` fall' });
    expect(broken.source).toBe(SOURCE);
    expect(broken.problems).toHaveLength(2);
    const nested = "${ok ? `fine ${n}` : 'no'} \\` here";
    expect(codeTextProblems({ 'src/a.ts': { [nested]: nested.replace('here', 'there') } }, { 'src/a.ts': { [nested]: nested } })).toEqual([]);
    expect(codeTextProblems({ 'src/a.ts': { 'Cirrus': 'Cirrus!' } }, { 'src/a.ts': { Cirrus: 'Cirrus' } })).toEqual([]);
    expect(codeTextProblems({ 'src/a.ts': { 'Cirus': 'x' }, 'src/z.ts': {} }, { 'src/a.ts': { Cirrus: 'Cirrus' } })).toEqual([
      'code src/a.ts: "Cirus" is not in that file (change the words on the right, not the ones on the left)',
      'code src/z.ts: the course has no words in such a file',
    ]);
  });
});

describe('edited words in the running page', () => {
  beforeEach(() => localStorage.clear());

  it('swaps whole texts, sentences inside longer ones, and fills in templates', () => {
    const swaps = codeSwaps({ 'src/a.ts': {
      Cirrus: 'Cirrus clouds',
      'Steam you can see is not vapour': 'Steam is droplets',
      '${n} drops fall on ${where}': 'On ${where}, ${n} drops fall',
    } });
    expect(swapCodeText('Cirrus', swaps)).toBe('Cirrus clouds');
    expect(swapCodeText('Cirrus and more', swaps)).toBe('Cirrus and more');
    expect(swapCodeText('Look. Steam you can see is not vapour.', swaps)).toBe('Look. Steam is droplets.');
    expect(swapCodeText('3 drops fall on Harrow', swaps)).toBe('On Harrow, 3 drops fall');
  });

  it('shows edits as text reaches the page, however it gets there', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const stop = liveCodeText({ 'src/a.ts': { 'Nudge the bubble up': 'Give the bubble a nudge' } }, root);
    const button = document.createElement('button');
    button.textContent = 'Nudge the bubble up';
    root.append(button);
    await Promise.resolve();
    expect(button.textContent).toBe('Give the bubble a nudge');
    button.textContent = 'Nudge the bubble up';
    await Promise.resolve();
    expect(button.textContent).toBe('Give the bubble a nudge');
    stop();
  });

  it('carries the code in the course file, keeps edits, and refuses strings the course lacks', async () => {
    const code = { 'src/a.ts': { 'Nudge the bubble up': 'Nudge the bubble up', Cirrus: 'Cirrus' } };
    const make = () => ({ 'src/push.json': { title: 'Push' } });
    const first = courseEdits({ key: 'code.course', title: 'Push', files: make(), code: async () => code });
    expect(first.hasCode).toBe(true);
    const file = await first.file();
    expect(file.code).toEqual(code);
    file.code!['src/a.ts'].Cirrus = 'Cirrus clouds';
    expect(await first.load(JSON.stringify(file))).toEqual([]);
    expect(first.edited).toEqual(['src/a.ts']);
    expect(JSON.parse(localStorage.getItem('code.course')!).code).toEqual({ 'src/a.ts': { Cirrus: 'Cirrus clouds' } });
    const next = courseEdits({ key: 'code.course', title: 'Push', files: make(), code: async () => code });
    expect(next.edited).toEqual(['src/a.ts']);
    expect((await next.file()).code!['src/a.ts']).toEqual({ 'Nudge the bubble up': 'Nudge the bubble up', Cirrus: 'Cirrus clouds' });
    file.code!['src/a.ts'] = { Cirus: 'x' } as never;
    expect(await next.load(JSON.stringify(file))).toHaveLength(1);
    const plain = courseEdits({ key: 'plain.course', title: 'Push', files: make() });
    expect((await plain.file()).code).toBeUndefined();
  });

  it('round-trips through the command line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'didactics-code-'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    writeFileSync(join(dir, 'src/data/push.json'), '{ "title": "Push" }\n');
    writeFileSync(join(dir, 'src/a.ts'), SOURCE);
    writeFileSync(join(dir, 'src/a.test.ts'), "export const t = 'Not course words';\n");
    const cli = (...a: string[]) => execFileSync(process.execPath, [resolve(__dirname, '../bin/didactics-course.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
    expect(cli('export', 'src/data', '--code', 'src')).toMatch(/Wrote 1 files and 4 strings from 1 source files/);
    const course = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8'));
    expect(Object.keys(course.code)).toEqual(['src/a.ts']);
    expect(cli('import', 'course.json')).toMatch(/already matches/);
    course.code['src/a.ts'].Cirrus = 'Cirrus, the ice cloud';
    writeFileSync(join(dir, 'course.json'), JSON.stringify(course));
    expect(cli('import', 'course.json')).toMatch(/changed src\/a.ts \(1 string\)/);
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toContain("export const heading = 'Cirrus, the ice cloud';");
  });
});
