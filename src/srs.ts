// Spaced repetition, shaped like Anki's collection: notes (what is known),
// cards (one way of being asked a note), decks (where cards are filed), a
// review log (every answer ever given), and a scheduler that turns an answer
// into the card's next due time. Plain data throughout, so a collection
// lives in a save file as JSON and goes to Anki whole (anki.ts).
//
// Two schedulers, both Anki's: SM-2 as Anki has run it for years (learning
// steps, ease, graduating and easy intervals, lapses and relearning) and FSRS
// (via ts-fsrs, the reference implementation, which Anki also uses), which
// models each card's memory as a stability and a difficulty. A card keeps the
// fields of both, so a collection can change scheduler and keep its history.
//
// Every function here is pure: it takes a collection and returns a new one,
// never changing what it was given, so a store can keep the old one or swap.
//
// The study queue (`studyQueue`) comes from Syrinx's: what is due first, most
// overdue first; new cards woven through the reviews at a share of the
// sitting rather than bunched at the end; and, once nothing is due, a
// reservoir of cards nearest to being forgotten for a reader who wants more.

import { createEmptyCard, fsrs as makeFsrs, generatorParameters, State, type Card as FsrsCard, type FSRS, type Grade } from 'ts-fsrs';

// ---- The data ---------------------------------------------------------------------

/** The four answer buttons, numbered as Anki's (revlog.ease). */
export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];
export const RATING_NAMES: Readonly<Record<Rating, string>> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

/** Where a card is in its life (Anki's cards.type). */
export type CardType = 'new' | 'learning' | 'review' | 'relearning';
/** Whether a card is dealt, and from which pile (Anki's cards.queue). */
export type Queue = 'new' | 'learning' | 'review' | 'suspended' | 'buried';

export interface Deck {
  id: string;
  /** Anki's way: "Clouds::Lesson 3" is the deck "Lesson 3" inside "Clouds". */
  name: string;
  /** A line about it, for Anki's deck description. */
  description?: string;
  created: number;
}

/**
 * What one note asks. "basic" is a front and a back; "choice" is a question
 * with choices, of which `answer` is the right one (its `back` is that
 * choice's words), as a lesson's check asks.
 */
export type NoteModel = 'basic' | 'choice';

export interface Note {
  /** Stable for the same question, so the same question answered twice is one note. */
  id: string;
  /** Anki's globally unique id for the note, which matches it again on a later import. */
  guid: string;
  model: NoteModel;
  front: string;
  back: string;
  /** "choice" only: the choices, in their own order, and which is right. */
  choices?: string[];
  answer?: number;
  /** Said once it is answered: why the answer is right. */
  extra?: string;
  tags: string[];
  /**
   * Where the note came from, for the app to find again: a lesson's check
   * question, a card of the course's own deck. The app's own JSON; the
   * library keeps it and goes no further.
   */
  source?: Record<string, unknown>;
  created: number;
  modified: number;
}

export interface Card {
  /** `<note id>/<ord>`. */
  id: string;
  note: string;
  /** Which way of asking the note this is; a basic or choice note has one, 0. */
  ord: number;
  deck: string;
  type: CardType;
  queue: Queue;
  /** When it is next due, in ms. A review card falls due at the start of a day (see `dayStart`). */
  due: number;
  /** Days between its last review and its due day; 0 until it graduates. */
  interval: number;
  /** SM-2's ease: the interval is multiplied by this on Good. Anki's factor / 1000. */
  ease: number;
  reps: number;
  lapses: number;
  /** Which (re)learning step it is on, from 0. */
  step: number;
  /** When it was last answered, in ms. */
  lastReview?: number;
  /** FSRS's memory: days until recall falls to 90%, and how hard it is (1-10). */
  stability?: number;
  difficulty?: number;
  /** A buried card comes back on this day (ms of its start). */
  buriedUntil?: number;
  created: number;
  modified: number;
}

/** One answer, as Anki's revlog has it. */
export interface ReviewLog {
  /** When it was answered, in ms; unique within a collection, as Anki's revlog id. */
  id: number;
  card: string;
  rating: Rating;
  /** What the card was before the answer: Anki's revlog type learn/review/relearn ('new' counts as learn). */
  type: CardType;
  /** The interval after the answer, in days (a fraction of a day while learning). */
  interval: number;
  /** The interval before it. */
  lastInterval: number;
  /** The ease after it. */
  ease: number;
  /** How long the answer took, in ms. */
  took: number;
}

export interface SchedulerConfig {
  /** Which scheduler runs: FSRS, or SM-2 as Anki has long run it. Default FSRS. */
  scheduler: 'fsrs' | 'sm2';
  /** New cards a day. Anki's default is 20. */
  newPerDay: number;
  /** Reviews a day. */
  reviewsPerDay: number;
  /** The hour a new day starts, local time. Anki's default is 4 (am). */
  rollover: number;
  /** Learning steps and relearning steps, in minutes. */
  learnSteps: number[];
  relearnSteps: number[];
  /** SM-2: the first interval on Good and on Easy, in days. */
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  hardInterval: number;
  intervalModifier: number;
  /** SM-2: a lapsed card's interval is multiplied by this. */
  lapseInterval: number;
  minimumInterval: number;
  maximumInterval: number;
  /** FSRS: the chance of recall to schedule for. */
  retention: number;
  /** Lapses that tag a card "leech". */
  leech: number;
  /** Spread intervals a little, so cards learned together do not stay together. */
  fuzz: boolean;
}

export const DEFAULT_CONFIG: Readonly<SchedulerConfig> = {
  scheduler: 'fsrs',
  newPerDay: 20,
  reviewsPerDay: 200,
  rollover: 4,
  learnSteps: [1, 10],
  relearnSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardInterval: 1.2,
  intervalModifier: 1,
  lapseInterval: 0,
  minimumInterval: 1,
  maximumInterval: 36500,
  retention: 0.9,
  leech: 8,
  fuzz: true,
};

export interface Collection {
  v: 1;
  /** When the collection was made, in ms (Anki's col.crt). */
  created: number;
  decks: Record<string, Deck>;
  notes: Record<string, Note>;
  cards: Record<string, Card>;
  revlog: ReviewLog[];
  /** Overrides of DEFAULT_CONFIG. */
  config: Partial<SchedulerConfig>;
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export function emptyCollection(now: number = Date.now(), config: Partial<SchedulerConfig> = {}): Collection {
  return { v: 1, created: now, decks: {}, notes: {}, cards: {}, revlog: [], config };
}

export const configOf = (col: Collection): SchedulerConfig => ({ ...DEFAULT_CONFIG, ...col.config });

// ---- Days -------------------------------------------------------------------------

/** The start of the day `now` is in, in ms, a day starting at `rollover` o'clock local time. */
export function dayStart(now: number, rollover = DEFAULT_CONFIG.rollover): number {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rollover);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/** The start of the day `days` after the one `now` is in (calendar days, so a clock change is no matter). */
export function dayAfter(now: number, days: number, rollover = DEFAULT_CONFIG.rollover): number {
  const d = new Date(dayStart(now, rollover));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

// ---- Making notes and cards ---------------------------------------------------------

/** A short, stable hash of a string (FNV-1a), as letters and digits. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  let g = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    g = Math.imul(g ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return h.toString(36) + g.toString(36);
}

/** Anki's guid for a note: 10 characters from its id, the same every time. */
export function guidFor(id: string): string {
  return hashString(`guid:${id}`).padEnd(10, '0').slice(0, 10);
}

export const cardId = (note: string, ord = 0): string => `${note}/${ord}`;

/** A deck, added if it is not there; its name is updated if it is. */
export function ensureDeck(col: Collection, id: string, name: string, now: number = Date.now(), description?: string): Collection {
  const old = col.decks[id];
  if (old && old.name === name && old.description === description) return col;
  return { ...col, decks: { ...col.decks, [id]: { id, name, created: old?.created ?? now, ...(description ? { description } : {}) } } };
}

export interface NoteInput {
  id: string;
  model?: NoteModel;
  front: string;
  back?: string;
  choices?: string[];
  answer?: number;
  extra?: string;
  tags?: string[];
  source?: Record<string, unknown>;
}

function noteFrom(input: NoteInput, now: number, old?: Note): Note {
  const model: NoteModel = input.model ?? (input.choices ? 'choice' : 'basic');
  const back = model === 'choice' ? input.choices?.[input.answer ?? 0] ?? input.back ?? '' : input.back ?? '';
  return {
    id: input.id,
    guid: old?.guid ?? guidFor(input.id),
    model,
    front: input.front,
    back,
    ...(model === 'choice' ? { choices: [...(input.choices ?? [])], answer: input.answer ?? 0 } : {}),
    ...(input.extra ? { extra: input.extra } : {}),
    tags: [...new Set([...(old?.tags.filter((t) => t === 'leech') ?? []), ...(input.tags ?? [])])],
    ...(input.source ? { source: input.source } : {}),
    created: old?.created ?? now,
    modified: now,
  };
}

const sameNote = (a: Note, b: Note) =>
  a.front === b.front && a.back === b.back && a.extra === b.extra && a.model === b.model && a.answer === b.answer &&
  JSON.stringify(a.choices) === JSON.stringify(b.choices) && JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
  JSON.stringify(a.source) === JSON.stringify(b.source);

/** A card that has not been answered yet. */
export function newCard(note: string, deck: string, now: number, ord = 0): Card {
  return { id: cardId(note, ord), note, ord, deck, type: 'new', queue: 'new', due: now, interval: 0, ease: 0, reps: 0, lapses: 0, step: 0, created: now, modified: now };
}

/**
 * Add a note and its card to a deck, or update the note's words if it is
 * there already (its card and its history stay as they are).
 */
export function addNote(col: Collection, deck: string, input: NoteInput, now: number = Date.now()): Collection {
  const old = col.notes[input.id];
  const note = noteFrom(input, now, old);
  const id = cardId(note.id);
  const hasCard = !!col.cards[id];
  if (old && hasCard && sameNote(old, note)) return col;
  return {
    ...col,
    notes: { ...col.notes, [note.id]: old && sameNote(old, note) ? old : note },
    cards: hasCard ? col.cards : { ...col.cards, [id]: newCard(note.id, deck, now) },
  };
}

/** Take a note, its cards and their reviews out of the collection. */
export function removeNote(col: Collection, id: string): Collection {
  if (!col.notes[id]) return col;
  const { [id]: _gone, ...notes } = col.notes;
  const cards = Object.fromEntries(Object.entries(col.cards).filter(([, c]) => c.note !== id));
  return { ...col, notes, cards, revlog: col.revlog.filter((r) => cards[r.card]) };
}

/** Keep a card out of every sitting until it is unsuspended. */
export function suspend(col: Collection, id: string, on = true, now: number = Date.now()): Collection {
  const c = col.cards[id];
  if (!c) return col;
  return withCard(col, { ...c, queue: on ? 'suspended' : queueFor(c.type), modified: now });
}

/** Keep a card out of today's sittings: it comes back tomorrow. */
export function bury(col: Collection, id: string, now: number = Date.now()): Collection {
  const c = col.cards[id];
  if (!c || c.queue === 'suspended') return col;
  return withCard(col, { ...c, queue: 'buried', buriedUntil: dayAfter(now, 1, configOf(col).rollover), modified: now });
}

/** Forget a card: it is new again, its history kept in the log. */
export function forget(col: Collection, id: string, now: number = Date.now()): Collection {
  const c = col.cards[id];
  if (!c) return col;
  const { stability: _s, difficulty: _d, lastReview: _l, buriedUntil: _b, ...rest } = c;
  return withCard(col, { ...rest, type: 'new', queue: 'new', due: now, interval: 0, ease: 0, step: 0, reps: 0, lapses: 0, modified: now });
}

const queueFor = (t: CardType): Queue => (t === 'relearning' ? 'learning' : t);
const withCard = (col: Collection, c: Card): Collection => ({ ...col, cards: { ...col.cards, [c.id]: c } });

// ---- Schedulers -----------------------------------------------------------------------

/** What an answer makes of a card. */
export interface Scheduler {
  readonly kind: 'fsrs' | 'sm2';
  /** The card after answering `rating` at `now`. `seed` makes the fuzz the same each time for the same answer. */
  next(card: Card, rating: Rating, now: number): Card;
}

/** A number from 0 to 1 that is the same for the same card and answer count. */
function fuzzUnit(card: Card): number {
  return parseInt(hashString(`${card.id}#${card.reps}`).slice(0, 6), 36) / 36 ** 6;
}

/** Anki's fuzz: a few percent either way, more for short intervals, none under 2.5 days. */
export function fuzzRange(days: number): [number, number] {
  if (days < 2.5) return [days, days];
  let delta = 1;
  delta += 0.15 * Math.max(0, Math.min(days, 7) - 2.5);
  delta += 0.1 * Math.max(0, Math.min(days, 20) - 7);
  delta += 0.05 * Math.max(0, days - 20);
  return [Math.max(2, Math.round(days - delta)), Math.round(days + delta)];
}

function fuzzed(days: number, card: Card, cfg: SchedulerConfig, floor = 1): number {
  const whole = Math.max(floor, Math.round(days));
  if (!cfg.fuzz) return Math.min(whole, cfg.maximumInterval);
  const [lo, hi] = fuzzRange(whole);
  const lower = Math.max(floor, lo);
  return Math.min(cfg.maximumInterval, Math.max(lower, Math.round(lower + fuzzUnit(card) * (hi - lower))));
}

/** Anki's delay on Hard at the first step: halfway between the first two steps, or 1.5 times a single one. */
function hardDelay(steps: number[], step: number): number {
  if (step > 0) return steps[step] ?? steps.at(-1)!;
  if (steps.length > 1) return (steps[0] + steps[1]) / 2;
  return Math.min(steps[0] * 1.5, steps[0] + 24 * 60);
}

/** A card graduating to (or staying in) review: due at the start of the day `interval` days on. */
function toReview(c: Card, interval: number, now: number, cfg: SchedulerConfig): Card {
  return { ...c, type: 'review', queue: 'review', step: 0, interval, due: dayAfter(now, interval, cfg.rollover) };
}

/** A card on a (re)learning step: due `minutes` from now, or on a later day when that is a day or more. */
function toStep(c: Card, type: 'learning' | 'relearning', step: number, minutes: number, now: number, cfg: SchedulerConfig): Card {
  const due = minutes >= 24 * 60 ? dayAfter(now, Math.round(minutes / (24 * 60)), cfg.rollover) : now + minutes * MINUTE;
  return { ...c, type, queue: 'learning', step, due };
}

/** SM-2, as Anki's scheduler runs it with these settings. */
export function sm2(config: Partial<SchedulerConfig> = {}): Scheduler {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const next = (prev: Card, rating: Rating, now: number): Card => {
    const c: Card = { ...prev, reps: prev.reps + 1, lastReview: now, modified: now, ease: prev.ease || cfg.startingEase };
    delete c.buriedUntil;
    if (prev.type === 'new' || prev.type === 'learning') {
      const steps = cfg.learnSteps.length ? cfg.learnSteps : [1];
      const step = prev.type === 'new' ? 0 : Math.min(prev.step, steps.length - 1);
      if (rating === Rating.Easy) return toReview(c, fuzzed(cfg.easyInterval, c, cfg), now, cfg);
      if (rating === Rating.Again) return toStep(c, 'learning', 0, steps[0], now, cfg);
      if (rating === Rating.Hard) return toStep(c, 'learning', step, hardDelay(steps, step), now, cfg);
      if (step + 1 >= steps.length || !cfg.learnSteps.length) return toReview(c, fuzzed(cfg.graduatingInterval, c, cfg), now, cfg);
      return toStep(c, 'learning', step + 1, steps[step + 1], now, cfg);
    }
    if (prev.type === 'relearning') {
      const steps = cfg.relearnSteps;
      const step = Math.min(prev.step, Math.max(0, steps.length - 1));
      const back = Math.max(cfg.minimumInterval, prev.interval);
      if (!steps.length || rating === Rating.Easy) return toReview(c, rating === Rating.Easy ? back + 1 : back, now, cfg);
      if (rating === Rating.Again) return toStep(c, 'relearning', 0, steps[0], now, cfg);
      if (rating === Rating.Hard) return toStep(c, 'relearning', step, hardDelay(steps, step), now, cfg);
      if (step + 1 >= steps.length) return toReview(c, back, now, cfg);
      return toStep(c, 'relearning', step + 1, steps[step + 1], now, cfg);
    }
    // A review card.
    const ivl = Math.max(1, prev.interval);
    const elapsed = prev.lastReview !== undefined ? Math.max(0, (dayStart(now, cfg.rollover) - dayStart(prev.lastReview, cfg.rollover)) / DAY) : ivl;
    const late = Math.max(0, Math.round(elapsed) - ivl);
    const ease = c.ease;
    if (rating === Rating.Again) {
      const lapsed: Card = { ...c, lapses: prev.lapses + 1, ease: Math.max(1.3, ease - 0.2), interval: Math.max(cfg.minimumInterval, Math.round(ivl * cfg.lapseInterval)) };
      if (!cfg.relearnSteps.length) return toReview(lapsed, lapsed.interval, now, cfg);
      return toStep(lapsed, 'relearning', 0, cfg.relearnSteps[0], now, cfg);
    }
    const hard = Math.max(ivl + 1, ivl * cfg.hardInterval * cfg.intervalModifier);
    if (rating === Rating.Hard) return toReview({ ...c, ease: Math.max(1.3, ease - 0.15) }, fuzzed(hard, c, cfg, ivl + 1), now, cfg);
    const good = Math.max(hard + 1, (ivl + late / 2) * ease * cfg.intervalModifier);
    if (rating === Rating.Good) return toReview(c, fuzzed(good, c, cfg, Math.round(hard) + 1), now, cfg);
    const easy = Math.max(good + 1, (ivl + late) * ease * cfg.easyBonus * cfg.intervalModifier);
    return toReview({ ...c, ease: ease + 0.15 }, fuzzed(easy, c, cfg, Math.round(good) + 1), now, cfg);
  };
  return { kind: 'sm2', next };
}

const TO_FSRS_STATE: Record<CardType, State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };
const FROM_FSRS_STATE: Record<State, CardType> = { [State.New]: 'new', [State.Learning]: 'learning', [State.Review]: 'review', [State.Relearning]: 'relearning' };

/** A card as ts-fsrs has it. */
export function toFsrsCard(c: Card): FsrsCard {
  if (c.type === 'new') return createEmptyCard(new Date(c.due));
  return {
    due: new Date(c.due),
    stability: c.stability ?? Math.max(0.1, c.interval || 1),
    difficulty: c.difficulty ?? 5,
    elapsed_days: 0,
    scheduled_days: Math.round(c.interval),
    learning_steps: c.step,
    reps: c.reps,
    lapses: c.lapses,
    state: TO_FSRS_STATE[c.type],
    ...(c.lastReview !== undefined ? { last_review: new Date(c.lastReview) } : {}),
  };
}

/** FSRS, as Anki runs it: (re)learning steps in minutes, then intervals from each card's memory. */
export function fsrs(config: Partial<SchedulerConfig> = {}): Scheduler & { readonly engine: FSRS } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const engine = makeFsrs(generatorParameters({
    request_retention: cfg.retention,
    maximum_interval: cfg.maximumInterval,
    // The fuzz is ts-fsrs's own, seeded from the card, so it is the same for the same answer.
    enable_fuzz: cfg.fuzz,
    enable_short_term: true,
    learning_steps: cfg.learnSteps.map((m) => `${m}m` as const),
    relearning_steps: cfg.relearnSteps.map((m) => `${m}m` as const),
  }));
  const next = (prev: Card, rating: Rating, now: number): Card => {
    const { card: f } = engine.next(toFsrsCard(prev), new Date(now), rating as Grade);
    const type = FROM_FSRS_STATE[f.state];
    const base: Card = {
      ...prev,
      reps: prev.reps + 1,
      lapses: f.lapses,
      lastReview: now,
      modified: now,
      stability: f.stability,
      difficulty: f.difficulty,
      ease: prev.ease || cfg.startingEase,
    };
    delete base.buriedUntil;
    if (type === 'review') return toReview(base, Math.max(1, f.scheduled_days), now, cfg);
    return { ...base, type, queue: 'learning', step: f.learning_steps, due: f.due.getTime(), interval: type === 'relearning' ? Math.max(1, prev.interval) : 0 };
  };
  return { kind: 'fsrs', engine, next };
}

/** The scheduler the collection's settings ask for. */
export const schedulerFor = (col: Collection): Scheduler => (configOf(col).scheduler === 'sm2' ? sm2(col.config) : fsrs(col.config));

/**
 * The chance the card would be recalled at `now`: FSRS's forgetting curve
 * from its stability, or, for a card without one, a guess from how far
 * through its interval it is. 0 for a new card.
 */
export function retrievability(c: Card, now: number): number {
  if (c.type === 'new' || c.lastReview === undefined) return 0;
  const days = Math.max(0, (now - c.lastReview) / DAY);
  const s = c.stability ?? Math.max(0.1, c.interval);
  // FSRS-5's curve; FSRS-6's differs a little, which is no matter for ordering.
  return Math.pow(1 + (19 / 81) * (days / s), -0.5);
}

// ---- Answering ----------------------------------------------------------------------

export interface AnswerOptions {
  /** How long the answer took, in ms. */
  took?: number;
  /** Default: the collection's own (schedulerFor). */
  scheduler?: Scheduler;
}

/** Answer a card: its next state, and a line in the review log. */
export function answer(col: Collection, id: string, rating: Rating, now: number = Date.now(), o: AnswerOptions = {}): Collection {
  const prev = col.cards[id];
  if (!prev) return col;
  const cfg = configOf(col);
  const sched = o.scheduler ?? schedulerFor(col);
  let card = sched.next(prev, rating, now);
  // The review log's id is its time, unique, as Anki's.
  const last = col.revlog.at(-1)?.id ?? 0;
  const log: ReviewLog = {
    id: Math.max(now, last + 1),
    card: id,
    rating,
    type: prev.type,
    interval: card.type === 'review' ? card.interval : (card.due - now) / DAY,
    lastInterval: prev.type === 'review' || prev.type === 'relearning' ? prev.interval : prev.type === 'learning' ? (prev.due - (prev.lastReview ?? prev.due)) / DAY : 0,
    ease: card.ease,
    took: Math.max(0, Math.min(60_000, Math.round(o.took ?? 0))),
  };
  let notes = col.notes;
  if (rating === Rating.Again && prev.type === 'review' && card.lapses >= cfg.leech && (card.lapses - cfg.leech) % Math.ceil(cfg.leech / 2) === 0) {
    const n = col.notes[card.note];
    if (n && !n.tags.includes('leech')) notes = { ...notes, [n.id]: { ...n, tags: [...n.tags, 'leech'] } };
  }
  if (prev.queue === 'suspended') card = { ...card, queue: 'suspended' };
  return { ...col, notes, cards: { ...col.cards, [id]: card }, revlog: [...col.revlog, log] };
}

/** When the card would next be due on each answer, in ms from now, for the buttons' labels. */
export function preview(col: Collection, id: string, now: number = Date.now(), scheduler: Scheduler = schedulerFor(col)): Record<Rating, number> {
  const c = col.cards[id];
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Rating, number>;
  if (!c) return out;
  for (const r of RATINGS) out[r] = scheduler.next(c, r, now).due - now;
  return out;
}

/** A gap as Anki labels its buttons: "1m", "10m", "3h", "4d", "2.1mo", "1.5y". */
export function formatGap(ms: number): string {
  const m = Math.max(0, ms) / MINUTE;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${(d / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

// ---- What to study ------------------------------------------------------------------

/** Anki answers learning cards this far ahead rather than leave a gap. */
export const LEARN_AHEAD = 20 * MINUTE;

export interface QueueOptions {
  /** Only cards in these decks (and the decks inside them). */
  decks?: readonly string[];
  /** Cards in the sitting. Default: as many as the day's limits allow. */
  limit?: number;
  /**
   * The share of a sitting held for new cards, so a pile of reviews does not
   * keep new ones out for days (Syrinx's NEW_SHARE). Default 0.3.
   */
  newShare?: number;
}

export interface DayCounts {
  /** New cards that may still be met today. */
  new: number;
  /** Learning cards due now (or within LEARN_AHEAD). */
  learning: number;
  /** Review cards due today, within today's limit. */
  review: number;
}

/** The decks given, with every deck inside them ("A" holds "A::B"). */
function deckFilter(col: Collection, decks?: readonly string[]): (c: Card) => boolean {
  if (!decks) return () => true;
  const names = decks.map((d) => col.decks[d]?.name).filter((n): n is string => !!n);
  const ids = new Set(Object.values(col.decks).filter((d) => names.some((n) => d.name === n || d.name.startsWith(`${n}::`))).map((d) => d.id));
  for (const d of decks) ids.add(d);
  return (c) => ids.has(c.deck);
}

/** A buried card whose day has come is dealt again. */
const live = (c: Card, now: number): Queue => (c.queue === 'buried' && (c.buriedUntil ?? 0) <= now ? queueFor(c.type) : c.queue);

/** Cards met for the first time today, and reviews answered today (Anki's daily limits). */
export function doneToday(col: Collection, now: number = Date.now()): { new: number; review: number } {
  const start = dayStart(now, configOf(col).rollover);
  let fresh = 0;
  let review = 0;
  for (let i = col.revlog.length - 1; i >= 0 && col.revlog[i].id >= start; i--) {
    const r = col.revlog[i];
    if (r.type === 'new') fresh++;
    else if (r.type === 'review') review++;
  }
  return { new: fresh, review };
}

interface Piles {
  learning: Card[];
  review: Card[];
  fresh: Card[];
  ahead: Card[];
}

function piles(col: Collection, now: number, decks?: readonly string[]): Piles {
  const cfg = configOf(col);
  const inDecks = deckFilter(col, decks);
  const end = dayAfter(now, 1, cfg.rollover);
  const p: Piles = { learning: [], review: [], fresh: [], ahead: [] };
  for (const c of Object.values(col.cards)) {
    if (!inDecks(c)) continue;
    const q = live(c, now);
    if (q === 'learning') (c.due <= now + LEARN_AHEAD ? p.learning : p.ahead).push(c);
    else if (q === 'review') (c.due < end ? p.review : p.ahead).push(c);
    else if (q === 'new') p.fresh.push(c);
  }
  p.learning.sort((a, b) => a.due - b.due);
  p.review.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
  p.fresh.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  // Not yet due: the card nearest to being forgotten first, then the soonest due.
  p.ahead.sort((a, b) => retrievability(a, now) - retrievability(b, now) || a.due - b.due);
  return p;
}

/** Anki's three numbers: new, learning and review cards left today. */
export function dayCounts(col: Collection, now: number = Date.now(), decks?: readonly string[]): DayCounts {
  const cfg = configOf(col);
  const p = piles(col, now, decks);
  const done = doneToday(col, now);
  return {
    new: Math.max(0, Math.min(p.fresh.length, cfg.newPerDay - done.new)),
    learning: p.learning.length,
    review: Math.max(0, Math.min(p.review.length, cfg.reviewsPerDay - done.review)),
  };
}

export interface Totals {
  new: number;
  learning: number;
  /** Review cards, due or not. */
  review: number;
  /** Review cards with an interval of 21 days or more, which Anki calls mature. */
  mature: number;
  suspended: number;
  /** When the next card not due today falls due, if any. */
  next?: number;
}

/** How many cards are in each state, for the review page. */
export function totals(col: Collection, now: number = Date.now(), decks?: readonly string[]): Totals {
  const t: Totals = { new: 0, learning: 0, review: 0, mature: 0, suspended: 0 };
  const inDecks = deckFilter(col, decks);
  for (const c of Object.values(col.cards)) {
    if (!inDecks(c)) continue;
    if (c.queue === 'suspended') t.suspended++;
    else if (c.type === 'new') t.new++;
    else if (c.type === 'review') {
      t.review++;
      if (c.interval >= 21) t.mature++;
    } else t.learning++;
    if (c.type !== 'new' && c.queue !== 'suspended' && c.due > now) t.next = Math.min(t.next ?? Infinity, c.due);
  }
  return t;
}

/**
 * Merge `extra` into `main` at even spacing, keeping each list's order.
 * `main` goes first when it has anything: a sitting opens on the most
 * overdue card, never on a new one. (Syrinx's weave.)
 */
export function weave<T>(main: readonly T[], extra: readonly T[]): T[] {
  if (!main.length) return extra.slice();
  const rest = main.slice(1);
  const out = [main[0]];
  let i = 0;
  let j = 0;
  while (i < rest.length || j < extra.length) {
    const takeExtra = j < extra.length && (i >= rest.length || (j + 0.5) / extra.length <= (i + 0.5) / rest.length);
    out.push(takeExtra ? extra[j++] : rest[i++]);
  }
  return out;
}

/**
 * The cards of a sitting, in order: learning cards due now, then reviews due
 * today (most overdue first) with new cards woven through them, within the
 * day's limits. A card answered Again comes back by `nextCard`, not here.
 */
export function studyQueue(col: Collection, now: number = Date.now(), o: QueueOptions = {}): string[] {
  const cfg = configOf(col);
  const p = piles(col, now, o.decks);
  const done = doneToday(col, now);
  const limit = o.limit ?? Infinity;
  const reviews = p.review.slice(0, Math.max(0, cfg.reviewsPerDay - done.review));
  const fresh = p.fresh.slice(0, Math.max(0, cfg.newPerDay - done.new));
  const room = Math.max(0, limit - p.learning.length);
  // New cards hold their share of the room; each tier gives back what it cannot use.
  const held = Math.min(fresh.length, Math.round((Number.isFinite(room) ? room : reviews.length + fresh.length) * (o.newShare ?? 0.3)));
  const rev = reviews.slice(0, Math.max(0, room - held));
  const meet = fresh.slice(0, Math.max(0, room - rev.length));
  return [...p.learning, ...weave(rev, meet)].slice(0, limit).map((c) => c.id);
}

/**
 * Cards not due yet, the nearest to being forgotten first: for a reader who
 * has done the day's cards and wants more. Answering one early is allowed;
 * its next interval grows a little less.
 */
export function reviewAhead(col: Collection, now: number = Date.now(), limit = 20, decks?: readonly string[]): string[] {
  return piles(col, now, decks).ahead.slice(0, limit).map((c) => c.id);
}

/**
 * The next card to show in a sitting: a learning card that has come due
 * (one answered Again a minute ago) before the rest of `queue`, which is
 * what is left of the sitting's cards. Returns the card's id and the queue
 * without it, or undefined when there is nothing left to show now.
 */
export function nextCard(col: Collection, queue: readonly string[], now: number = Date.now(), decks?: readonly string[]): { id: string; rest: string[] } | undefined {
  const inDecks = deckFilter(col, decks);
  const learning = (within: number) => Object.values(col.cards)
    .filter((c) => inDecks(c) && live(c, now) === 'learning' && c.lastReview !== undefined && c.due <= now + within)
    .sort((a, b) => a.due - b.due)[0];
  const due = learning(0);
  if (due) return { id: due.id, rest: queue.filter((x) => x !== due.id) };
  const rest = queue.filter((x) => {
    const q = col.cards[x] && live(col.cards[x], now);
    return q && q !== 'suspended' && q !== 'buried';
  });
  if (rest.length) return { id: rest[0], rest: rest.slice(1) };
  // Nothing else left: a learning card due within LEARN_AHEAD is shown now rather than waited for.
  const soon = learning(LEARN_AHEAD);
  return soon ? { id: soon.id, rest: [] } : undefined;
}

// ---- Old schedules and repair -----------------------------------------------------------

/**
 * A card from the Leitner boxes Didactics' first quiz kept (box 0 being
 * learned, then 1, 3, 7, 16, 35, 80 days): box 0 as a learning card, any
 * other box as a review card with its gap as the interval.
 */
export function fromLeitner(note: string, deck: string, box: number, due: number, now: number, gaps: readonly number[] = [0, 1, 3, 7, 16, 35, 80]): Card {
  const c = newCard(note, deck, now);
  if (box <= 0) return { ...c, type: 'learning', queue: 'learning', due, reps: 1, ease: DEFAULT_CONFIG.startingEase, lastReview: now };
  const interval = gaps[Math.min(box, gaps.length - 1)] || 1;
  return { ...c, type: 'review', queue: 'review', due, interval, reps: box, ease: DEFAULT_CONFIG.startingEase, lastReview: due - interval * DAY, stability: interval, difficulty: 5 };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);
const CARD_TYPES: readonly CardType[] = ['new', 'learning', 'review', 'relearning'];
const QUEUES: readonly Queue[] = ['new', 'learning', 'review', 'suspended', 'buried'];
const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof SchedulerConfig)[];

/** Repair whatever was stored into a collection, keeping all that can be kept. */
export function migrateCollection(raw: unknown, now: number = Date.now()): Collection {
  const col = emptyCollection(now);
  if (!isObj(raw)) return col;
  col.created = num(raw.created, now);
  if (isObj(raw.config)) {
    for (const k of CONFIG_KEYS) {
      const v = raw.config[k];
      if (v !== undefined && typeof v === typeof DEFAULT_CONFIG[k] && (Array.isArray(v) === Array.isArray(DEFAULT_CONFIG[k]))) {
        (col.config as Record<string, unknown>)[k] = Array.isArray(v) ? v.filter((x) => typeof x === 'number' && x > 0) : v;
      }
    }
  }
  if (isObj(raw.decks)) {
    for (const [id, d] of Object.entries(raw.decks)) {
      if (isObj(d) && str(d.name)) col.decks[id] = { id, name: d.name as string, created: num(d.created, now), ...(str(d.description) ? { description: d.description as string } : {}) };
    }
  }
  if (isObj(raw.notes)) {
    for (const [id, n] of Object.entries(raw.notes)) {
      if (!isObj(n) || str(n.front) === undefined) continue;
      const model: NoteModel = n.model === 'choice' && Array.isArray(n.choices) ? 'choice' : 'basic';
      const choices = model === 'choice' ? (n.choices as unknown[]).map((x) => String(x)) : undefined;
      col.notes[id] = {
        id,
        guid: str(n.guid) ?? guidFor(id),
        model,
        front: n.front as string,
        back: str(n.back) ?? '',
        ...(choices ? { choices, answer: Math.min(choices.length - 1, Math.max(0, Math.floor(num(n.answer)))) } : {}),
        ...(str(n.extra) ? { extra: n.extra as string } : {}),
        tags: Array.isArray(n.tags) ? [...new Set(n.tags.filter((t): t is string => typeof t === 'string'))] : [],
        ...(isObj(n.source) ? { source: n.source } : {}),
        created: num(n.created, now),
        modified: num(n.modified, now),
      };
    }
  }
  if (isObj(raw.cards)) {
    for (const [id, c] of Object.entries(raw.cards)) {
      if (!isObj(c) || !str(c.note) || !col.notes[c.note as string]) continue;
      const type = CARD_TYPES.includes(c.type as CardType) ? (c.type as CardType) : 'new';
      const queue = QUEUES.includes(c.queue as Queue) ? (c.queue as Queue) : queueFor(type);
      const deck = str(c.deck) ?? 'default';
      if (!col.decks[deck]) col.decks[deck] = { id: deck, name: deck === 'default' ? 'Default' : deck, created: now };
      col.cards[id] = {
        id,
        note: c.note as string,
        ord: Math.max(0, Math.floor(num(c.ord))),
        deck,
        type,
        queue,
        due: num(c.due, now),
        interval: Math.max(0, num(c.interval)),
        ease: Math.max(0, num(c.ease)),
        reps: Math.max(0, Math.floor(num(c.reps))),
        lapses: Math.max(0, Math.floor(num(c.lapses))),
        step: Math.max(0, Math.floor(num(c.step))),
        ...(typeof c.lastReview === 'number' ? { lastReview: c.lastReview } : {}),
        ...(typeof c.stability === 'number' && c.stability > 0 ? { stability: c.stability } : {}),
        ...(typeof c.difficulty === 'number' ? { difficulty: c.difficulty } : {}),
        ...(typeof c.buriedUntil === 'number' ? { buriedUntil: c.buriedUntil } : {}),
        created: num(c.created, now),
        modified: num(c.modified, now),
      };
    }
  }
  if (Array.isArray(raw.revlog)) {
    let last = 0;
    for (const r of raw.revlog) {
      if (!isObj(r) || !str(r.card) || !col.cards[r.card as string]) continue;
      const rating = Math.floor(num(r.rating));
      if (rating < 1 || rating > 4) continue;
      const id = Math.max(Math.floor(num(r.id)), last + 1);
      last = id;
      col.revlog.push({
        id,
        card: r.card as string,
        rating: rating as Rating,
        type: CARD_TYPES.includes(r.type as CardType) ? (r.type as CardType) : 'review',
        interval: num(r.interval),
        lastInterval: num(r.lastInterval),
        ease: num(r.ease),
        took: Math.max(0, num(r.took)),
      });
    }
  }
  return col;
}
