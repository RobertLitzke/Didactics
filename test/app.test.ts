// @vitest-environment happy-dom
// A course in one call (app.ts defineCourse), and a new course's files
// (scaffold.ts), which `didactics-course new` writes.

import { describe, expect, it } from 'vitest';
import { courseHome, courseStore, defineCourse } from '../src/app';
import { figure, frame } from '../src/figure';
import { prose, type Lesson } from '../src/lesson';
import { courseId, scaffold, squarePng } from '../src/scaffold';

globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} } as unknown as typeof IntersectionObserver;

const lesson = (id: string, n: number): Lesson => ({
  id, n, title: `Lesson about ${id}`, teaches: `What ${id} is`, learned: [], next: '', journal: [],
  parts: [{ title: 'One', blocks: [{ type: 'text', text: 'Hi.' }, { type: 'interactive_diagram', id: 'push', caption: 'Push', task: 'Push', goal: 'far' }] }],
});
const push = figure(['far'], () => frame(100, 50).node);
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('defineCourse', () => {
  it('boots a course from its lessons and figures, with Home, Settings and a lesson route', async () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    const files = { '/src/lessons/a.json': lesson('a', 1), '/src/lessons/b.json': lesson('b', 2) };
    const lessons = Object.values(files) as Lesson[];
    const course = defineCourse({ id: 'levers', title: 'Levers', lessons, figures: { push }, prose: (t) => prose(t, {}), text: { files } });
    await settle();

    expect([...document.querySelectorAll('.navmenu nav a')].map((o) => o.textContent)).toEqual(['Home', 'Settings']);
    expect(document.querySelector('.course-home h1')!.textContent).toBe('Levers');
    expect(document.querySelectorAll('.lesson-card')).toHaveLength(2);
    expect(document.querySelector('.btn-big')!.getAttribute('href')).toBe('#/lesson/a');

    course.router.navigate('/lesson/a');
    await settle();
    expect(document.body.classList.contains('in-lesson')).toBe(true);
    expect(document.querySelector('main')!.textContent).toContain('Lesson about a');

    course.router.navigate('/settings');
    await settle();
    expect(document.body.classList.contains('in-lesson')).toBe(false);
    const page = document.querySelector('main')!.textContent!;
    expect(page).toContain('Download the course');
    expect(document.querySelector('a[download="levers.html"]')).not.toBeNull();

    course.store.update((s) => ({ ...s, name: 'Ada' }));
    expect(JSON.parse(localStorage.getItem('levers.save')!).name).toBe('Ada');
    expect(course.text).toBeDefined();
  });

  it('places the course pages and the built-in ones in the menu it is given', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    defineCourse({
      id: 'menu', title: 'Menu', lessons: [lesson('a', 1)], figures: { push }, prose: (t) => prose(t, {}),
      pages: [{ path: '/lab', label: 'Lab', view: (root) => { root.textContent = 'The lab'; } }, { path: '/hidden', view: () => {} }],
      quiz: { deck: [], blurb: 'Cards.' },
      glossary: {},
      menu: ['/home', '/lab', '/quiz', '/glossary', '/settings'],
    });
    await settle();
    expect([...document.querySelectorAll('.navmenu nav a')].map((o) => o.textContent)).toEqual(['Home', 'Lab', 'Quiz', 'Glossary', 'Settings']);
  });

  it('ends the menu with a link to the site\'s catalog, never marked as the page', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    location.hash = '';
    defineCourse({ id: 'in-site', title: 'In a site', lessons: [lesson('a', 1)], figures: { push }, prose: (t) => prose(t, {}), catalog: { href: '../' } });
    await settle();
    const links = [...document.querySelectorAll('.navmenu nav a')];
    expect(links.map((o) => o.textContent)).toEqual(['Home', 'Settings', 'All courses']);
    expect(links[2].getAttribute('href')).toBe('../');
    expect(links[2].classList.contains('here')).toBe(false);
    expect(document.querySelector('.navmenu summary')!.textContent).toBe('Home');
  });

  it('makes a save with or without the radio, or takes the one it is given', () => {
    expect('talk' in courseStore('x').empty()).toBe(false);
    expect('talk' in courseStore('x', {}, true).empty()).toBe(true);
    expect(courseStore('x', { units: 'imperial', fixedUnits: true }).empty()).toMatchObject({ units: 'imperial', fixedUnits: true });
    const given = courseStore('y');
    expect(courseStore('z', given).store).toBe(given.store);
  });

  it('home shows Again and the score for a finished lesson', () => {
    const { store } = courseStore('home');
    store.update((s) => ({ ...s, lessons: { a: { done: true, best: 2, of: 3 } } }) as typeof s);
    const root = document.createElement('div');
    courseHome({ title: 'T', lessons: [lesson('a', 1), lesson('b', 2)], store })(root, { params: {}, navigate: () => {}, replace: () => {} });
    expect(root.querySelector('.lesson-card')!.textContent).toContain('Check: 2 of 3');
    expect(root.querySelector('.lesson-card .btn')!.textContent).toBe('Again');
    expect(root.querySelector('.btn-big')!.textContent).toContain('lesson 2');
  });
});

describe('scaffold', () => {
  const files = scaffold({ id: 'levers', title: 'Levers', didactics: 'github:RobertLitzke/Didactics#abc' });

  it('writes everything a course needs before its first lesson', () => {
    for (const f of ['package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'index.html', 'src/main.ts', 'src/lessons/first.json',
      'src/figures/index.ts', 'test/content.test.ts', '.github/workflows/pages.yml', 'public/icons/icon-192.png', 'public/icons/icon-512-maskable.png']) {
      expect(files[f], f).toBeDefined();
    }
    expect(JSON.parse(files['package.json'] as string).dependencies.didactics).toBe('github:RobertLitzke/Didactics#abc');
    expect(files['src/main.ts']).toContain("defineCourse({\n  id: 'levers',");
    expect(files['vite.config.ts']).toContain("oneFile: 'levers.html'");
  });

  it('names a course from its title, and draws real PNGs', () => {
    expect(courseId('Levers & Pulleys')).toBe('levers-pulleys');
    const png = squarePng(2, '#ff0000');
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
