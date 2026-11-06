// @vitest-environment happy-dom
// The picture record (didactics/pictures), its credit (didactics/photos), and
// the sources and tools that fill it (didactics/picture-sources,
// didactics/picture-tools), with each source's answer stood in by a fixture:
// the tests never reach the network.

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { el } from '../src/dom';
import { credit, creditsView } from '../src/photos';
import { commonsTitle, isLicenseId, licenceFrom, migratePicture, paleoartFlags, pictureProblems, type Picture } from '../src/pictures';
import { bhl, bhlFound, commons, inatAuthor, inaturalist, phylopic, plainText, smithsonian, sourceOf, type SourceContext } from '../src/picture-sources';
import { changesFor, checkPictures, fetchPictures, migrateFile, recolourSvg, spreadByAuthor, svgSize } from '../src/picture-tools';

const base: Picture = { id: 'trex-01', kind: 'reconstruction', width: 800, height: 600, author: 'A. Painter', license: 'CC-BY-SA-4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:T_rex.jpg', source: 'Wikimedia Commons' };

/** A fetch that answers from a table of URL patterns. */
function fakeFetch(routes: [RegExp, unknown][]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const target = String(url) + (init?.body ? `?${String(init.body)}` : '');
    const hit = routes.find(([re]) => re.test(target));
    if (!hit) return new Response('not found', { status: 404 });
    const body = hit[1];
    return typeof body === 'string' ? new Response(body) : Response.json(body);
  }) as typeof fetch;
}
const ctx = (routes: [RegExp, unknown][], env: Record<string, string> = {}): SourceContext => ({ userAgent: 'Test/0.1', fetch: fakeFetch(routes), env, warn: () => {} });

describe('licences', () => {
  it('reads every spelling the sources use, and refuses the rest', () => {
    const cases: [string, string | null][] = [
      ['Public domain', 'PD'], ['PD-USGov', 'PD'], ['CC0', 'CC0'], ['CC BY 2.0', 'CC-BY-2.0'], ['CC BY-SA 3.0', 'CC-BY-SA-3.0'], ['CC BY-SA 4.0', 'CC-BY-SA-4.0'],
      ['https://creativecommons.org/publicdomain/zero/1.0/', 'CC0'], ['https://creativecommons.org/publicdomain/mark/1.0/', 'PD'], ['https://creativecommons.org/licenses/by/3.0/', 'CC-BY-3.0'],
      ['cc-by', 'CC-BY-4.0'], ['cc-by-sa', 'CC-BY-SA-4.0'], ['cc0', 'CC0'], ['CC-BY-4.0', 'CC-BY-4.0'],
      ['Public domain. The BHL considers that this work is no longer under copyright protection.', 'PD'],
      ['CC BY-NC 2.0', null], ['CC BY-ND 4.0', null], ['CC BY-NC-SA 3.0', null], ['GFDL', null], ['CC BY-SA 2.5', null], ['', null], ['cc-by-nc', null],
      ['https://creativecommons.org/licenses/by-nc-sa/3.0/', null], ['http://creativecommons.org/licenses/by-nc/3.0/', null],
    ];
    for (const [text, id] of cases) expect(licenceFrom(text), text).toBe(id);
    for (const [, id] of cases) if (id) expect(isLicenseId(id)).toBe(true);
  });

  it('reads an author out of HTML', () => {
    expect(plainText('<a href="//commons.wikimedia.org/wiki/User:X">Jane &amp; Joe</a>')).toBe('Jane & Joe');
    expect(inatAuthor('(c) Jane Doe, some rights reserved (CC BY)')).toBe('Jane Doe');
    expect(inatAuthor('(c) x, no rights reserved', { name: 'X' })).toBe('x');
    expect(inatAuthor(undefined, { login: 'jd' })).toBe('jd');
  });
});

describe('picture records', () => {
  it('need a kind, and changes as lower-case words', () => {
    expect(pictureProblems(base)).toEqual([]);
    expect(pictureProblems({ ...base, kind: undefined })[0]).toMatch(/no kind/);
    expect(pictureProblems({ ...base, kind: 'cartoon' as Picture['kind'] })).toEqual(['unknown kind cartoon']);
    expect(pictureProblems({ ...base, changes: ['cropped', 'labels in English'] })).toEqual([]);
    expect(pictureProblems({ ...base, changes: [] })).toHaveLength(1);
    expect(pictureProblems({ ...base, changes: ['Cropped'] })).toHaveLength(1);
  });

  it('migrate old photo records without losing a field', () => {
    const old = { id: 'cumulus-01', genus: 'cumulus', width: 1, height: 1, author: 'A', license: 'PD', sourceUrl: 'https://x', source: 'NOAA', noMirror: true };
    const m = migratePicture(old);
    expect(m).toEqual({ ...old, kind: 'photo' });
    expect(Object.keys(m).slice(0, 2)).toEqual(['id', 'kind']);
    expect(pictureProblems(m as Picture)).toEqual([]);
    expect(migratePicture({ ...old, crop: [0, 0, 5, 5] }, 'scan')).toMatchObject({ kind: 'scan', changes: ['cropped'] });
    expect(migratePicture({ ...old, crop: [0, 0, 5, 5] })).not.toHaveProperty('crop');
    const done = { ...old, kind: 'painting' };
    expect(migratePicture(done)).toBe(done);
  });

  it('migrate a records file in place, once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pictures-'));
    const file = join(dir, 'photos.json');
    writeFileSync(file, JSON.stringify([{ id: 'a', width: 1, height: 1, author: 'A', license: 'PD', sourceUrl: 'https://x', source: 'S' }]));
    expect(migrateFile(file)).toBe(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))[0].kind).toBe('photo');
    expect(migrateFile(file)).toBe(0);
  });

  it('credit the kind and the changes', () => {
    expect(credit({ ...base, kind: 'photo' }).textContent).toBe('Photo: A. Painter · CC BY-SA 4.0 · Wikimedia Commons');
    expect(credit({ ...base, changes: ['cropped', 'recoloured'] }).textContent).toBe('Reconstruction: A. Painter · CC BY-SA 4.0 · Wikimedia Commons · cropped, recoloured');
    expect(credit({ ...base, kind: 'silhouette', source: 'PhyloPic' }).textContent).toMatch(/^Silhouette: /);
    const root = el('div');
    creditsView({ photos: [{ ...base, changes: ['cropped'] }, { ...base, id: 'p', kind: 'photo' }], name: () => 'T. rex' })(root, { go() {} } as never);
    expect([...root.querySelectorAll('.credit-list li')].map((li) => li.textContent)).toEqual([
      'T. rex reconstruction by A. Painter, CC BY-SA 4.0, via Wikimedia Commons (cropped)',
      'T. rex by A. Painter, CC BY-SA 4.0, via Wikimedia Commons',
    ]);
  });
});

describe('inaccurate paleoart', () => {
  const list = { fetched: '2026-11-06', from: ['Category:Inaccurate paleoart'], files: ['File:T rex.jpg'] };

  it('reads Commons titles from page links the way the API spells them', () => {
    expect(commonsTitle('https://commons.wikimedia.org/wiki/File:T_rex.jpg')).toBe('File:T rex.jpg');
    expect(commonsTitle('https://commons.wikimedia.org/wiki/File:%C3%89t%C3%A9_x.jpg')).toBe('File:Été x.jpg');
    expect(commonsTitle('https://www.flickr.com/photos/x/1')).toBeNull();
  });

  it('flags a record on the saved list, by any spelling of its title', () => {
    expect(paleoartFlags([base, { ...base, id: 'ok', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Good.jpg' }, { ...base, id: 'old', outdated: 'the 1854 idea, shown as history' }], list).map((f) => f.id)).toEqual(['trex-01']);
    expect(pictureProblems({ ...base, outdated: ' ' })).toEqual(['outdated should say why the picture is shown anyway']);
  });

  it('checks a course offline, and live against the file categories', async () => {
    const records = [base, { ...base, id: 'b', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Newly_bad.jpg' }, { id: 'c' }];
    const offline = await checkPictures(records as never, { paleoart: list });
    expect(offline.paleoart.map((f) => f.id)).toEqual(['trex-01']);
    expect(offline.problems.filter((p) => p.id === 'c').length).toBeGreaterThan(3);
    const live = ctx([[/commons/, { query: { pages: [{ title: 'File:Newly bad.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Newly_bad.jpg', width: 1, height: 1, extmetadata: {} }], categories: [{ title: 'Category:Inaccurate paleoart of theropods' }] }] } }]]);
    const both = await checkPictures(records as never, { paleoart: list, live });
    expect(both.paleoart.map((f) => f.id)).toEqual(['trex-01', 'b']);
  });
});

describe('sources', () => {
  it('name a source from the pick', () => {
    expect(sourceOf({ id: 'a', title: 'File:X.jpg' })?.name).toBe('Wikimedia Commons');
    expect(sourceOf({ id: 'a', phylopic: 'u' })?.name).toBe('PhyloPic');
    expect(sourceOf({ id: 'a', inaturalist: 1 })?.name).toBe('iNaturalist');
    expect(sourceOf({ id: 'a', bhl: 1 })?.key).toBe('bhl');
    expect(sourceOf({ id: 'a', smithsonian: 'x' })?.key).toBe('smithsonian');
    expect(sourceOf({ id: 'a', url: 'https://x' })?.key).toBe('url');
    expect(sourceOf({ id: 'a' })).toBeNull();
  });

  it('Commons: licence, author, upload host, categories across continuations', async () => {
    const page = { title: 'File:A b.jpg', imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/a/1024px-A.jpg?utm_source=x', url: 'https://upload.wikimedia.org/a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A_b.jpg', width: 3000, height: 2000, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Ann</a>' } } }], categories: [{ title: 'Category:Clouds' }] };
    let n = 0;
    const c: SourceContext = { userAgent: 'T', fetch: (async () => (n++ === 0 ? Response.json({ query: { pages: [page] }, continue: { clcontinue: '1|x' } }) : Response.json({ query: { pages: [{ title: 'File:A b.jpg', categories: [{ title: 'Category:Sky' }] }] } }))) as typeof fetch };
    const f = (await commons.resolve({ id: 'a', title: 'File:A_b.jpg' }, c))!;
    expect(f).toMatchObject({ license: 'CC-BY-SA-4.0', author: 'Ann', imageUrl: 'https://upload.wikimedia.org/a/1024px-A.jpg', categories: ['Category:Clouds', 'Category:Sky'], ref: { title: 'File:A b.jpg' } });
  });

  it('PhyloPic: a silhouette, its SVG, licence URL and attribution', async () => {
    const image = { uuid: 'abc-1', attribution: 'Scott Hartman', _links: { license: { href: 'https://creativecommons.org/licenses/by/3.0/' }, vectorFile: { href: 'https://images.phylopic.org/images/abc-1/vector.svg', sizes: '1536x768' }, rasterFiles: [{ href: 'https://images.phylopic.org/images/abc-1/raster/512x256.png', sizes: '512x256' }, { href: 'https://images.phylopic.org/images/abc-1/raster/1536x768.png', sizes: '1536x768' }], specificNode: { title: 'Tyrannosaurus rex' }, contributor: { title: 'Someone' } } };
    const f = (await phylopic.resolve({ id: 't', phylopic: 'abc-1' }, ctx([[/api\.phylopic\.org\/images\/abc-1/, image]])))!;
    expect(f).toMatchObject({ kind: 'silhouette', format: 'svg', license: 'CC-BY-3.0', author: 'Scott Hartman', width: 1536, height: 768, pageUrl: 'https://www.phylopic.org/images/abc-1', label: 'Tyrannosaurus rex' });
    const nc = (await phylopic.resolve({ id: 't', phylopic: 'abc-1' }, ctx([[/phylopic/, { ...image, attribution: null, _links: { ...image._links, license: { href: 'https://creativecommons.org/licenses/by-nc/3.0/' } } }]])))!;
    expect(nc.license).toBeNull();
    expect(nc.author).toBe('Someone');
  });

  it('PhyloPic search: asks for the build first, then the page with its items', async () => {
    const image = { uuid: 'abc-1', attribution: 'Fred Wierum', build: 562, _links: { license: { href: 'https://creativecommons.org/licenses/by/4.0/' }, vectorFile: { href: 'https://images.phylopic.org/images/abc-1/vector.svg', sizes: '1536x876' }, specificNode: { title: 'Tyrannosaurus' }, contributor: { title: 'Aiden Gauthier' } } };
    const found = await phylopic.search!('Tyrannosaurus', ctx([
      // The API refuses page or embed_items without build (400), so a route for that would hide the bug.
      [/images\?(?=.*build=562)(?=.*page=0)(?=.*embed_items=true)(?=.*filter_name=tyrannosaurus)/, { build: 562, _embedded: { items: [image] } }],
      [/images\?(?!.*page)(?!.*embed_items)(?=.*filter_name=tyrannosaurus)/, { build: 562, totalItems: 1, _links: {} }],
    ]), 5);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ author: 'Fred Wierum', license: 'CC-BY-4.0', width: 1536, height: 876, ref: { phylopic: 'abc-1' } });
  });

  it('iNaturalist: the photo asked for, large, its own licence', async () => {
    const obs = { id: 99, user: { login: 'jd' }, taxon: { name: 'Amanita muscaria', preferred_common_name: 'Fly Agaric' }, photos: [
      { id: 1, license_code: 'cc-by-nc', attribution: '(c) jd, some rights reserved (CC BY-NC)', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg', original_dimensions: { width: 2048, height: 1536 } },
      { id: 2, license_code: 'cc-by', attribution: '(c) Jane Doe, some rights reserved (CC BY)', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/square.jpeg', original_dimensions: { width: 2048, height: 1536 } },
    ] };
    const c = ctx([[/observations\/99/, { results: [obs] }]]);
    const f = (await inaturalist.resolve({ id: 'f', inaturalist: 99, photo: 2 }, c))!;
    expect(f).toMatchObject({ license: 'CC-BY-4.0', author: 'Jane Doe', imageUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/large.jpeg', pageUrl: 'https://www.inaturalist.org/photos/2', width: 1024, height: 768, ref: { inaturalist: '99', photo: '2' } });
    expect((await inaturalist.resolve({ id: 'f', inaturalist: 99 }, c))!.license).toBeNull();
  });

  it('BHL: public domain from the item, authors from the title; with no key, the pick says', async () => {
    const routes: [RegExp, unknown][] = [
      [/GetPageMetadata/, { Status: 'ok', Result: [{ PageID: 5, ItemID: 7, PageUrl: 'https://www.biodiversitylibrary.org/page/5', FullSizeImageUrl: 'https://www.biodiversitylibrary.org/pageimage/5', ThumbnailUrl: 'https://www.biodiversitylibrary.org/pagethumb/5' }] }],
      [/GetItemMetadata/, { Result: [{ ItemID: 7, TitleID: 9, Year: '1885', CopyrightStatus: 'Public domain. The BHL considers that this work is no longer under copyright protection.' }] }],
      [/GetTitleMetadata/, { Result: [{ FullTitle: 'Fungi of Britain', Authors: [{ Name: 'Cooke, M. C.,' }] }] }],
    ];
    const f = (await bhl.resolve({ id: 'b', bhl: 5 }, ctx(routes, { BHL_API_KEY: 'k' })))!;
    expect(f).toMatchObject({ license: 'PD', author: 'Cooke, M. C.', label: 'Fungi of Britain, 1885', kind: 'illustration', imageUrl: 'https://www.biodiversitylibrary.org/pageimage/5' });
    expect(bhlFound({ PageID: 1 }, { LicenseUrl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/' }, null).license).toBeNull();
    await expect(bhl.resolve({ id: 'b', bhl: 5 }, ctx([]))).rejects.toThrow(/BHL_API_KEY/);
    expect((await bhl.resolve({ id: 'b', bhl: 5, license: 'PD', author: 'M. C. Cooke' }, ctx([])))!).toMatchObject({ license: 'PD', author: 'M. C. Cooke' });
  });

  it('Smithsonian: CC0 media only, the maker as author', async () => {
    const row = { id: 'nmnh_1', title: 'Trilobite', content: { descriptiveNonRepeating: { record_link: 'http://n2t.net/ark:/65665/1', data_source: 'NMNH - Paleobiology Dept.', online_media: { mediaCount: 1, media: [{ type: 'Images', idsId: 'NMNH-1', content: 'https://ids.si.edu/ids/deliveryService?id=NMNH-1', usage: { access: 'CC0' }, width: 8640, height: 5760 }] } }, indexedStructured: { online_media_type: ['Images'] }, freetext: { name: [{ label: 'Collector', content: 'X' }, { label: 'Photographer', content: 'Chip Clark' }] } } };
    const f = (await smithsonian.resolve({ id: 's', smithsonian: 'nmnh_1' }, ctx([[/content\/nmnh_1/, { response: row }]], { SI_API_KEY: 'k' })))!;
    expect(f).toMatchObject({ license: 'CC0', author: 'Chip Clark', pageUrl: 'https://n2t.net/ark:/65665/1', imageUrl: 'https://ids.si.edu/ids/deliveryService?id=NMNH-1&max=1024', ref: { smithsonian: 'nmnh_1', media: 'NMNH-1' }, width: 1024, height: 683 });
    const closed = { ...row, content: { ...row.content, descriptiveNonRepeating: { ...row.content.descriptiveNonRepeating, online_media: { media: [{ type: 'Images', idsId: 'Z', usage: { access: 'Usage conditions apply' } }] } }, freetext: {} } };
    const g = (await smithsonian.resolve({ id: 's', smithsonian: 'nmnh_1' }, ctx([[/content/, { response: closed }]], { SI_API_KEY: 'k' })))!;
    expect(g.license).toBeNull();
    expect(g.author).toBe('NMNH - Paleobiology Dept.');
    // Search: the index says images, but NMNH often withholds them from the record; those are skipped.
    const withheld = { id: 'nmnh_2', title: 'Trilobite', content: { descriptiveNonRepeating: { metadata_usage: { access: 'CC0' } }, indexedStructured: { online_media_type: ['Images'] }, freetext: {} } };
    const search = ctx([[/search\?(?=.*rows=1000&)/, { response: { rowCount: 2, rows: [withheld, row] } }]], { SI_API_KEY: 'k' });
    expect((await smithsonian.search!('trilobite', search, 5)).map((x) => x.ref.smithsonian)).toEqual(['nmnh_1']);
  });
});

describe('tools', () => {
  it('record the changes the pipeline makes', () => {
    expect(changesFor({ id: 'a', crop: [0, 0, 1, 1], fill: '#333' })).toEqual(['cropped', 'recoloured']);
    expect(changesFor({ id: 'a', changes: ['labelled'] })).toEqual(['labelled']);
  });

  it('recolour and measure an SVG', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 768"><path fill="#000" d="M0 0h1v1z"/></svg>';
    expect(recolourSvg(svg, '#7a3b8f')).toContain('<style>path,polygon,circle,ellipse,rect,g{fill:#7a3b8f}</style><path');
    expect(() => recolourSvg(svg, 'red;}*{x')).toThrow();
    expect(svgSize(svg)).toEqual([1536, 768]);
    expect(svgSize('<svg width="20" height="10">')).toEqual([20, 10]);
  });

  it('spread a contact sheet across authors', () => {
    expect(spreadByAuthor([{ author: 'a', n: 1 }, { author: 'a', n: 2 }, { author: 'b', n: 3 }]).map((f) => f.n)).toEqual([1, 3, 2]);
  });

  it('fetch picks: kind, course fields, changes; refuse a bad licence and marked paleoart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'course-'));
    mkdirSync(join(dir, 'tools'));
    mkdirSync(join(dir, 'src/data'), { recursive: true });
    writeFileSync(join(dir, 'tools/photo-picks.json'), JSON.stringify([
      { id: 'trex', phylopic: 'abc', fill: '#552255', about: 'Tyrannosaurus' },
      { id: 'nc', phylopic: 'nc' },
      { id: 'old-art', title: 'File:Old.jpg', kind: 'reconstruction' },
      { id: 'nothing' },
    ]));
    const image = (lic: string) => ({ uuid: 'abc', attribution: 'S. H.', _links: { license: { href: lic }, vectorFile: { href: 'https://images.phylopic.org/abc.svg', sizes: '100x50' } } });
    const old = { query: { pages: [{ title: 'File:Old.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/old.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Old.jpg', width: 1, height: 1, extmetadata: { LicenseShortName: { value: 'Public domain' } } }], categories: [{ title: 'Category:Inaccurate paleoart' }] }] } };
    const c = ctx([
      [/images\/abc\?/, image('https://creativecommons.org/publicdomain/zero/1.0/')],
      [/images\/nc\?/, image('https://creativecommons.org/licenses/by-nc/3.0/')],
      [/abc\.svg/, '<svg viewBox="0 0 100 50"><path d="M0 0"/></svg>'],
      [/commons/, old],
    ]);
    const r = await fetchPictures({ dir, ...c, log: () => {} });
    expect(r.records).toBe(1);
    expect(r.failed.map((f) => f.split(':')[0])).toEqual(['nc', 'old-art', 'nothing']);
    expect(r.failed[1]).toMatch(/inaccurate paleoart/);
    const [rec] = JSON.parse(readFileSync(join(dir, 'src/data/photos.json'), 'utf8'));
    expect(rec).toEqual({ id: 'trex', kind: 'silhouette', about: 'Tyrannosaurus', file: 'photos/trex.svg', width: 100, height: 50, author: 'S. H.', license: 'CC0', sourceUrl: 'https://www.phylopic.org/images/abc', source: 'PhyloPic', changes: ['recoloured'] });
    expect(readFileSync(join(dir, 'public/photos/trex.svg'), 'utf8')).toContain('fill:#552255');
    expect(existsSync(join(dir, 'public/photos/nc.svg'))).toBe(false);
  });
});
