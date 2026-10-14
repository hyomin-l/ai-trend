import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/rss";

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>${items}</channel></rss>`;
const atom = (entries: string) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>${entries}</feed>`;

describe("parseFeed", () => {
  it("PRD-collector: parses RSS items with CDATA title and description", () => {
    const [it0] = parseFeed(
      rss(`<item>
        <title><![CDATA[Claude gets <b>faster</b>]]></title>
        <link>https://example.com/a</link>
        <description><![CDATA[<p>Hello <a href="x">world</a></p>]]></description>
        <pubDate>Tue, 13 Oct 2026 08:00:00 GMT</pubDate>
      </item>`),
    );
    expect(it0).toEqual({
      title: "Claude gets faster",
      url: "https://example.com/a",
      snippet: "Hello world",
      publishedAt: "2026-10-13T08:00:00.000Z",
    });
  });

  it("PRD-collector: Atom entry takes link href, preferring rel=alternate", () => {
    const [it0] = parseFeed(
      atom(`<entry>
        <title type="html">Entry one</title>
        <link rel="replies" href="https://example.com/comments"/>
        <link rel="alternate" type="text/html" href="https://example.com/post"/>
        <summary>Sum</summary>
        <published>2026-10-12T01:02:03Z</published>
        <updated>2026-10-13T00:00:00Z</updated>
      </entry>`),
    );
    expect(it0.url).toBe("https://example.com/post");
    expect(it0.title).toBe("Entry one");
    expect(it0.snippet).toBe("Sum");
    expect(it0.publishedAt).toBe("2026-10-12T01:02:03.000Z"); // published wins over updated
  });

  it("PRD-collector: Atom link without rel counts as alternate; updated is the date fallback", () => {
    const [it0] = parseFeed(
      atom(`<entry><title>x</title><link href="https://example.com/p"/><content type="html">&lt;p&gt;Body&lt;/p&gt;</content><updated>2026-10-13T00:00:00Z</updated></entry>`),
    );
    expect(it0.url).toBe("https://example.com/p");
    expect(it0.snippet).toBe("Body");
    expect(it0.publishedAt).toBe("2026-10-13T00:00:00.000Z");
  });

  it("PRD-collector: decodes named, decimal and hex entities", () => {
    const [it0] = parseFeed(
      rss(`<item><title>Q&amp;A: 5 &lt; 6 &gt; 4 &quot;quoted&quot; it&#39;s &#8212; &#x2019;ok</title><link>https://e.com/1</link><description>R&amp;D</description></item>`),
    );
    expect(it0.title).toBe("Q&A: 5 < 6 > 4 \"quoted\" it's — ’ok");
    expect(it0.snippet).toBe("R&D");
  });

  it("PRD-collector: entity-escaped HTML in description is stripped to text", () => {
    const [it0] = parseFeed(
      rss(`<item><title>t</title><link>https://e.com/1</link><description>&lt;p&gt;One &amp;amp; two&lt;/p&gt;&lt;p&gt;three&lt;/p&gt;</description></item>`),
    );
    expect(it0.snippet).toBe("One & two three");
  });

  it("PRD-collector: snippet is whitespace-collapsed and capped at 300 chars", () => {
    const long = "word ".repeat(200);
    const [it0] = parseFeed(
      rss(`<item><title>t</title><link>https://e.com/1</link><description>  a \n\n  b\t c  ${long}</description></item>`),
    );
    expect(it0.snippet.startsWith("a b c word")).toBe(true);
    expect(it0.snippet.length).toBeLessThanOrEqual(300);
    expect(it0.snippet).not.toMatch(/\s{2}/);
  });

  it("PRD-collector: invalid or missing date gives publishedAt undefined", () => {
    const items = parseFeed(
      rss(`<item><title>a</title><link>https://e.com/a</link><pubDate>not a date</pubDate></item>
           <item><title>b</title><link>https://e.com/b</link></item>`),
    );
    expect(items.map((i) => i.publishedAt)).toEqual([undefined, undefined]);
  });

  it("PRD-collector: dc:date is read when pubDate is absent", () => {
    const [it0] = parseFeed(
      rss(`<item><title>a</title><link>https://e.com/a</link><dc:date>2026-10-11T09:30:00+09:00</dc:date></item>`),
    );
    expect(it0.publishedAt).toBe("2026-10-11T00:30:00.000Z");
  });

  it("PRD-collector: items without title or url are skipped, order is preserved", () => {
    const items = parseFeed(
      rss(`<item><title>first</title><link>https://e.com/1</link></item>
           <item><title></title><link>https://e.com/2</link></item>
           <item><title>no link</title></item>
           <item><title>last</title><link>https://e.com/3</link></item>`),
    );
    expect(items.map((i) => i.title)).toEqual(["first", "last"]);
  });

  it("PRD-collector: non-feed input yields no items", () => {
    expect(parseFeed("<html><body>captcha</body></html>")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });

  it("PRD-collector: collects <category> (CDATA, plain, Atom term); items without categories carry no field", () => {
    const [a, b] = parseFeed(
      rss(`<item><title>a</title><link>https://e.com/a</link><category><![CDATA[Research]]></category><category>Safety &amp; Alignment</category></item>
           <item><title>b</title><link>https://e.com/b</link></item>`),
    );
    expect(a.categories).toEqual(["Research", "Safety & Alignment"]);
    expect("categories" in b).toBe(false);
    const [c] = parseFeed(atom(`<entry><title>c</title><link href="https://e.com/c"/><category term="Research"/></entry>`));
    expect(c.categories).toEqual(["Research"]);
  });
});
