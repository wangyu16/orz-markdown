/**
 * The family brand in the chrome (spec/shell-runtime.md §8, 2.2.0): the orz
 * seal — the "orz" wordmark knocked out of a weathered green seal, from
 * orz-mdhtml 0.9.3 (wangyu16/logoes-and-icons, orz.svg) — and the GitHub
 * mark, as constants, with the one function that writes them into an
 * element of a chrome shadow root. The carrier app shows them, quietly, in
 * edit mode (spec/carrier-app.md §4.2): the seal links to
 * {@link ORZ_MARKDOWN_SITE}, the GitHub mark to the kind's repository.
 *
 * Like `ICONS`, they are constants of this module (never page or document
 * content): `aria-hidden`, no script, no event handler, no external
 * reference — the seal's filters and mask refer only to its own ids, all
 * namespaced `orzlogo-*` (one seal per shadow root). No DOM at module load.
 */
import type { UiDocument, UiElement } from './types.js';

/** The orz-markdown website (the seal's link). */
export const ORZ_MARKDOWN_SITE = 'https://markdown.orz.how';

/** The orz seal (viewBox 180 × 100; draw it about 18–20 px tall). Ids are namespaced `orzlogo-*`. */
export const ORZ_SEAL_SVG =
  "<svg viewBox=\"-5 -5 180 100\" xmlns=\"http://www.w3.org/2000/svg\" class=\"orz-mark\" aria-hidden=\"true\"><defs><filter id=\"orzlogo-rough\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.04\" numOctaves=\"3\" result=\"noise\" /><feDisplacementMap in=\"SourceGraphic\" in2=\"noise\" scale=\"2.5\" xChannelSelector=\"R\" yChannelSelector=\"G\" /></filter><path d=\"M 20,23 C 33,16 57,17 84,13 C 111,8 137,4 153,6 C 165,7 170,13 169,25 L 167,66 C 166,79 159,87 146,89 C 121,93 92,92 60,91 C 41,90 27,92 16,89 C 6,86 1,79 1,67 L 1,50 C 1,35 7,25 20,23 Z\" id=\"orzlogo-seal\" /><filter id=\"orzlogo-stone\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.95\" numOctaves=\"2\" seed=\"11\" result=\"noise\" /><feColorMatrix in=\"noise\" type=\"saturate\" values=\"0\" result=\"mono\" /><feComponentTransfer in=\"mono\" result=\"grain\"><feFuncA type=\"table\" tableValues=\"0 0.16\" /></feComponentTransfer></filter><mask id=\"orzlogo-mask\"><use href=\"#orzlogo-seal\" fill=\"white\" /><path d=\"M37.81 80.31Q30.44 80.31 24.50 77Q18.56 73.69 15.25 67.75Q11.94 61.81 11.94 54.19L11.94 54.19Q11.94 41.69 21.13 35.56Q30.31 29.44 43.69 29.44L43.69 29.44Q49.81 29.44 55.13 32.44Q60.44 35.44 63.69 41.06Q66.94 46.69 66.94 54.06L66.94 54.06Q66.94 62.06 62.81 68Q58.69 73.94 52 77.13Q45.31 80.31 37.81 80.31L37.81 80.31ZM36.44 73.19Q48.06 73.19 54.06 67.94Q60.06 62.69 60.06 52.56L60.06 52.56Q60.06 45.69 55.38 40.69Q50.69 35.69 42.31 35.69L42.31 35.69Q36.69 35.69 30.94 37.81Q25.19 39.94 21.44 44.19Q17.69 48.44 17.69 54.44L17.69 54.44Q17.69 59.44 20.19 63.75Q22.69 68.06 27 70.63Q31.31 73.19 36.44 73.19L36.44 73.19ZM87.94 80.19Q82.81 70.19 79.88 56.69Q76.94 43.19 76.94 33.31L76.94 33.31Q76.94 29.44 78.69 28.31L78.69 28.31Q79.69 27.69 80.19 27.69L80.19 27.69Q81.06 27.69 81.50 29.06Q81.94 30.44 82.44 34.06L82.44 34.06L83.06 38.56Q84.44 31.81 88.38 27.88Q92.31 23.94 98.06 23.94L98.06 23.94Q104.44 23.94 107.56 26.38Q110.69 28.81 110.69 34.44L110.69 34.44Q104.44 31.44 99.31 31.44L99.31 31.44Q94.44 31.44 90.94 34.06Q87.44 36.69 86.06 41.81L86.06 41.81Q84.94 45.31 84.94 48.44L84.94 48.44Q84.94 51.81 85.88 54.75Q86.81 57.69 88.81 61.94L88.81 61.94Q90.69 66.31 91.75 69.44Q92.81 72.56 92.94 76.19L92.94 76.19Q92.94 78.31 91.44 79.25Q89.94 80.19 87.94 80.19L87.94 80.19ZM160.56 66.19Q163.06 68.06 163.06 70.19L163.06 70.19Q163.06 73.56 157.31 75.81Q151.56 78.06 144.31 79.13Q137.06 80.19 132.81 80.19L132.81 80.19Q128.06 80.19 123.75 78.63Q119.44 77.06 119.44 73.19L119.44 73.19Q119.44 69.44 123.63 63.44Q127.81 57.44 133.69 51.19L133.69 51.19L117.56 51.19Q116.31 51.19 116.31 48.94L116.31 48.94Q116.31 47.19 116.69 46.50Q117.06 45.81 117.69 45.69Q118.31 45.56 120.06 45.56L120.06 45.56L139.31 45.56Q143.94 39.69 146.38 35.50Q148.81 31.31 148.81 27.69L148.81 27.69Q148.81 24.06 146.31 21.19L146.31 21.19Q142.44 20.44 138.81 20.44L138.81 20.44Q131.94 20.44 127.19 22.75Q122.44 25.06 121.94 28.81L121.94 28.81Q119.06 28.81 118.13 27.81Q117.19 26.81 117.19 24.44L117.19 24.44Q117.19 21.94 119.75 19.63Q122.31 17.31 126.94 15.88Q131.56 14.44 137.31 14.44L137.31 14.44Q142.06 14.44 147.31 15.56L147.31 15.56Q150.56 16.19 152.81 19.69Q155.06 23.19 155.06 27.44L155.06 27.44Q155.06 31.19 152.75 35.31Q150.44 39.44 145.94 45.56L145.94 45.56L152.06 45.56Q156.81 45.56 158.38 46.06Q159.94 46.56 159.94 48.06L159.94 48.06Q159.94 49.31 159.13 50.19Q158.31 51.06 157.44 51.06L157.44 51.06L140.19 51.06Q134.06 57.94 130.81 63.25Q127.56 68.56 128.19 70.81L128.19 70.81Q128.69 73.19 135.94 74.06L135.94 74.06Q144.06 74.06 149.69 72.13Q155.31 70.19 160.56 66.19L160.56 66.19Z\" fill=\"black\" stroke=\"black\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\" /></mask></defs><g filter=\"url(#orzlogo-rough)\"><use href=\"#orzlogo-seal\" fill=\"#96d969\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"#6ea84d\" opacity=\"0.28\" filter=\"url(#orzlogo-stone)\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"none\" stroke=\"#c8f7a5\" stroke-width=\"1.5\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-opacity=\"0.42\" mask=\"url(#orzlogo-mask)\" /><use href=\"#orzlogo-seal\" fill=\"none\" stroke=\"#5f8f44\" stroke-width=\"1.2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-opacity=\"0.35\" mask=\"url(#orzlogo-mask)\" /></g></svg>";

/** The GitHub mark (16 × 16, `currentColor`). */
export const GITHUB_MARK_SVG =
  "<svg viewBox=\"0 0 16 16\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z\"/></svg>";

/** The brand marks {@link brandMark} draws. */
export const BRAND_MARKS = { seal: ORZ_SEAL_SVG, github: GITHUB_MARK_SVG } as const;
export type BrandMarkName = keyof typeof BRAND_MARKS;

/** The brand's one markup write: a mark constant into its own span. */
type MarkSpan = UiElement & { innerHTML: string };

/** A span (`orz-brand-mark orz-brand-mark--<name>`, `aria-hidden`) holding one of {@link BRAND_MARKS}. */
export function brandMark(doc: UiDocument, name: BrandMarkName): UiElement {
  const span = doc.createElement('span') as MarkSpan;
  span.className = `orz-brand-mark orz-brand-mark--${name}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = name === 'seal' ? ORZ_SEAL_SVG : GITHUB_MARK_SVG;
  return span;
}
