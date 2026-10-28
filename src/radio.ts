// Radio talks: the story a lesson app can tell beside its plain workbook. A
// talk is a few turns. In each turn the other station says something and the
// reader picks one of up to three replies; a reply can draw a line back, and
// then the talk goes on to the next turn whichever was picked, so the
// branches always rejoin. A reply marked `right` is the answer to a question:
// a wrong one is ribbed and explained, never scored. Each lesson can have a
// talk as it opens, which slip.ts types out on screen (lesson.ts), and one for
// its check, which is not played but frames the check's questions: its first
// line opens them and its last closes them (check.ts).

export interface Reply {
  say: string;
  /** The other station's answer to this reply, before the next turn. */
  back?: string;
  /** This reply is the right answer to the turn's question. */
  right?: boolean;
  /** Picking this reply switches the radio off (an opening talk can offer it). */
  off?: boolean;
}

export interface Turn {
  them: string;
  /** Up to three. With none, the reader just acknowledges. */
  replies?: Reply[];
}

/** When a talk comes on: as the lesson opens, or around its check. */
export type Cue = 'start' | 'check';

export interface Talk {
  id: string;
  cue: Cue;
  /** The transcript's dateline. */
  when: string;
  turns: Turn[];
}

/** One lesson's talks, as a JSON file holds them. */
export interface Radio {
  talks: Talk[];
}

/** The two ends of the line. */
export interface Stations {
  them: { call: string; place: string };
  you: { call: string; place: string };
}

/** What the reader says when a turn offers no choice. */
export const ACK = 'Roger. Over.';

/** Lines said, in order, given the reply picked at each turn. */
export function transcript(talk: Talk, picks: readonly number[] = [], ack = ACK): { who: 'them' | 'you'; text: string }[] {
  const out: { who: 'them' | 'you'; text: string }[] = [];
  talk.turns.forEach((turn, i) => {
    out.push({ who: 'them', text: turn.them });
    const reply = turn.replies?.[picks[i] ?? 0];
    out.push({ who: 'you', text: reply?.say ?? ack });
    if (reply?.back) out.push({ who: 'them', text: reply.back });
  });
  return out;
}
