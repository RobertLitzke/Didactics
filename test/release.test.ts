// @vitest-environment happy-dom
// A course's release (release.ts): the beta slip, Settings' About and the
// checks on a course.json's `release`; and defineCourse showing them.

import { describe, expect, it } from 'vitest';
import { defineCourse } from '../src/app';
import { figure, frame } from '../src/figure';
import { prose, type Lesson } from '../src/lesson';
import { releaseAbout, releaseDate, releaseProblems, releaseSlip, type CourseRelease } from '../src/release';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;

const beta: CourseRelease = { version: '0.3', stage: 'beta', date: '2026-11-04', note: 'Branches F1 to F4.', history: [{ version: '0.2', stage: 'beta', date: '2026-10-30', note: 'Lessons 10 to 19.' }] };
const out: CourseRelease = { version: '1.0', stage: 'released', date: '2026-11-04' };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('release', () => {
  it('shows a slip for a beta and none for a released course', () => {
    const slip = releaseSlip(beta)!;
    expect(slip.querySelector('.release-tag')!.textContent).toBe('Beta');
    expect(slip.textContent).toContain('Your progress is kept');
    expect(slip.textContent).toContain('Version 0.3, 4 November 2026.');
    expect(releaseSlip(out)).toBeNull();
    expect(releaseSlip(undefined)).toBeNull();
    expect(releaseSlip(out, { always: true })!.textContent).toContain('Released');
  });

  it('gives the version and the latest notes for Settings', () => {
    const about = releaseAbout(beta);
    expect(about.textContent).toContain('Version 0.3');
    expect([...about.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['0.3 (4 November 2026): Branches F1 to F4.', '0.2 (30 October 2026): Lessons 10 to 19.']);
    expect(releaseAbout(out).querySelector('ul')).toBeNull();
  });

  it('checks a release', () => {
    expect(releaseProblems(beta)).toEqual([]);
    expect(releaseProblems(out)).toEqual([]);
    expect(releaseProblems({ version: '1.0', stage: 'beta', date: '2026-11-04' })).toEqual(["a beta's version starts with 0."]);
    expect(releaseProblems({ version: '0.4', stage: 'released', date: '2026-11-04' })).toEqual(['a released version is 1.0 or more']);
    expect(releaseProblems({ version: '1', stage: 'gold', date: 'today' })).toHaveLength(3);
    expect(releaseProblems(undefined)).toHaveLength(1);
    expect(releaseDate('2026-01-09')).toBe('9 January 2026');
  });

  it('puts the slip on the default home and the version in Settings', async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    const lesson: Lesson = { id: 'a', n: 1, title: 'A', teaches: 'A', summary: [], parts: [{ title: 'One', blocks: [{ type: 'text', text: 'Hi.' }] }] };
    const course = defineCourse({
      id: 'rel', title: 'Rel', lessons: [lesson], figures: { push: figure(['x'], () => frame(10, 10).node) }, prose: (t) => prose(t, {}),
      welcome: 'Hello.', release: beta, settings: { about: 'Credits.' },
    });
    await settle();
    expect(document.querySelector('.course-home .release-slip')).not.toBeNull();
    course.router.navigate('/settings');
    await settle();
    const about = document.querySelector('.release-about')!;
    expect(about.textContent).toContain('Version 0.3');
    expect(document.querySelector('main')!.textContent).toContain('Credits.');
  });
});
