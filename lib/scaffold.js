// A new course, ready to run: every file a course on Didactics needs before
// its first lesson, with one lesson, one live figure and its check to write
// over. `didactics-course new <folder>` writes them (bin/didactics-course.mjs);
// this only makes them, so a test can check that they build. Node only (the
// icons are PNGs, made with node:zlib).
import { deflateSync } from 'node:zlib';
/** Turns a title into an id: "Levers & Pulleys" → "levers-pulleys". */
export function courseId(title) {
    return title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'course';
}
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
/** The course's files, by path from its root. */
export function scaffold(o) {
    const { id, title } = o;
    const subtitle = o.subtitle ?? 'An interactive course';
    const port = o.port ?? 5430;
    const bg = o.color ?? '#1b172f';
    const str = JSON.stringify;
    return {
        'package.json': json({
            name: id,
            version: '0.1.0',
            description: `${title}: ${subtitle}.`,
            type: 'module',
            private: true,
            scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview', test: 'vitest run' },
            dependencies: { didactics: o.didactics },
            devDependencies: {
                '@types/node': '^20.19.43',
                'happy-dom': '^20.14.6',
                typescript: '^5.7.2',
                vite: '^6.0.5',
                'vite-plugin-pwa': '^1.0.0',
                'vite-plugin-singlefile': '^2.3.0',
                vitest: '^3.0.0',
            },
        }),
        'tsconfig.json': json({
            compilerOptions: {
                target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
                types: ['node', 'vite/client', 'vite-plugin-pwa/client'],
                strict: true, noUnusedLocals: true, noUnusedParameters: true, noFallthroughCasesInSwitch: true,
                esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true,
                isolatedModules: true, allowImportingTsExtensions: true, verbatimModuleSyntax: true, noEmit: true,
            },
            include: ['src', 'test', 'vite.config.ts', 'vitest.config.ts'],
            exclude: ['node_modules', 'dist'],
        }),
        'vite.config.ts': `import { defineConfig } from 'vite';
import { lessonApp } from 'didactics/vite';
import pkg from './package.json';

// The whole build is Didactics' (didactics/vite): the page with everything
// inlined, the same page again as dist/${id}.html for Settings' download link,
// and a service worker so the installed app works offline.
export default defineConfig(
  lessonApp({
    root: __dirname,
    version: pkg.version,
    port: ${port},
    oneFile: '${id}.html',
    manifest: { name: ${str(title)}, short_name: ${str(title.slice(0, 12))}, description: ${str(subtitle)}, theme_color: '${bg}' },
  }),
);
`,
        'vitest.config.ts': `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Didactics ships TypeScript source, so Vitest compiles it too.
    server: { deps: { inline: ['didactics'] } },
  },
});
`,
        'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="${bg}" />
    <meta name="description" content="${title}: ${subtitle}." />
    <title>${title}</title>
    <link rel="icon" type="image/svg+xml" href="./icons/icon.svg" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
        '.gitignore': 'node_modules/\ndist/\n*.local\n.DS_Store\n',
        '.github/workflows/pages.yml': `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`,
        'README.md': `# ${title}

${subtitle}, built on [Didactics](https://github.com/RobertLitzke/Didactics).

\`\`\`sh
npm install
npm run dev     # http://localhost:${port}
npm test        # every lesson names figures that exist, with goals they know
npm run build   # dist/: the site, ${id}.html (the app as one file) and a service worker
\`\`\`

- Lessons are JSON in \`src/lessons/\`, one file per lesson, numbered by \`n\`.
- Figures are in \`src/figures/\`, one file per lesson, listed in \`src/figures/index.ts\`.
  A diagram id a lesson names with no code yet shows as a dashed placeholder.
- Colours that mean something are in \`src/figures/kit.ts\` (\`COL\`); the page's are in \`src/styles/tokens.css\`.
- \`src/main.ts\` is the whole app: \`defineCourse\` from \`didactics/app\`.
- The icons in \`public/icons/\` are plain squares in the page colour; draw your own.
- \`npx didactics-course export src/lessons --code src\` puts every word into one file to edit; \`import\` puts them back.

On GitHub, set Settings → Pages → Source to GitHub Actions; each push to main deploys.
`,
        'public/icons/icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="44" font-family="system-ui, sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#f6b98e">${escapeXml(title.slice(0, 1).toUpperCase())}</text></svg>\n`,
        'public/icons/icon-192.png': squarePng(192, bg),
        'public/icons/icon-512.png': squarePng(512, bg),
        'public/icons/icon-512-maskable.png': squarePng(512, bg),
        'public/icons/apple-touch-icon.png': squarePng(180, bg),
        'src/env.d.ts': `/** package.json's version, injected by the build (didactics/vite). */
declare const __APP_VERSION__: string;

/** The words written in the code, scanned by the build, for the course file. */
declare module 'virtual:didactics/code-text' {
  const code: import('didactics/code-text').CodeText;
  export default code;
}
`,
        'src/main.ts': `import 'didactics/styles/kit.css';
import './styles/tokens.css';
import { courseFiles } from 'didactics/course';
import { defineCourse } from 'didactics/app';
import { FIGURES } from './figures';
import { prose } from './figures/kit';
import { LESSONS } from './lessons';

defineCourse({
  id: '${id}',
  title: ${str(title)},
  subtitle: ${str(subtitle)},
  lessons: LESSONS,
  figures: FIGURES,
  prose,
  // Settings can download every word of the course, lessons and code, to edit and load back.
  text: {
    files: courseFiles(import.meta.glob('/src/lessons/*.json', { eager: true, import: 'default' })),
    code: () => import('virtual:didactics/code-text').then((m) => m.default),
  },
});
`,
        'src/lessons.ts': `// Every lesson in src/lessons, in order.
import type { Lesson } from 'didactics/lesson';

const found = import.meta.glob<Lesson>('./lessons/*.json', { eager: true, import: 'default' });

export const LESSONS: readonly Lesson[] = Object.values(found).sort((a, b) => a.n - b.n);
`,
        'src/lessons/first.json': json({
            id: 'first',
            n: 1,
            title: 'The first lesson',
            teaches: 'What a lesson is made of',
            parts: [
                {
                    title: 'Cause and effect',
                    blocks: [
                        { type: 'text', text: 'A lesson is paragraphs and figures. Words can be **bold**, *italic*, or [[coloured|effort]] to match a figure.' },
                        { type: 'interactive_diagram', id: 'seesaw', caption: 'A plank on a pivot', task: 'Slide the pivot until the plank balances', goal: 'balance', aspect_ratio: 2 },
                        { type: 'diagram', id: 'next-drawing', caption: 'A figure not drawn yet shows as a placeholder', aspect_ratio: 2 },
                        { type: 'key_ideas', title: 'Hold on to', points: ['Every interactive figure shows a cause and its effect.'] },
                    ],
                },
                { title: 'Check', blocks: [{ type: 'quiz', id: 'check', caption: 'Two questions', task: 'Answer them' }] },
            ],
            learned: ['A lesson is text, figures and a check.'],
            next: 'Next: write the second lesson.',
            journal: [],
        }),
        'src/figures/kit.ts': `// The colours that always mean the same thing, in every figure and in the
// text ([[words|key]]), and the figure kit with them filled in.
import { slider as kitSlider, type Slider } from 'didactics/figure';
import { prose as kitProse } from 'didactics/lesson';

export * from 'didactics/figure';

export const COL = { ink: '#2a2547', soft: '#6a5c80', paper: '#fffaf0', effort: '#e0663f', load: '#3a7bd5', pivot: '#0e7a8f' } as const;
export type ColorKey = keyof typeof COL;

export const slider = (label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void, color: ColorKey = 'ink'): Slider =>
  kitSlider(label, min, max, step, value, show, onInput, COL[color]);

export const prose = (text: string) => kitProse(text, COL);
`,
        'src/figures/first.ts': `// The first lesson's figures, in lesson order.
import { svg } from 'didactics/dom';
import { label, line, redraw } from 'didactics/draw';
import { check } from 'didactics/check';
import { COL, figure, frame, slider } from './kit';

/** A plank on a pivot, with the same weight at each end: it balances only with the pivot in the middle. */
export const seesaw = figure(['balance'], (_ctx, t) => {
  const f = frame(400, 200, 2);
  const g = svg('g');
  f.svg.append(g);
  let pivot = 120;
  const paint = () => {
    const tilt = Math.max(-40, Math.min(40, (pivot - 200) / 2));
    const y = (x: number) => 110 + tilt - (2 * tilt * (x - 40)) / 320;
    redraw(g,
      line(40, y(40), 360, y(360), COL.ink, 6),
      label(pivot, y(pivot) + 13, '▲', { anchor: 'middle', fill: COL.pivot }),
      label(40, 95 + tilt, '1 kg', { anchor: 'middle', fill: COL.effort }),
      label(360, 95 - tilt, '1 kg', { anchor: 'middle', fill: COL.load }));
    const level = Math.abs(tilt) < 1;
    f.readout.textContent = level ? 'Level: the same turning on each side.' : \`The \${pivot < 200 ? 'right' : 'left'} side is further from the pivot, so it turns the plank down.\`;
    if (level) t.done();
  };
  f.controls.append(slider('Pivot', 60, 340, 2, pivot, (v) => \`\${v} cm\`, (v) => { pivot = v; paint(); }, 'pivot').node);
  paint();
  return f.node;
});

/** The check at the end of the lesson. */
export const firstCheck = check(() => [
  { ask: 'Two equal weights sit at the ends of a plank. Where must the pivot go?', choices: ['In the middle', 'Near either end'], answer: 0, why: 'Equal weights at equal distances turn the plank equally.', row: true },
  { ask: 'The pivot moves left. Which end goes down?', choices: ['The left', 'The right'], answer: 1, why: 'The right weight is now further from the pivot, so it turns harder.', row: true },
]);
`,
        'src/figures/index.ts': `// Each diagram id the lessons name, to its code.
import type { FigureFactory } from 'didactics/figure';
import { firstCheck, seesaw } from './first';

export const FIGURES: Readonly<Record<string, FigureFactory>> = {
  seesaw,
  check: firstCheck,
};
`,
        'src/styles/tokens.css': `/* The page's colours and fonts, over Didactics' defaults (didactics/styles/kit.css). */
:root {
  --bg: ${bg};
  --font: system-ui, sans-serif;
  --display: system-ui, sans-serif;
}
`,
        'test/content.test.ts': `// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { lessonProblems, lessonShapeProblems } from 'didactics/lesson';
import { FIGURES } from '../src/figures';
import { LESSONS } from '../src/lessons';

describe('the lessons', () => {
  it('are well formed', () => {
    expect(LESSONS.flatMap((l) => lessonShapeProblems(l, l.id))).toEqual([]);
  });

  it('name figures that exist, with goals they know', () => {
    // Drop allowPlaceholders once every diagram is drawn.
    expect(lessonProblems(LESSONS, FIGURES, { allowPlaceholders: true })).toEqual([]);
  });
});
`,
    };
}
function escapeXml(s) {
    return s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
/** A square PNG of one colour, for icons to draw over later. */
export function squarePng(size, hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++)
        row.set([r, g, b], 1 + x * 3);
    const raw = Buffer.concat(Array.from({ length: size }, () => row));
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
}
function crc32(buf) {
    let c = ~0;
    for (const byte of buf) {
        c ^= byte;
        for (let k = 0; k < 8; k++)
            c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}
