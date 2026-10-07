import { describe, it, expect } from "vitest";
import { prepareSources } from "../src/prepare-sources.js";

/** A fetcher backed by an in-memory map (no network). */
function mapFetcher(map: Record<string, string>) {
  const calls: string[] = [];
  const fetcher = async (url: string): Promise<string | null> => {
    calls.push(url);
    return url in map ? map[url] : null;
  };
  return { fetcher, calls };
}

describe("prepareSources", () => {
  // Fetched text is block content: a directive mid-paragraph splits it there.
  it("inlines a URL include (both directive aliases)", async () => {
    const { fetcher } = mapFetcher({ "https://h/a.md": "AAA" });
    expect(await prepareSources("x {{markdown https://h/a.md}} y", { fetcher })).toBe("x\n\nAAA\n\ny");
    expect(await prepareSources("x {{md-include https://h/a.md}} y", { fetcher })).toBe("x\n\nAAA\n\ny");
  });

  it("leaves the directive in place when the fetch returns null (never throws)", async () => {
    const { fetcher } = mapFetcher({});
    const src = "before {{md-include https://h/missing.md}} after";
    expect(await prepareSources(src, { fetcher })).toBe(src);
  });

  it("does not corrupt fetched content containing $ replacement patterns", async () => {
    // String.replace would interpret `$&`/`$1`; the index-splice must not.
    const { fetcher } = mapFetcher({ "https://h/a.md": "cost is $5 and $& and $1 literally" });
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher })).toBe(
      "cost is $5 and $& and $1 literally",
    );
  });

  it("resolves nested includes up to maxDepth", async () => {
    const { fetcher } = mapFetcher({
      "https://h/a.md": "A[{{md-include https://h/b.md}}]",
      "https://h/b.md": "B[{{md-include https://h/c.md}}]",
      "https://h/c.md": "C",
    });
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher })).toBe("A[\n\nB[\n\nC\n\n]\n\n]");
    // maxDepth caps recursion: depth 1 inlines a.md but leaves b.md's directive.
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher, maxDepth: 1 })).toBe(
      "A[\n\nB[{{md-include https://h/c.md}}]\n\n]",
    );
  });

  it("breaks include cycles (drops the repeated ancestor)", async () => {
    const { fetcher } = mapFetcher({
      "https://h/a.md": "A{{md-include https://h/b.md}}",
      "https://h/b.md": "B{{md-include https://h/a.md}}", // back-reference → cycle
    });
    // a → b → (a is an ancestor) drop. No infinite loop.
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher })).toBe("A\n\nB");
  });

  it("allows the same URL in sibling positions (not a cycle)", async () => {
    const { fetcher } = mapFetcher({ "https://h/a.md": "A" });
    expect(
      await prepareSources("{{md-include https://h/a.md}} and {{md-include https://h/a.md}}", { fetcher }),
    ).toBe("A\n\nand\n\nA");
  });

  it("allowedHosts restricts which URLs are fetched (SSRF guard)", async () => {
    const { fetcher, calls } = mapFetcher({
      "https://ok.example/a.md": "OK",
      "http://169.254.169.254/latest/meta-data": "SECRET",
    });
    const src = "{{md-include https://ok.example/a.md}} {{md-include http://169.254.169.254/latest/meta-data}}";
    const out = await prepareSources(src, { fetcher, allowedHosts: ["ok.example"] });
    // On one line, splicing the first would leave the refused one at a line
    // start, where it renders as nothing: both stay as written (final check, F2).
    expect(out).toBe(src);
    // The disallowed host is never even fetched.
    expect(calls).toEqual(["https://ok.example/a.md"]);
    const lines = "{{md-include https://ok.example/a.md}}\n\n{{md-include http://169.254.169.254/latest/meta-data}}";
    expect(await prepareSources(lines, { fetcher, allowedHosts: ["ok.example"] })).toBe("OK\n\n{{md-include http://169.254.169.254/latest/meta-data}}");
    expect(calls).toEqual(["https://ok.example/a.md", "https://ok.example/a.md"]);
  });

  it("is a no-op with no directives", async () => {
    const { fetcher, calls } = mapFetcher({});
    expect(await prepareSources("plain text, no includes", { fetcher })).toBe("plain text, no includes");
    expect(calls).toEqual([]);
  });
});

describe('include directive names (2.2.0)', () => {
  it('[M.11] the include directive names are ONE list (INCLUDE_DIRECTIVES): every name the renderer registers as an include resolves a URL include in prepareSources — on its own line, mid-paragraph, in a list item and a quote — and a scheme in any case (HTTPS://) is a URL to both', async () => {
    const { INCLUDE_DIRECTIVES } = await import('../src/plugins/markdown-include.js');
    const { getDefinition } = await import('../src/registry.js');
    const { md } = await import('../src/index.js');
    const fetched: string[] = [];
    const fetcher = async (u: string) => { fetched.push(u); return `FETCHED ${fetched.length}\n`; };
    expect([...INCLUDE_DIRECTIVES].sort()).toEqual(['markdown', 'md', 'md-include']);
    const include = getDefinition('md-include');
    for (const name of INCLUDE_DIRECTIVES) {
      expect(getDefinition(name), name).toBe(include); // the renderer's include plugin, under every name
      for (const [where, src] of [['block', `a\n\n{{${name} https://x.test/a.md}}\n\nb\n`], ['inline', `a {{${name} https://x.test/a.md}} b\n`], ['list', `- {{${name} https://x.test/a.md}}\n`], ['quote', `> {{${name} https://x.test/a.md}}\n`]] as const) {
        const before = fetched.length;
        const out = await prepareSources(src, { fetcher });
        expect(fetched.length, `${name} ${where}`).toBe(before + 1);
        expect(out, `${name} ${where}`).toContain('FETCHED');
      }
    }
    // the scheme's case: a URL to the renderer (it renders nothing for it), resolved by prepareSources
    const upper = 'a\n\n{{md HTTPS://x.test/UP.md}}\n\nb\n';
    expect(md.render(upper)).not.toContain('HTTPS://');
    expect(await prepareSources(upper, { fetcher })).toContain('FETCHED');
    expect(fetched.at(-1)).toBe('HTTPS://x.test/UP.md');
    // an unknown name is not an include for either
    expect(await prepareSources('{{mdx https://x.test/a.md}}\n', { fetcher })).toBe('{{mdx https://x.test/a.md}}\n');
  });
});
