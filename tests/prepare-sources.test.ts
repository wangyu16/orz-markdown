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
  it("inlines a URL include (both directive aliases)", async () => {
    const { fetcher } = mapFetcher({ "https://h/a.md": "AAA" });
    expect(await prepareSources("x {{markdown https://h/a.md}} y", { fetcher })).toBe("x AAA y");
    expect(await prepareSources("x {{md-include https://h/a.md}} y", { fetcher })).toBe("x AAA y");
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
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher })).toBe("A[B[C]]");
    // maxDepth caps recursion: depth 1 inlines a.md but leaves b.md's directive.
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher, maxDepth: 1 })).toBe(
      "A[B[{{md-include https://h/c.md}}]]",
    );
  });

  it("breaks include cycles (drops the repeated ancestor)", async () => {
    const { fetcher } = mapFetcher({
      "https://h/a.md": "A{{md-include https://h/b.md}}",
      "https://h/b.md": "B{{md-include https://h/a.md}}", // back-reference → cycle
    });
    // a → b → (a is an ancestor) drop. No infinite loop.
    expect(await prepareSources("{{md-include https://h/a.md}}", { fetcher })).toBe("AB");
  });

  it("allows the same URL in sibling positions (not a cycle)", async () => {
    const { fetcher } = mapFetcher({ "https://h/a.md": "A" });
    expect(
      await prepareSources("{{md-include https://h/a.md}} and {{md-include https://h/a.md}}", { fetcher }),
    ).toBe("A and A");
  });

  it("allowedHosts restricts which URLs are fetched (SSRF guard)", async () => {
    const { fetcher, calls } = mapFetcher({
      "https://ok.example/a.md": "OK",
      "http://169.254.169.254/latest/meta-data": "SECRET",
    });
    const src = "{{md-include https://ok.example/a.md}} {{md-include http://169.254.169.254/latest/meta-data}}";
    const out = await prepareSources(src, { fetcher, allowedHosts: ["ok.example"] });
    expect(out).toBe("OK {{md-include http://169.254.169.254/latest/meta-data}}");
    // The disallowed host is never even fetched.
    expect(calls).toEqual(["https://ok.example/a.md"]);
  });

  it("is a no-op with no directives", async () => {
    const { fetcher, calls } = mapFetcher({});
    expect(await prepareSources("plain text, no includes", { fetcher })).toBe("plain text, no includes");
    expect(calls).toEqual([]);
  });
});
