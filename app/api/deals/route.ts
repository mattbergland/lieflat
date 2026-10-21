import { XMLParser } from "fast-xml-parser";

export const revalidate = 1800;

type DealTag =
  | "Mistake fare"
  | "Award alert"
  | "Transfer bonus"
  | "Cash deal"
  | "News";

type Feed = {
  url: string;
  source: string;
  google: boolean;
};

type Deal = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tag: DealTag;
};

const feeds: Feed[] = [
  {
    url: "https://news.google.com/rss/search?q=%22business+class%22+(%22mistake+fare%22+OR+%22error+fare%22+OR+%22award+alert%22+OR+deal)+when:14d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    google: true,
  },
  {
    url: "https://news.google.com/rss/search?q=%22first+class%22+(%22mistake+fare%22+OR+%22error+fare%22+OR+%22award+alert%22)+when:14d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    google: true,
  },
  {
    url: "https://news.google.com/rss/search?q=%22transfer+bonus%22+(miles+OR+points)+when:14d&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    google: true,
  },
  { url: "https://onemileatatime.com/feed/", source: "One Mile at a Time", google: false },
  {
    url: "https://viewfromthewing.com/feed/",
    source: "View from the Wing",
    google: false,
  },
  { url: "https://frequentmiler.com/feed/", source: "Frequent Miler", google: false },
  { url: "https://godsavethepoints.com/feed/", source: "God Save the Points", google: false },
  { url: "https://www.fly4free.com/feed/", source: "Fly4free", google: false },
  {
    url: "https://www.theflightdeal.com/feed/",
    source: "The Flight Deal",
    google: false,
  },
];

const cabinTopic =
  /\b(business class|first class|lie-?flat|qsuites?|polaris|delta one|mint|premium cabin|mistake fare|error fare|award alert|transfer bonus|business|first)\b/i;
const blogDealTopic = /(fare|deal|award|bonus|sale|\$\d|from \d|miles each way|points)/i;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as { "#text": unknown })["#text"]);
  }
  return "";
}

function tagFor(title: string): DealTag {
  if (/mistake|error fare|glitch/i.test(title)) return "Mistake fare";
  if (/award alert|saver|award space|miles each way|points each way/i.test(title)) {
    return "Award alert";
  }
  if (/transfer bonus|% bonus/i.test(title)) return "Transfer bonus";
  if (/\$\d|sale|deal/i.test(title)) return "Cash deal";
  return "News";
}

function parseFeed(xml: string, feed: Feed): Deal[] {
  const document = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown | unknown[] } };
    feed?: { entry?: unknown | unknown[] };
  };
  const entries = asArray(
    document.rss?.channel?.item ?? document.feed?.entry,
  ) as Record<string, unknown>[];

  return entries.flatMap((entry) => {
    let title = text(entry.title).trim();
    if (!title || /^\[Expired\]/i.test(title) || !cabinTopic.test(title)) return [];
    if (!feed.google && !blogDealTopic.test(title)) return [];

    let source = feed.source;
    if (feed.google) {
      const match = title.match(/\s+-\s+([^-]+)$/);
      if (match) {
        source = match[1].trim();
        title = title.slice(0, match.index).trim();
      }
    }

    const link = entry.link;
    const url =
      typeof link === "string"
        ? link
        : link && typeof link === "object" && "@href" in link
          ? String((link as { "@href": unknown })["@href"])
          : "";
    const publishedAt = text(
      entry.pubDate ?? entry.published ?? entry.updated ?? entry.date,
    );

    if (!url) return [];
    return [{ title, source, url, publishedAt, tag: tagFor(title) }];
  });
}

export async function GET() {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh)" },
        next: { revalidate: 1800 },
      });
      if (!response.ok) throw new Error(`Feed returned ${response.status}`);
      return parseFeed(await response.text(), feed);
    }),
  );

  const unique = new Map<string, Deal>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      const normalized = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!unique.has(normalized)) unique.set(normalized, item);
    }
  }

  const items = [...unique.values()]
    .sort(
      (first, second) =>
        new Date(second.publishedAt).getTime() -
        new Date(first.publishedAt).getTime(),
    )
    .slice(0, 60);

  return Response.json({ items, count: items.length });
}
