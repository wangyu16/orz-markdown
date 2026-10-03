/**
 * HTML equivalence for round-trip oracles. Strict where the round-1 audit found
 * the old oracle too lenient: whitespace inside <pre> is compared exactly, and
 * ids are compared unless the caller says the source carries block ids (which
 * are deliberately not copied, CLAIMS C.12). Elsewhere only ASCII whitespace
 * runs collapse; U+3000 and nbsp stay significant.
 */
export function normalize(html: string, opts: { ignoreIds?: boolean } = {}): string {
  const pres: string[] = [];
  let out = html.replace(/<pre[\s\S]*?<\/pre>/g, (m) => `\u0000${pres.push(m) - 1}\u0000`);
  if (opts.ignoreIds) out = out.replace(/\s(id|tabindex)="[^"]*"/g, '');
  else out = out.replace(/\stabindex="[^"]*"/g, '');
  // A boolean attribute and its empty-string form are the same HTML
  // (`controls` vs `controls=""`, as serialized by outerHTML).
  out = out.replace(/(<[^>]*?\s[\w-]+)=""/g, '$1');
  out = out.replace(/>[ \t\n\r\f]+</g, '><').replace(/[ \t\n\r\f]+/g, ' ').trim();
  return out.replace(/\u0000(\d+)\u0000/g, (_m, n) => pres[+n]);
}
