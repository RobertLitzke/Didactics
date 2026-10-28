// The package's public interface is its `exports` map: one entry per module.
// These keep the map, the source and the compiled build helper in step.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, string | Record<string, string>> };

describe('package', () => {
  it('exports every module in src, and every export exists', () => {
    const modules = readdirSync(join(ROOT, 'src')).map((f) => `./${f.replace(/\.ts$/, '')}`);
    for (const m of modules) expect(pkg.exports[m], `${m} is not in exports`).toBeDefined();
    for (const target of Object.values(pkg.exports).flatMap((t) => (typeof t === 'string' ? [t] : Object.values(t)))) {
      expect(existsSync(join(ROOT, target)), `${target} is missing`).toBe(true);
    }
  });

  it('ships lib/ built from src (run npm run build)', () => {
    const out = mkdtempSync(join(tmpdir(), 'didactics-lib-'));
    execFileSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', join(ROOT, 'tsconfig.lib.json'), '--outDir', out]);
    expect(readdirSync(join(ROOT, 'lib')).sort()).toEqual(readdirSync(out).sort());
    for (const f of readdirSync(out)) {
      expect(readFileSync(join(ROOT, 'lib', f), 'utf8'), f).toBe(readFileSync(join(out, f), 'utf8'));
    }
  }, 60_000);
});
