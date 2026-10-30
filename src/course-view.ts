// The Settings section for revising a course's words (course.ts): download the
// whole course as one JSON file, load an edited one to read it in the real
// lessons on this device, and go back to the built-in words. Pass it to
// settingsView as one of its `sections`.

import type { CourseEdits, CoursePiece } from './course';
import { el, type Child } from './dom';
import { toast } from './ui';

export interface CourseSectionOptions {
  edits: CourseEdits;
  /** The downloaded file's name, such as "clouds-course.json". */
  fileName: string;
  /**
   * Parts of the course to download on their own, such as one per lesson. A
   * menu then offers the whole course ("All") or one of them; a piece's file
   * loads back like the whole course's, changing only what it holds.
   */
  pieces?: CoursePiece[];
  /** The menu's name for the whole course. Defaults to "All". */
  allLabel?: string;
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');

/** A piece's file name: its own, or the course's with the label's slug before ".json". */
export function pieceFileName(fileName: string, piece: CoursePiece): string {
  return piece.fileName ?? fileName.replace(/(\.json)?$/, `-${slug(piece.label)}.json`);
}

export function courseSection(o: CourseSectionOptions): Child[] {
  const pieces = o.pieces ?? [];
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
      : `Download ${pieces.length ? 'the course\'s text, all of it or one part,' : 'all of the course\'s text'} as one JSON file to revise it${o.edits.hasCode ? ': the lessons, and the words in its drawings, pages and buttons' : ''}. Load an edited file to read it here; only this device sees it.`;
    reset.hidden = n === 0;
  };

  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    const wrong = await o.edits.load(await f.text());
    problems.replaceChildren(...wrong.slice(0, 12).map((w) => el('li', {}, w)), ...(wrong.length > 12 ? [el('li', {}, `and ${wrong.length - 12} more`)] : []));
    if (wrong.length) return void toast('That file was not loaded.');
    paint();
    reload.hidden = false;
    toast('Loaded. Reload to read it.');
  });

  const which = el('select.course-piece', { 'aria-label': 'Which text to download' },
    el('option', { value: '' }, o.allLabel ?? 'All'),
    ...pieces.map((p, i) => el('option', { value: String(i) }, p.label))) as HTMLSelectElement;
  const download = async () => {
    const piece = which.value === '' ? undefined : pieces[Number(which.value)];
    const blob = new Blob([JSON.stringify(await o.edits.file(piece), null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: piece ? pieceFileName(o.fileName, piece) : o.fileName }) as HTMLAnchorElement;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  paint();
  return [
    el('h2', {}, 'Course text'),
    status,
    pieces.length ? el('div.row', {}, which) : null,
    el('div.row', {},
      el('button.btn', { type: 'button', onclick: download }, pieces.length ? 'Download' : 'Download the course'),
      el('button.btn.btn-ghost', { type: 'button', onclick: () => file.click() }, 'Load edited text'),
      reset, reload, file),
    problems,
  ];
}
