// The picture pipeline a course runs in Node (bin/didactics-pictures.mjs):
//
//   find      a contact sheet of candidates from Commons categories and
//             PhyloPic, iNaturalist and Smithsonian searches, to pick from
//   fetch     each pick in tools/photo-picks.json downloaded, its licence and
//             author read at that moment, resized (or kept as SVG), credited
//             in src/data/photos.json with its kind and the changes made
//   paleoart  Commons' list of files its reviewers mark as inaccurate
//             paleoart, saved to a JSON file so tests can check offline
//   check     every record's fields, and none on that list
//   migrate   records in the old photo shape given a kind
//
// Picks keep their ids for good: saves remember them. The tools need the
// network to the sources (a person's own computer; cloud machines are
// refused by Commons and cannot reach the others) and sharp, which the
// course installs.
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isKind, migratePicture, normalTitle, paleoartFlags, pictureProblems } from "./pictures.js";
import { categoryTreeFiles, commons, commonsFiles, inaturalist, isPaleoartCategory, kindFor, PALEOART, phylopic, politeFetch, smithsonian, sourceOf, templateFiles, } from "./picture-sources.js";
const paths = (c) => ({
    picks: join(c.dir, c.picks ?? 'tools/photo-picks.json'),
    records: join(c.dir, c.records ?? 'src/data/photos.json'),
    folder: c.folder ?? 'photos',
});
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
/** The pick fields the pipeline reads; every other field is the course's own and is carried into the record. */
const OWN = new Set(['id', 'kind', 'changes', 'crop', 'fill', 'title', 'commons', 'phylopic', 'inaturalist', 'photo', 'bhl', 'smithsonian', 'media', 'url', 'page', 'source', 'author', 'license']);
const courseFields = (pick) => Object.fromEntries(Object.entries(pick).filter(([k]) => !OWN.has(k)));
/** The changes a pick's record will list: its own, plus those the tool makes (crop, fill). */
export function changesFor(pick) {
    const out = [...(pick.changes ?? [])];
    if (pick.crop && !out.includes('cropped'))
        out.push('cropped');
    if (pick.fill && !out.includes('recoloured'))
        out.push('recoloured');
    return out;
}
/** An SVG drawn in one colour: CSS outranks the fill attributes inside. */
export function recolourSvg(svg, fill) {
    if (!/^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(fill))
        throw new Error(`fill "${fill}" should be a #hex colour or a colour name`);
    return svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>path,polygon,circle,ellipse,rect,g{fill:${fill}}</style>`);
}
/** Width and height an SVG declares (viewBox, else width/height). */
export function svgSize(svg) {
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    if (vb)
        return [Math.round(Number(vb[1])), Math.round(Number(vb[2]))];
    const w = /\bwidth\s*=\s*["']([\d.]+)/.exec(svg)?.[1];
    const h = /\bheight\s*=\s*["']([\d.]+)/.exec(svg)?.[1];
    return [Math.round(Number(w ?? 0)), Math.round(Number(h ?? 0))];
}
/**
 * Fetches a course's picks into public/<folder>/ and src/data/photos.json.
 * Each pick names a source (didactics/picture-sources); its licence and
 * author are read from the source now, and a licence the courses do not
 * accept, or a Commons file marked inaccurate paleoart, is refused. Raster
 * pictures are resized to `width` and saved as WebP; SVG (PhyloPic) is kept
 * as SVG, recoloured if the pick has `fill`. Returns how many failed.
 */
export async function fetchPictures(o) {
    const p = paths(o);
    const log = o.log ?? console.log;
    const picks = readJson(p.picks, null);
    if (!picks)
        throw new Error(`no ${p.picks}`);
    const width = o.width ?? 1024;
    const ctx = { ...o, width };
    const have = migrateList(readJson(p.records, []));
    const fileOf = (r) => String(r.file ?? `${p.folder}/${r.id}.webp`);
    const out = o.redo ? [] : have.filter((r) => picks.some((k) => k.id === r.id) && existsSync(join(o.dir, 'public', fileOf(r))));
    const bad = new Set((o.paleoart?.files ?? []).map(normalTitle));
    const failed = [];
    const fail = (id, why) => { failed.push(`${id}: ${why}`); (o.warn ?? console.error)(`${id}: ${why}`); };
    mkdirSync(join(o.dir, 'public', p.folder), { recursive: true });
    const seen = new Set();
    let sharp;
    for (const pick of picks) {
        if (seen.has(pick.id))
            fail(pick.id, 'picked twice');
        seen.add(pick.id);
        if (out.some((r) => r.id === pick.id))
            continue;
        if (pick.kind !== undefined && !isKind(pick.kind)) {
            fail(pick.id, `unknown kind "${pick.kind}"`);
            continue;
        }
        const source = sourceOf(pick);
        if (!source) {
            fail(pick.id, 'names no source (title, phylopic, inaturalist, bhl, smithsonian or url)');
            continue;
        }
        let found;
        try {
            found = await source.resolve(pick, ctx);
        }
        catch (e) {
            fail(pick.id, e.message);
            continue;
        }
        if (!found) {
            fail(pick.id, `nothing at ${source.name} for this pick`);
            continue;
        }
        if (!found.license) {
            fail(pick.id, `licence "${found.licenseName}" not allowed`);
            continue;
        }
        const marked = pick.outdated ? null : (found.categories ?? []).find(isPaleoartCategory) ?? (found.title && bad.has(normalTitle(found.title)) ? 'the saved inaccurate-paleoart list' : null);
        if (marked) {
            fail(pick.id, `${found.title} is marked inaccurate paleoart (${marked})`);
            continue;
        }
        const res = await politeFetch(found.imageUrl, ctx);
        if (!res.ok) {
            fail(pick.id, `${res.status} from ${found.imageUrl}`);
            continue;
        }
        const body = Buffer.from(await res.arrayBuffer());
        let saved;
        if (found.format === 'svg') {
            let svg = body.toString('utf8');
            if (pick.fill)
                svg = recolourSvg(svg, String(pick.fill));
            const file = `${p.folder}/${pick.id}.svg`;
            writeFileSync(join(o.dir, 'public', file), svg);
            const [w, h] = svgSize(svg);
            saved = { file, width: w || found.width, height: h || found.height };
        }
        else {
            sharp ??= (await import(__rewriteRelativeImportExtension('sharp'))).default;
            let s = sharp(body).rotate();
            if (pick.crop) {
                const [left, top, w, h] = pick.crop;
                s = sharp(await s.extract({ left, top, width: w, height: h }).toBuffer());
            }
            const file = `${p.folder}/${pick.id}.webp`;
            const info = await s.resize({ width, withoutEnlargement: true }).webp(o.webp ?? { quality: 72, effort: 6, smartSubsample: true }).toFile(join(o.dir, 'public', file));
            saved = { file, width: info.width, height: info.height };
        }
        const changes = changesFor(pick);
        const record = {
            id: pick.id,
            kind: kindFor(pick, found),
            ...courseFields(pick),
            ...saved,
            author: found.author,
            license: found.license,
            sourceUrl: found.pageUrl,
            source: found.source,
            ...(changes.length ? { changes } : {}),
        };
        const wrong = pictureProblems(record);
        if (wrong.length) {
            fail(pick.id, wrong.join('; '));
            continue;
        }
        out.push(record);
        log(`${pick.id}: ${record.kind}, ${found.license}, ${saved.width}×${saved.height} from ${found.source}`);
        if (source === commons)
            await new Promise((ok) => setTimeout(ok, o.fetch ? 0 : 600));
    }
    const order = (id) => picks.findIndex((k) => k.id === id);
    out.sort((a, b) => order(a.id) - order(b.id));
    writeJson(p.records, out);
    if (o.prune) {
        const keep = new Set(out.map(fileOf));
        for (const f of readdirSync(join(o.dir, 'public', p.folder))) {
            if (/\.(webp|svg)$/.test(f) && !keep.has(`${p.folder}/${f}`)) {
                rmSync(join(o.dir, 'public', p.folder, f));
                log(`removed ${p.folder}/${f}`);
            }
        }
    }
    return { records: out.length, failed };
}
/** Records in the old photo shape given a kind (default photo); records that have one are left alone. */
export function migrateList(list, guess) {
    return list.map((r) => migratePicture(r, guess?.(r)));
}
/** Migrates a records file in place; returns how many records changed. */
export function migrateFile(file, guess) {
    const list = readJson(file, []);
    const next = migrateList(list, guess);
    const changed = next.filter((r, i) => r !== list[i]).length;
    if (changed)
        writeJson(file, next);
    return changed;
}
/** Reads Commons' inaccurate-paleoart category tree and template users into a list to save. */
export async function fetchPaleoart(ctx, o = {}) {
    const files = new Set();
    const from = [];
    for (const c of o.categories ?? PALEOART.categories) {
        for (const t of await categoryTreeFiles(c, ctx, o.depth ?? 3))
            files.add(t);
        from.push(`Category:${c.replace(/^Category:/, '')}`);
    }
    for (const t of o.templates ?? PALEOART.templates) {
        for (const f of await templateFiles(t, ctx))
            files.add(f);
        from.push(`Template:${t.replace(/^Template:/, '')}`);
    }
    if (!files.size)
        throw new Error(`no files found in ${from.join(', ')}: has Commons renamed them?`);
    return { fetched: new Date().toISOString().slice(0, 10), from, files: [...files].sort() };
}
/**
 * Checks a course's records offline: every record's fields, and none on the
 * saved inaccurate-paleoart list. `live` also asks Commons for every Commons
 * file's categories, for a file marked since the list was saved.
 */
export async function checkPictures(records, o = {}) {
    const problems = records.flatMap((r) => pictureProblems(r).map((problem) => ({ id: String(r.id), problem })));
    const paleoart = o.paleoart ? paleoartFlags(records, o.paleoart) : [];
    if (o.live) {
        const titles = new Map();
        for (const r of records) {
            const m = /^https:\/\/commons\.wikimedia\.org\/wiki\/(File:.+)$/.exec(r.sourceUrl ?? '');
            if (m && !r.outdated)
                titles.set(normalTitle(decodeURIComponent(m[1])), r.id);
        }
        for (const f of await commonsFiles([...titles.keys()], 400, o.live)) {
            const cat = f.categories?.find(isPaleoartCategory);
            const id = titles.get(normalTitle(f.title));
            if (cat && !paleoart.some((x) => x.id === id))
                paleoart.push({ id, title: f.title, problem: `${f.title} is in ${cat} on Commons now: pick another, or mark it outdated with the reason` });
        }
    }
    return { problems, paleoart };
}
/**
 * Categories list files alphabetically, so one keen photographer's series can
 * fill a whole sheet. Take every author's first picture, then every author's
 * second, and so on.
 */
export function spreadByAuthor(files) {
    const byAuthor = new Map();
    for (const f of files)
        byAuthor.set(f.author, [...(byAuthor.get(f.author) ?? []), f]);
    const out = [];
    for (let round = 0; out.length < files.length; round++)
        for (const list of byAuthor.values())
            if (list[round])
                out.push(list[round]);
    return out;
}
/**
 * Searches every source the spec names and writes a contact sheet,
 * <outDir>/index.html (and candidates.json): tap the pictures that clearly
 * show their subject (categories and searches are often loose), then paste
 * the JSON at the bottom into tools/photo-picks.json.
 */
export async function findCandidates(o) {
    const log = o.log ?? console.log;
    const perKey = o.perKey ?? 60;
    const minWidth = o.spec.minWidth ?? 1200;
    const outDir = o.outDir ?? join(o.dir, 'tools/candidates');
    const picks = readJson(paths(o).picks, []);
    const features = o.spec.features ?? {};
    const keys = new Set([...Object.keys(o.spec.categories ?? {}), ...Object.keys(features), ...Object.keys(o.spec.sources ?? {})]);
    const found = {};
    for (const key of keys) {
        const list = [];
        for (const cat of [...(o.spec.categories?.[key] ?? []), ...(features[key]?.categories ?? [])]) {
            try {
                list.push(...(await commons.search(cat, o, 500)).filter((f) => f.license && f.width >= minWidth));
            }
            catch (e) {
                (o.warn ?? console.warn)(`  ${cat}: ${e.message}`);
            }
        }
        const more = o.spec.sources?.[key] ?? {};
        for (const [src, q] of [[phylopic, more.phylopic], [inaturalist, more.inaturalist], [smithsonian, more.smithsonian]]) {
            if (!q)
                continue;
            try {
                list.push(...(await src.search(q, o, perKey)).filter((f) => f.license));
            }
            catch (e) {
                (o.warn ?? console.warn)(`  ${src.name} "${q}": ${e.message}`);
            }
        }
        const unique = [...new Map(list.map((f) => [f.pageUrl, f])).values()];
        found[key] = spreadByAuthor(unique).slice(0, perKey);
        log(`${key}: ${unique.length} usable, kept ${found[key].length}`);
    }
    mkdirSync(outDir, { recursive: true });
    writeJson(join(outDir, 'candidates.json'), found);
    writeFileSync(join(outDir, 'index.html'), contactSheet(found, picks, o.spec, o.title ?? 'Picture candidates'));
    return join(outDir, 'index.html');
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** The contact sheet: a grid per key; ticked pictures become picks in the box at the bottom, ids following on from the picks made. */
export function contactSheet(found, picks, spec, title) {
    const next = {};
    for (const p of picks) {
        const m = /^(.*)-(\d+)$/.exec(p.id);
        if (m)
            next[m[1]] = Math.max(next[m[1]] ?? 0, Number(m[2]));
    }
    const features = Object.fromEntries(Object.entries(spec.features ?? {}).map(([k, f]) => [k, f.genus]));
    const sections = Object.entries(found)
        .map(([key, files]) => `<h2>${esc(key)}</h2><div class="grid">${files
        .map((f) => `<label><input type="checkbox" data-key="${esc(key)}" data-kind="${f.kind ?? 'photo'}" value="${esc(JSON.stringify(f.ref))}"><img loading="lazy" src="${esc(f.thumbUrl)}"><span>${esc(f.source)} · ${esc(f.author)} · ${esc(f.licenseName)} · <a href="${esc(f.pageUrl)}" target="_blank">page</a></span></label>`)
        .join('')}</div>`)
        .join('');
    return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px system-ui;margin:16px;background:#222;color:#eee}h2{text-transform:capitalize}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
label{background:#333;padding:4px;border-radius:6px;cursor:pointer}label:has(input:checked){outline:3px solid #ffb347}input{display:none}img{width:100%;aspect-ratio:3/2;object-fit:contain;background:#ddd;display:block}span{font-size:11px;color:#aaa}a{color:#ffb347}
textarea{position:sticky;bottom:0;width:100%;height:120px;background:#111;color:#ffb347;font:12px monospace}</style>
<p>Pick the pictures that clearly show their subject, then add the JSON below to tools/photo-picks.json. Set "kind" where it is not a photograph (illustration, painting, reconstruction, ...).</p>
${sections}<textarea readonly></textarea>
<script>const next=${JSON.stringify(next)};const features=${JSON.stringify(features)};const field=${JSON.stringify(spec.field ?? 'about')};const ta=document.querySelector('textarea');
const paint=()=>{const n={...next};const o=[];for(const c of document.querySelectorAll('input:checked')){const k=c.dataset.key;n[k]=(n[k]??0)+1;const id=k+'-'+String(n[k]).padStart(2,'0');const ref=JSON.parse(c.value);const kind=c.dataset.kind==='photo'?{}:{kind:c.dataset.kind};o.push(features[k]?{id,...kind,...ref,genus:features[k],feature:k}:{id,...kind,...ref,[field]:field==='about'?'':k})}ta.value=JSON.stringify(o,null,2)};document.addEventListener('change',paint);paint();</script>`;
}
