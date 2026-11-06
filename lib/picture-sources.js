// Where a course's pictures come from, read in Node by the picture tools
// (didactics/picture-tools, bin/didactics-pictures.mjs). Each source turns a
// pick (a line of a course's tools/photo-picks.json) into the file to
// download, the page to credit and link, the author and the licence, read
// from the source at the moment of download; most can also search, for the
// contact sheet a person picks from.
//
//   Wikimedia Commons  { "title": "File:Foo.jpg" }           (or "commons")
//   PhyloPic           { "phylopic": "<image uuid>" }          silhouettes, kept as SVG
//   iNaturalist        { "inaturalist": <observation id>, "photo"?: <photo id> }
//   BHL                { "bhl": <page id> }                    BHL_API_KEY for the licence, else give it
//   Smithsonian        { "smithsonian": "<record id>", "media"?: "<ids id>" }  SI_API_KEY (DEMO_KEY otherwise)
//   anywhere else      { "url": "<file>", "page", "source", "author", "license" }  NOAA, USGS, Flickr, an archive
//
// Every request names the course in its User-Agent (Commons asks every
// client to) and goes one at a time, waiting and trying again when a source
// says slow down. Cloud machines cannot reach most of these hosts; the tools
// run on a person's own computer.
import { isKind, licenceFrom, normalTitle } from "./pictures.js";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Fetch politely: when a source says slow down (429, or a 5xx), wait and try
 * again, a little longer each time. `body` posts a form.
 */
export async function politeFetch(url, ctx, body, tries = 8) {
    const f = ctx.fetch ?? fetch;
    for (let i = 0;; i++) {
        const res = await f(url, { method: body ? 'POST' : 'GET', body, headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json, image/*, */*' } });
        if (res.ok || i >= tries - 1 || (res.status !== 429 && res.status < 500))
            return res;
        const after = Number(res.headers.get('retry-after')) || 0;
        await wait(Math.max(after * 1000, (ctx.fetch ? 1 : 1000) * 2 ** i));
    }
}
async function getJson(url, ctx, what) {
    const res = await politeFetch(url, ctx);
    if (!res.ok)
        throw new Error(`${what} answered ${res.status} for ${url.replace(/api_?key=[^&]+/i, 'api_key=…')}`);
    return res.json();
}
/** Sources give authors as HTML, often a link to a user page. */
export function plainText(html) {
    return (html ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*-*\s*-- ?\S*\s+\d\d:\d\d, \d+ \w+ \d{4} \(UTC\)$/, '') // a talk-page signature
        .trim();
}
const https = (url) => url.replace(/^http:\/\//, 'https://');
// ---------------------------------------------------------------- Commons
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
async function commonsCall(ctx, params) {
    // Posted, because fifty long file titles make a URL too long for a GET.
    const res = await politeFetch(COMMONS_API, ctx, new URLSearchParams({ format: 'json', formatversion: '2', ...params }));
    if (!res.ok)
        throw new Error(`Commons answered ${res.status} for ${params.action} ${params.titles ?? params.cmtitle ?? params.eititle ?? ''}`);
    return res.json();
}
/**
 * Commons hands out thumbnails on thumb.wikimedia.org, which some networks do
 * not reach. upload.wikimedia.org serves the same path, so use that, without
 * the tracking parameters.
 */
export const thumbHost = (url) => url.replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/').replace(/\?utm_[^#]*$/, '');
/** A Commons page from the API's imageinfo answer. */
export function commonsFound(page, categories) {
    const ii = page.imageinfo?.[0];
    if (!ii)
        return null;
    const meta = ii.extmetadata ?? {};
    const short = meta.LicenseShortName?.value ?? '';
    return {
        source: 'Wikimedia Commons',
        ref: { title: page.title },
        title: page.title,
        label: page.title.replace(/^File:/, ''),
        imageUrl: thumbHost(ii.thumburl ?? ii.url),
        thumbUrl: thumbHost(ii.thumburl ?? ii.url),
        pageUrl: ii.descriptionurl,
        author: plainText(meta.Artist?.value) || 'Unknown',
        license: licenceFrom(short),
        licenseName: short,
        width: ii.width,
        height: ii.height,
        format: 'raster',
        categories,
    };
}
/**
 * Read up to 50 files at a time: licence, author, page, a copy `thumbWidth`
 * wide, size and categories (so a file Commons marks as inaccurate paleoart
 * is seen at the moment it is fetched).
 */
export async function commonsFiles(titles, thumbWidth, ctx) {
    const out = [];
    for (let i = 0; i < titles.length; i += 50) {
        const pages = new Map();
        const cats = new Map();
        let cont;
        do {
            const data = await commonsCall(ctx, {
                action: 'query',
                titles: titles.slice(i, i + 50).join('|'),
                prop: 'imageinfo|categories',
                iiprop: 'url|size|extmetadata',
                iiurlwidth: String(thumbWidth),
                cllimit: 'max',
                ...(cont ?? {}),
            });
            for (const page of data.query?.pages ?? []) {
                if (page.imageinfo && !pages.has(page.title))
                    pages.set(page.title, page);
                cats.set(page.title, [...(cats.get(page.title) ?? []), ...(page.categories ?? []).map((c) => c.title)]);
            }
            cont = data.continue;
        } while (cont);
        for (const [title, page] of pages) {
            const f = commonsFound(page, cats.get(title) ?? []);
            if (f)
                out.push(f);
        }
    }
    return out;
}
/** Every file directly in a category, up to `limit`. */
export async function categoryFiles(category, ctx, limit = 500) {
    return (await categoryMembers(category, 'file', ctx, limit)).map((m) => m.title);
}
async function categoryMembers(category, type, ctx, limit = 5000) {
    const out = [];
    let cont;
    do {
        const data = await commonsCall(ctx, {
            action: 'query',
            list: 'categorymembers',
            cmtitle: category.startsWith('Category:') ? category : `Category:${category}`,
            cmtype: type,
            cmlimit: '500',
            ...(cont ? { cmcontinue: cont } : {}),
        });
        out.push(...(data.query?.categorymembers ?? []));
        cont = data.continue?.cmcontinue;
    } while (cont && out.length < limit);
    return out.slice(0, limit);
}
/** Files in a category and its subcategories, `depth` levels down. */
export async function categoryTreeFiles(category, ctx, depth = 3) {
    const files = new Set();
    const seen = new Set();
    let level = [category.startsWith('Category:') ? category : `Category:${category}`];
    for (let d = 0; d <= depth && level.length; d++) {
        const next = [];
        for (const cat of level) {
            if (seen.has(cat))
                continue;
            seen.add(cat);
            for (const m of await categoryMembers(cat, 'file|subcat', ctx)) {
                if (m.ns === 14)
                    next.push(m.title);
                else if (m.ns === 6)
                    files.add(normalTitle(m.title));
            }
        }
        level = next;
    }
    return [...files];
}
/** Files that use a template (a review tag such as {{Inaccurate paleoart}}). */
export async function templateFiles(template, ctx) {
    const out = [];
    let cont;
    do {
        const data = await commonsCall(ctx, {
            action: 'query',
            list: 'embeddedin',
            eititle: template.startsWith('Template:') ? template : `Template:${template}`,
            einamespace: '6',
            eilimit: '500',
            ...(cont ? { eicontinue: cont } : {}),
        });
        out.push(...(data.query?.embeddedin ?? []).map((m) => normalTitle(m.title)));
        cont = data.continue?.eicontinue;
    } while (cont);
    return out;
}
/** Where Commons keeps its paleoart reviewers' verdicts. */
export const PALEOART = { categories: ['Inaccurate paleoart'], templates: ['Inaccurate paleoart'] };
/** A Commons category name that marks a file as inaccurate paleoart. */
export const isPaleoartCategory = (c) => /inaccurate pal(a)?eoart/i.test(c);
export const commons = {
    key: 'commons',
    name: 'Wikimedia Commons',
    async resolve(pick, ctx) {
        const title = String(pick.commons ?? pick.title);
        const [f] = await commonsFiles([normalTitle(title)], ctx.width ?? 1024, ctx);
        return f ?? null;
    },
    async search(category, ctx, limit) {
        const titles = (await categoryFiles(category, ctx, 500)).filter((t) => /\.(jpe?g|png|webp|tiff?)$/i.test(t));
        return (await commonsFiles(titles, 400, ctx)).slice(0, limit);
    },
};
// ---------------------------------------------------------------- PhyloPic
const PHYLOPIC_API = 'https://api.phylopic.org';
/** A PhyloPic image from the API's answer (the image with its links). */
export function phylopicFound(image) {
    const links = image._links ?? {};
    const raster = [...(links.rasterFiles ?? [])].sort((a, b) => size(b.sizes)[0] - size(a.sizes)[0]);
    const [w, h] = raster.length ? size(raster[0].sizes) : size(links.vectorFile?.sizes);
    const lic = links.license?.href ?? '';
    const name = links.specificNode?.title ?? image._embedded?.specificNode?.names?.[0]?.map((n) => n.text).join(' ') ?? image.uuid;
    return {
        source: 'PhyloPic',
        ref: { phylopic: String(image.uuid) },
        label: name,
        imageUrl: links.vectorFile?.href ?? raster[0]?.href,
        thumbUrl: links.thumbnailFiles?.[0]?.href ?? raster[raster.length - 1]?.href ?? links.vectorFile?.href,
        pageUrl: `https://www.phylopic.org/images/${image.uuid}`,
        author: plainText(image.attribution) || links.contributor?.title || image._embedded?.contributor?.name || 'Unknown',
        license: licenceFrom(lic),
        licenseName: lic,
        width: w,
        height: h,
        format: links.vectorFile?.href ? 'svg' : 'raster',
        kind: 'silhouette',
    };
}
function size(s) {
    const m = /(\d+)x(\d+)/.exec(s ?? '');
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}
export const phylopic = {
    key: 'phylopic',
    name: 'PhyloPic',
    async resolve(pick, ctx) {
        // Without ?build the API redirects to the current build, which fetch follows.
        const image = await getJson(`${PHYLOPIC_API}/images/${encodeURIComponent(String(pick.phylopic))}?embed_contributor=true&embed_specificNode=true`, ctx, 'PhyloPic');
        return phylopicFound(image);
    },
    async search(name, ctx, limit) {
        // A page (and embed_items, which needs one) is refused without ?build, so
        // ask once without either: the answer carries the current build.
        const q = new URLSearchParams({ filter_name: name.toLowerCase(), filter_license_nc: 'false' });
        const { build } = await getJson(`${PHYLOPIC_API}/images?${q}`, ctx, 'PhyloPic');
        q.set('build', String(build));
        q.set('page', '0');
        q.set('embed_items', 'true');
        const data = await getJson(`${PHYLOPIC_API}/images?${q}`, ctx, 'PhyloPic');
        return (data._embedded?.items ?? []).slice(0, limit).map(phylopicFound);
    },
};
// ---------------------------------------------------------------- iNaturalist
const INAT_API = 'https://api.inaturalist.org/v1';
/** "(c) Jane Doe, some rights reserved (CC BY)" → "Jane Doe". */
export function inatAuthor(attribution, user) {
    const m = /^\(c\)\s*(.+?),\s*(?:some|no|all) rights reserved/i.exec(attribution ?? '');
    return m?.[1]?.trim() || user?.name?.trim() || user?.login || 'Unknown';
}
/** A photo of an iNaturalist observation. iNaturalist's CC licences are version 4.0. */
export function inatFound(obs, photo, width = 1024) {
    const sized = (s) => String(photo.url).replace(/\/square\.(\w+)/, `/${s}.$1`);
    const dims = photo.original_dimensions ?? {};
    const scale = dims.width ? Math.min(1, (width > 1024 ? 2048 : 1024) / Math.max(dims.width, dims.height)) : 1;
    return {
        source: 'iNaturalist',
        ref: { inaturalist: String(obs.id), photo: String(photo.id) },
        label: [obs.taxon?.preferred_common_name, obs.taxon?.name].filter(Boolean).join(', ') || `observation ${obs.id}`,
        imageUrl: sized(width > 1024 ? 'original' : 'large'),
        thumbUrl: sized('medium'),
        pageUrl: `https://www.inaturalist.org/photos/${photo.id}`,
        author: inatAuthor(photo.attribution, obs.user),
        license: licenceFrom(photo.license_code),
        licenseName: photo.license_code ?? 'all rights reserved',
        width: Math.round((dims.width ?? 0) * scale),
        height: Math.round((dims.height ?? 0) * scale),
        format: 'raster',
        kind: 'photo',
    };
}
export const inaturalist = {
    key: 'inaturalist',
    name: 'iNaturalist',
    async resolve(pick, ctx) {
        const data = await getJson(`${INAT_API}/observations/${encodeURIComponent(String(pick.inaturalist))}`, ctx, 'iNaturalist');
        const obs = data.results?.[0];
        if (!obs)
            return null;
        const photo = pick.photo ? obs.photos?.find((p) => String(p.id) === String(pick.photo)) : obs.photos?.[0];
        return photo ? inatFound(obs, photo, ctx.width) : null;
    },
    async search(taxon, ctx, limit) {
        const q = new URLSearchParams({ taxon_name: taxon, photos: 'true', photo_license: 'cc0,cc-by,cc-by-sa', quality_grade: 'research', order_by: 'votes', per_page: String(Math.min(limit, 200)) });
        const data = await getJson(`${INAT_API}/observations?${q}`, ctx, 'iNaturalist');
        const out = [];
        for (const obs of data.results ?? [])
            for (const p of obs.photos ?? [])
                out.push(inatFound(obs, p, ctx.width));
        return out.filter((f) => f.license).slice(0, limit);
    },
};
// ---------------------------------------------------------------- Biodiversity Heritage Library
const BHL_API = 'https://www.biodiversitylibrary.org/api3';
/**
 * A BHL page, its book (item) and title, as the API gives them. Most of
 * BHL is public domain; books still in copyright are often CC BY-NC-SA,
 * which is refused.
 */
export function bhlFound(page, item, title) {
    const status = String(item?.CopyrightStatus ?? '');
    const license = /^(public domain|no known copyright)/i.test(status) ? 'PD' : licenceFrom(item?.LicenseUrl);
    const authors = (title?.Authors ?? []).map((a) => String(a.Name).replace(/,\s*$/, '')).filter(Boolean);
    const book = [title?.FullTitle, item?.Year].filter(Boolean).join(', ');
    return {
        source: 'Biodiversity Heritage Library',
        ref: { bhl: String(page.PageID) },
        label: book || `page ${page.PageID}`,
        imageUrl: https(page.FullSizeImageUrl ?? `https://www.biodiversitylibrary.org/pageimage/${page.PageID}`),
        thumbUrl: https(page.ThumbnailUrl ?? `https://www.biodiversitylibrary.org/pagethumb/${page.PageID}`),
        pageUrl: https(page.PageUrl ?? `https://www.biodiversitylibrary.org/page/${page.PageID}`),
        author: authors.join('; ') || 'Unknown',
        license,
        licenseName: status || item?.LicenseUrl || 'unknown',
        width: 0,
        height: 0,
        format: 'raster',
        kind: 'illustration',
    };
}
export const bhl = {
    key: 'bhl',
    name: 'Biodiversity Heritage Library',
    async resolve(pick, ctx) {
        const key = (ctx.env ?? process.env).BHL_API_KEY;
        const id = encodeURIComponent(String(pick.bhl));
        if (!key) {
            // No key: the page image is still there, but its licence must come from the pick.
            (ctx.warn ?? console.warn)(`${pick.id}: no BHL_API_KEY, so the licence and author come from the pick`);
            if (!pick.license || !pick.author)
                throw new Error(`${pick.id}: set BHL_API_KEY, or give "license" and "author" read from the book's page`);
            return { ...bhlFound({ PageID: pick.bhl }, null, null), license: licenceFrom(String(pick.license)), licenseName: String(pick.license), author: String(pick.author) };
        }
        const q = (op, extra) => `${BHL_API}?op=${op}&${extra}&format=json&apikey=${encodeURIComponent(key)}`;
        const page = (await getJson(q('GetPageMetadata', `pageid=${id}&ocr=f&names=f`), ctx, 'BHL')).Result?.[0];
        if (!page)
            return null;
        const item = (await getJson(q('GetItemMetadata', `id=${page.ItemID}&pages=f&ocr=f&parts=f`), ctx, 'BHL')).Result?.[0];
        const title = item?.TitleID ? (await getJson(q('GetTitleMetadata', `id=${item.TitleID}&items=f`), ctx, 'BHL')).Result?.[0] : null;
        return bhlFound(page, item, title);
    },
};
// ---------------------------------------------------------------- Smithsonian Open Access
const SI_API = 'https://api.si.edu/openaccess/api/v1.0';
const CREATOR = /^(artist|photographer|creator|maker|illustrator|author|engraver|designer|painter)/i;
/**
 * A Smithsonian Open Access record and one of its images. Only CC0 media are
 * open access; everything else in the record is refused.
 */
export function smithsonianFound(row, mediaId, width = 1024) {
    const dnr = row.content?.descriptiveNonRepeating ?? {};
    const images = (dnr.online_media?.media ?? []).filter((m) => m.type === 'Images');
    const media = mediaId ? images.find((m) => m.idsId === mediaId || m.content?.includes(mediaId)) : images.find((m) => m.usage?.access === 'CC0') ?? images[0];
    if (!media)
        return null;
    const idsId = media.idsId ?? /[?&]id=([^&]+)/.exec(media.content ?? '')?.[1];
    const names = (row.content?.freetext?.name ?? []).filter((n) => CREATOR.test(n.label ?? ''));
    const access = media.usage?.access ?? dnr.metadata_usage?.access ?? '';
    // The delivery service's `max` bounds the longer side.
    const scale = media.width && media.height ? Math.min(1, width / Math.max(media.width, media.height)) : 0;
    return {
        source: 'Smithsonian Open Access',
        ref: { smithsonian: String(row.id), media: String(idsId) },
        label: row.title ?? dnr.title?.content ?? row.id,
        imageUrl: `https://ids.si.edu/ids/deliveryService?id=${idsId}&max=${width}`,
        thumbUrl: `https://ids.si.edu/ids/deliveryService?id=${idsId}&max=400`,
        pageUrl: https(dnr.record_link ?? `https://collections.si.edu/search/detail/${row.id}`),
        author: names.map((n) => plainText(n.content)).join('; ') || dnr.data_source || 'Smithsonian Institution',
        license: access === 'CC0' ? 'CC0' : null,
        licenseName: access || 'not open access',
        width: Math.round((media.width ?? 0) * scale),
        height: Math.round((media.height ?? 0) * scale),
        format: 'raster',
    };
}
const siKey = (ctx) => {
    const key = (ctx.env ?? process.env).SI_API_KEY;
    if (!key)
        (ctx.warn ?? console.warn)('no SI_API_KEY (api.data.gov): using DEMO_KEY, which allows few requests an hour');
    return key || 'DEMO_KEY';
};
export const smithsonian = {
    key: 'smithsonian',
    name: 'Smithsonian Open Access',
    async resolve(pick, ctx) {
        const data = await getJson(`${SI_API}/content/${encodeURIComponent(String(pick.smithsonian))}?api_key=${siKey(ctx)}`, ctx, 'Smithsonian');
        return data.response ? smithsonianFound(data.response, pick.media, ctx.width) : null;
    },
    async search(query, ctx, limit) {
        // The index lists records as having images that come without them: NMNH
        // withholds media that is not CC0, so of 1000 "trilobite" hits two had
        // open images, at rows 195 and 196. Ask for the most the API gives (1000,
        // about 3 MB) in one call, which also spares DEMO_KEY's hourly limit.
        const q = new URLSearchParams({ q: `${query} AND online_media_type:"Images"`, rows: '1000', api_key: siKey(ctx) });
        const data = await getJson(`${SI_API}/search?${q}`, ctx, 'Smithsonian');
        return (data.response?.rows ?? []).map((r) => smithsonianFound(r, undefined, ctx.width)).filter((f) => !!f?.license).slice(0, limit);
    },
};
// ---------------------------------------------------------------- anywhere else
/** A file named by its URL: the pick gives the page, source, author and licence read by a person. */
export const direct = {
    key: 'url',
    name: 'a direct link',
    async resolve(pick) {
        for (const k of ['page', 'source', 'author', 'license'])
            if (!pick[k])
                throw new Error(`${pick.id}: a "url" pick needs "${k}" too`);
        return {
            source: String(pick.source),
            ref: { url: String(pick.url), page: String(pick.page), source: String(pick.source), author: String(pick.author), license: String(pick.license) },
            label: String(pick.url),
            imageUrl: String(pick.url),
            thumbUrl: String(pick.url),
            pageUrl: String(pick.page),
            author: String(pick.author),
            license: licenceFrom(String(pick.license)),
            licenseName: String(pick.license),
            width: 0,
            height: 0,
            format: /\.svg(\?|$)/i.test(String(pick.url)) ? 'svg' : 'raster',
        };
    },
};
/** Every source, by the pick field that names it. */
export const SOURCES = [commons, phylopic, inaturalist, bhl, smithsonian, direct];
/** The source a pick names, or null. A plain `title` is Commons, as picks always were. */
export function sourceOf(pick) {
    if (pick.title !== undefined)
        return commons;
    return SOURCES.find((s) => pick[s.key] !== undefined) ?? null;
}
/** The kind a pick will be recorded as: its own, else the source's suggestion, else photo. */
export const kindFor = (pick, found) => (isKind(pick.kind) ? pick.kind : found.kind ?? 'photo');
