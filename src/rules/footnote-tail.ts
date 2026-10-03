/**
 * markdown-it-footnote's `footnote_tail` core rule, ported (MIT, © Vitaly
 * Puzrin, Alex Kocharin) with one change: the footnote list is appended to
 * `state.tokens` in place. The original rebuilds the whole token array once
 * per footnote (`state.tokens = state.tokens.concat(tokens)`), which is
 * quadratic: 10,000 footnotes took ~3.5 s in plain markdown-it-footnote too
 * (round 18, H6). Output is token-for-token identical.
 */
import type MarkdownIt from 'markdown-it';

type Token = MarkdownIt.Token;
type FootnoteEnv = {
  footnotes?: { list?: Array<{ label?: string; content?: string; tokens?: Token[]; count: number }> };
};

export function footnoteTail(state: MarkdownIt.StateCore): void {
  const env = state.env as FootnoteEnv;
  let current: Token[] = [];
  let currentLabel = '';
  let insideRef = false;
  const refTokens: Record<string, Token[]> = {};

  if (!env.footnotes) return;

  state.tokens = state.tokens.filter((tok) => {
    if (tok.type === 'footnote_reference_open') {
      insideRef = true;
      current = [];
      currentLabel = (tok.meta as { label: string }).label;
      return false;
    }
    if (tok.type === 'footnote_reference_close') {
      insideRef = false;
      refTokens[':' + currentLabel] = current; // ':' avoids Object.prototype members
      return false;
    }
    if (insideRef) current.push(tok);
    return !insideRef;
  });

  if (!env.footnotes.list) return;
  const list = env.footnotes.list;
  const out = state.tokens;

  out.push(new state.Token('footnote_block_open', '', 1));

  for (let i = 0, l = list.length; i < l; i++) {
    const tokenFo = new state.Token('footnote_open', '', 1);
    tokenFo.meta = { id: i, label: list[i].label };
    out.push(tokenFo);

    let tokens: Token[] | undefined;
    if (list[i].tokens) {
      tokens = [];
      const tokenPo = new state.Token('paragraph_open', 'p', 1);
      tokenPo.block = true;
      tokens.push(tokenPo);
      const tokenI = new state.Token('inline', '', 0);
      tokenI.children = list[i].tokens!;
      tokenI.content = list[i].content ?? '';
      tokens.push(tokenI);
      const tokenPc = new state.Token('paragraph_close', 'p', -1);
      tokenPc.block = true;
      tokens.push(tokenPc);
    } else if (list[i].label) {
      tokens = refTokens[`:${list[i].label}`];
    }

    if (tokens) for (const t of tokens) out.push(t);

    let lastParagraph: Token | null = null;
    if (out[out.length - 1].type === 'paragraph_close') lastParagraph = out.pop()!;

    const t = list[i].count > 0 ? list[i].count : 1;
    for (let j = 0; j < t; j++) {
      const tokenA = new state.Token('footnote_anchor', '', 0);
      tokenA.meta = { id: i, subId: j, label: list[i].label };
      out.push(tokenA);
    }

    if (lastParagraph) out.push(lastParagraph);
    out.push(new state.Token('footnote_close', '', -1));
  }

  out.push(new state.Token('footnote_block_close', '', -1));
}
