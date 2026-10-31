// @vitest-environment happy-dom
// The review of every course at once (review-all.ts) and collections merged (srs.ts).

import { describe, expect, it } from 'vitest';
import { imageOf } from '../src/check';
import { el } from '../src/dom';
import { allCoursesReview, readCollections } from '../src/review-all';
import { addNote, answer, emptyCollection, ensureDeck, mergeCollections, Rating, type Collection } from '../src/srs';

function course(title: string, n: number): Collection {
  let col = ensureDeck(emptyCollection(), 'quiz', `${title}::Quiz`);
  for (let i = 0; i < n; i++) col = addNote(col, 'quiz', { id: `q${i}`, front: `${title} ${i}?`, choices: ['yes', 'no'], answer: 0, image: i === 0 ? 'https://example.com/a.webp' : '' });
  return answer(col, 'q0/0', Rating.Good);
}

describe('several collections as one', () => {
  it('keeps every course apart under its key', () => {
    const m = mergeCollections({ clouds: course('Clouds', 2), dirt: course('Dirt', 3) });
    expect(Object.keys(m.cards).sort()).toEqual(['clouds:q0/0', 'clouds:q1/0', 'dirt:q0/0', 'dirt:q1/0', 'dirt:q2/0']);
    expect(m.cards['dirt:q1/0']).toMatchObject({ note: 'dirt:q1', deck: 'dirt:quiz' });
    expect(m.revlog.map((r) => r.card).sort()).toEqual(['clouds:q0/0', 'dirt:q0/0']);
    expect(new Set(m.revlog.map((r) => r.id)).size).toBe(2);
    expect(m.notes['clouds:q0'].guid).toBe(course('Clouds', 1).notes.q0.guid);
  });

  it('notes a photo’s address, never an inlined one, and a drawing', () => {
    expect(imageOf(el('figure', {}, el('img', { src: 'https://example.com/x.webp' })))).toEqual({ image: 'https://example.com/x.webp' });
    expect(imageOf(el('figure', {}, el('img', { src: 'data:image/png;base64,AA' })))).toEqual({ image: '', drawing: true });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(imageOf(el('div', {}, svg))).toEqual({ image: '', drawing: true });
    expect(imageOf(el('div'))).toEqual({ image: '' });
  });
});

describe('the review of all courses', () => {
  it('deals every course’s cards, each in its colours, and writes answers back to its save', () => {
    localStorage.clear();
    localStorage.setItem('clouds.save', JSON.stringify({ v: 1, name: 'Rob', review: course('Clouds', 2) }));
    localStorage.setItem('dirt.save', JSON.stringify({ v: 1, review: course('Dirt', 2) }));
    const courses = [
      { key: 'clouds', title: 'Clouds', save: 'clouds.save', href: './clouds/', theme: { bg: '#1b172f', text: '#f6e7c8', accent: '#f6b98e' } },
      { key: 'dirt', title: 'Dirt', save: 'dirt.save', href: './soil/' },
      { key: 'none', title: 'Geology', save: 'geology.save', href: './geology/' },
    ];
    const page = allCoursesReview({ courses });
    document.body.replaceChildren(page);
    expect([...page.querySelectorAll('.ra-courses tbody tr')].map((r) => r.textContent)).toEqual(['Clouds110', 'Dirt110']);
    const start = page.querySelector<HTMLButtonElement>('.ra-big')!;
    expect(start.textContent).toBe('Study 4 cards');
    start.click();
    const titles: string[] = [];
    for (let k = 0; k < 10 && page.querySelector('.ra-card'); k++) {
      const card = page.querySelector<HTMLElement>('.ra-card')!;
      titles.push(card.querySelector('.ra-from strong')!.textContent!);
      if (titles[k] === 'Clouds') expect(card.getAttribute('style')).toContain('--ra-bg:#1b172f');
      [...card.querySelectorAll<HTMLButtonElement>('.answer-list button')].find((b) => b.textContent === 'yes')!.click();
      card.querySelector<HTMLButtonElement>('.rate-3')!.click();
    }
    expect([...new Set(titles)].sort()).toEqual(['Clouds', 'Dirt']);
    expect(titles).toHaveLength(6);
    const after = readCollections(courses);
    expect(after.clouds.revlog).toHaveLength(4);
    expect(after.dirt.revlog).toHaveLength(4);
    expect(JSON.parse(localStorage.getItem('clouds.save')!).name).toBe('Rob');
    expect(page.querySelector('h1')!.textContent).toBe('Sitting done');
  });
});
