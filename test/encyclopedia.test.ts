// @vitest-environment happy-dom
// The encyclopedia: entries read from files, found by name, linked from
// lesson text, checked, and shown as a list and as pages.

import { describe, expect, it } from 'vitest';
import { closeFootnote } from '../src/footnote';
import { encyclopediaProblems, encyclopediaView, entryIndex, readEntries, useEncyclopedia, type EncyclopediaData } from '../src/encyclopedia';
import { glossaryView } from '../src/glossary';
import { prose } from '../src/lesson';

const data = (): EncyclopediaData => ({
  courses: {
    geology: { title: 'Geology', icon: 'icons/icon.svg', lessons: { siccar: 'The rock at Siccar Point', basalt: 'Basalt' } },
    astronomy: { title: 'Astronomy', icon: 'icons/icon.svg', lessons: { parallax: 'Parallax' } },
  },
  files: {
    'encyclopedia/geology.json': {
      course: { line: 'How to read rock.', people: ['james-hutton'], ideas: ['deep-time'], tables: [{ title: 'Eras', columns: ['Era', 'Began'], rows: [['Cenozoic', '66 Ma']] }] },
      entries: {
        'james-hutton': {
          kind: 'person', title: 'James Hutton', dates: '1726–1797', also: ['Hutton'],
          line: 'Edinburgh farmer who read [[deep time]] in the rocks.',
          text: ['He saw that rocks are made and unmade, over and over. The gap at Siccar Point showed it.'],
          matters: 'Time stopped being short.',
          see: ['deep-time'],
          learn: [{ course: 'geology', lesson: 'siccar', for: 'Read the gap' }],
          wikipedia: 'James_Hutton',
        },
        'deep-time': {
          kind: 'idea', title: 'Deep time', also: ['geologic time'],
          line: 'The Earth is billions of years old.',
          text: ['Far older than anyone guessed, as [[Hutton]] saw; the stars agree, as [[parallax|@parallax]] helped show.'],
          learn: [{ course: 'astronomy', lesson: 'parallax' }],
        },
      },
    },
    'encyclopedia/astronomy.json': {
      entries: {
        parallax: { kind: 'idea', title: 'Parallax', line: 'A near thing shifts against far ones as you move.', text: ['Hold up a thumb.'] },
      },
    },
  },
});

describe('encyclopedia', () => {
  it('reads every file, with a course entry for each file that has one', () => {
    const all = readEntries(data());
    expect(all.map((e) => e.id).sort()).toEqual(['deep-time', 'geology', 'james-hutton', 'parallax']);
    expect(all.find((e) => e.id === 'geology')).toMatchObject({ kind: 'course', title: 'Geology', home: 'geology' });
  });

  it('finds an entry by title, other name, plural, any case', () => {
    const idx = entryIndex(readEntries(data()));
    expect(idx.byName('hutton')?.id).toBe('james-hutton');
    expect(idx.byName('Geologic Time')?.id).toBe('deep-time');
    expect(idx.byName('parallaxes')?.id).toBe('parallax');
    expect(idx.byName('basalt')).toBeUndefined();
    expect(idx.byName('the parallax')?.id).toBe('parallax');
    expect(idx.linkedFrom('james-hutton').map((e) => e.id)).toEqual(['deep-time', 'geology']);
  });

  it('finds nothing wrong with good files, and says what is wrong with bad ones', () => {
    expect(encyclopediaProblems(data())).toEqual([]);
    const bad = data();
    const g = bad.files['encyclopedia/geology.json'];
    g.entries['james-hutton'].see = ['nobody'];
    g.entries['james-hutton'].learn = [{ course: 'geology', lesson: 'nowhere' }, { course: 'cooking', lesson: 'x' }];
    g.entries['deep-time'].text = ['A link to [[nothing at all]].', 'word '.repeat(300)];
    g.entries['deep-time'].wikipedia = 'https://en.wikipedia.org/wiki/Deep_time';
    bad.files['encyclopedia/astronomy.json'].entries['james-hutton'] = { kind: 'person', title: 'Another', line: 'x', text: ['x'] };
    const p = encyclopediaProblems(bad).join('\n');
    for (const s of ['see "nobody"', 'no lesson "nowhere"', 'no course "cooking"', '[[nothing at all]] names no entry', 'past 220 words', 'wikipedia should be', 'also in', 'a person needs dates']) expect(p).toContain(s);
  });

  it('turns [[words]] in lesson text into a link that opens a card, and leaves colour markup alone', () => {
    const enc = useEncyclopedia({ data: data(), course: 'geology', prose: (t) => prose(t, {}) });
    const p = prose('As [[Hutton]] said, [[red|sun]] rock and [[a long time|@deep-time]], and [[no such thing]].', { sun: '#f00', ink: '#000' });
    const links = p.querySelectorAll('a.ency-link');
    expect([...links].map((a) => a.getAttribute('href'))).toEqual(['#/encyclopedia/james-hutton', '#/encyclopedia/deep-time']);
    expect(p.querySelector('b.tint')?.textContent).toBe('red');
    expect(p.textContent).toBe('As Hutton said, red rock and a long time, and no such thing.');
    expect(prose('The **[[deep time]]** idea.', {}).querySelector('b a.ency-link')?.textContent).toBe('deep time');
    document.body.append(p);
    (links[0] as HTMLElement).click();
    const card = document.querySelector('.ency-pop');
    expect(card?.textContent).toContain('James Hutton');
    expect(card?.querySelector('a')?.getAttribute('href')).toBe(enc.href('james-hutton'));
    closeFootnote();
    p.remove();
  });

  it('links a glossary term with an entry to it', () => {
    useEncyclopedia({ data: data(), course: 'geology', prose: (t) => prose(t, {}) });
    const g = glossaryView({ entries: [{ id: 'dt', term: 'Deep time', text: 'Old.' }, { id: 'x', term: 'Basalt', text: 'Dark rock.' }], prose: (t) => prose(t, {}) });
    expect(g.querySelector('a.gl-term')?.getAttribute('href')).toBe('#/encyclopedia/deep-time');
    expect(g.querySelectorAll('a.gl-term')).toHaveLength(1);
  });

  it('shows an entry with its links, lessons in any course and Wikipedia in a new tab', () => {
    const enc = useEncyclopedia({ data: data(), course: 'geology', prose: (t) => prose(t, {}) });
    const view = encyclopediaView({ enc });
    const root = document.createElement('div');
    view(root, { params: { id: 'deep-time' }, navigate: () => {}, replace: () => {} });
    const entry = root.querySelector('.ency-entry')!;
    expect(entry.querySelector('h2')?.textContent).toBe('Deep time');
    expect([...entry.querySelectorAll('.ency-chip')].map((c) => c.textContent)).toEqual(['James Hutton']);
    expect(entry.querySelector('.ency-learn a')?.getAttribute('href')).toBe('../astronomy/#/lesson/parallax');

    const root2 = document.createElement('div');
    view(root2, { params: { id: 'james-hutton' }, navigate: () => {}, replace: () => {} });
    const wiki = root2.querySelector<HTMLAnchorElement>('.ency-wiki a')!;
    expect(wiki.href).toBe('https://en.wikipedia.org/wiki/James_Hutton');
    expect(wiki.target).toBe('_blank');
    expect(wiki.rel).toBe('noopener');
    expect(root2.querySelector('.ency-learn a')?.getAttribute('href')).toBe('#/lesson/siccar');
    expect(root2.querySelector('.ency-trail')?.textContent).toContain('Deep time');
  });

  it('shows the course’s own page, its glossary, when no entry is chosen', () => {
    const enc = useEncyclopedia({ data: data(), course: 'geology', prose: (t) => prose(t, {}) });
    const root = document.createElement('div');
    encyclopediaView({ enc })(root, { params: {}, navigate: () => {}, replace: () => {} });
    expect(root.querySelector('.ency-main h2')?.textContent).toBe('Geology');
    expect([...root.querySelectorAll('.ency-gloss h3')].map((h) => h.textContent)).toEqual(['People', 'Ideas', 'Eras']);
    expect(root.querySelector('.ency-table td')?.textContent).toBe('66 Ma');
    expect(root.querySelectorAll('.ency-row').length).toBe(4);
  });
});
