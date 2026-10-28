// The Settings section for revising a course's words (course.ts): download the
// whole course as one JSON file, load an edited one to read it in the real
// lessons on this device, and go back to the built-in words. Pass it to
// settingsView as one of its `sections`.

import type { CourseEdits } from './course';
import { el, type Child } from './dom';
import { toast } from './ui';

export interface CourseSectionOptions {
  edits: CourseEdits;
  /** The downloaded file's name, such as "clouds-course.json". */
  fileName: string;
}

export function courseSection(o: CourseSectionOptions): Child[] {
  const problems = el('ul.course-problems');
  const status = el('p.muted');
  const reload = el('button.btn', { type: 'button', onclick: () => location.reload() }, 'Reload to read it');
  const reset = el('button.btn.btn-ghost', { type: 'button', onclick: () => {
    o.edits.reset();
    paint();
    toast('Back to the built-in text after a reload.');
    reload.hidden = false;
  } }, 'Back to the built-in text');
  reload.hidden = true;
  const paint = () => {
    const n = o.edits.edited.length;
    status.textContent = n
      ? `This device reads an edited course: ${n} file${n === 1 ? ' differs' : 's differ'} from the built-in text.`
      : 'Download the whole course as one JSON file to revise it. Load an edited file to read it here; only this device sees it.';
    reset.hidden = n === 0;
  };

  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const wrong = o.edits.load(await f.text());
    problems.replaceChildren(...wrong.slice(0, 12).map((w) => el('li', {}, w)), ...(wrong.length > 12 ? [el('li', {}, `and ${wrong.length - 12} more`)] : []));
    if (wrong.length) return void toast('That file was not loaded.');
    paint();
    reload.hidden = false;
    toast('Loaded. Reload to read it.');
  });

  const download = () => {
    const blob = new Blob([JSON.stringify(o.edits.file(), null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: o.fileName }) as HTMLAnchorElement;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  paint();
  return [
    el('h2', {}, 'Course text'),
    status,
    el('div.row', {},
      el('button.btn', { type: 'button', onclick: download }, 'Download the course'),
      el('button.btn.btn-ghost', { type: 'button', onclick: () => file.click() }, 'Load edited text'),
      reset, reload, file),
    problems,
  ];
}
