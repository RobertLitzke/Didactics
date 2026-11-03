// A course's figure kit from its palette: the pieces every course wrote for
// itself in its figures/kit.ts, filled in with the course's COL once.
//
//   export const COL = { ink: '#2a2547', parcel: '#e0663f', … } as const;
//   export const { slider, prose, tint } = courseKit(COL);
//
// `slider` is figure.ts's slider taking a colour's name for the thumb instead
// of a CSS colour, `prose` is lesson.ts's prose with the palette filled in
// (so [[words|parcel]] is coloured), and `tint` fades a colour for a fill.

import { slider as kitSlider, type Slider, type SliderOptions } from './figure';
import type { FootnoteSet } from './footnote';
import { prose as kitProse } from './lesson';

export interface CourseKit<K extends string> {
  /**
   * A labelled slider whose thumb wears one of the palette's colours; the
   * options form takes `steps` or `scale: 'log'` (figure.ts SliderOptions).
   */
  slider: {
    (label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void, color?: K): Slider;
    (label: string, o: Omit<SliderOptions, 'color'> & { color?: K }): Slider;
  };
  /** A paragraph of lesson text: **bold**, *italic*, [[words|key]] in the colour COL[key], [[entry]] links and [^id] footnotes from `notes`. */
  prose: (text: string, notes?: FootnoteSet) => HTMLElement;
  /** A colour at the given opacity, for a translucent fill. */
  tint: (hex: string, alpha: number) => string;
}

/** A colour at the given opacity, for a translucent fill: tint('#e0663f', 0.3). */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The kit for a palette whose `ink` is the default colour. */
export function courseKit<K extends string>(palette: Readonly<Record<K, string>> & { ink: string }): CourseKit<K> {
  const colour = (k?: K) => (k ? palette[k] : palette.ink);
  function slider(label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, onInput: (v: number) => void, color?: K): Slider;
  function slider(label: string, o: Omit<SliderOptions, 'color'> & { color?: K }): Slider;
  function slider(label: string, a: number | (Omit<SliderOptions, 'color'> & { color?: K }), max?: number, step?: number, value?: number, show?: (v: number) => string, onInput?: (v: number) => void, color?: K): Slider {
    if (typeof a === 'object') return kitSlider(label, { ...a, color: colour(a.color) });
    return kitSlider(label, a, max!, step!, value!, show!, onInput!, colour(color));
  }
  return { slider, prose: (text, notes) => kitProse(text, palette, notes), tint };
}
