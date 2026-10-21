"use client";

import { useEffect, useMemo, useState } from "react";
import type { Currency, PointsData, Program } from "@/lib/points";
import { sourceProgramIds } from "@/lib/points";

type SectionId = "radar" | "points" | "deals";
type AwardSearch = {
  origin: string;
  destination: string;
  start: string;
  end: string;
  cabin: "business" | "first";
};
type AwardRecord = {
  Date?: string;
  Route?: { OriginAirport?: string; DestinationAirport?: string };
  Source?: string;
  JAvailable?: boolean | string;
  FAvailable?: boolean | string;
  JMileageCost?: string;
  FMileageCost?: string;
  JRemainingSeats?: number | string;
  FRemainingSeats?: number | string;
  JAirlines?: string | string[];
  FAirlines?: string | string[];
  JDirect?: boolean | string;
  FDirect?: boolean | string;
  TaxesCurrency?: string;
};
type AwardResponse = {
  configured?: boolean;
  data?: AwardRecord[];
  error?: string;
};
type DealTag =
  | "Mistake fare"
  | "Award alert"
  | "Transfer bonus"
  | "Cash deal"
  | "News";
type Deal = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tag: DealTag;
};
type SavedSearch = AwardSearch & { id: string };
type Props = { points: PointsData };

const sectionNames: { id: SectionId; label: string; index: string }[] = [
  { id: "radar", label: "Award Radar", index: "01" },
  { id: "points", label: "Points Path", index: "02" },
  { id: "deals", label: "Fare Glitches", index: "03" },
];

const shortCurrencyNames: Record<string, string> = {
  amex: "Amex MR",
  chase: "Chase UR",
  capone: "Capital One",
  citi: "Citi TY",
  bilt: "Bilt",
};

const dealTags: DealTag[] = [
  "Mistake fare",
  "Award alert",
  "Transfer bonus",
  "Cash deal",
  "News",
];

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const today = new Date();
const defaultSearch: AwardSearch = {
  origin: "JFK",
  destination: "NRT",
  start: dateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)),
  end: dateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60)),
  cabin: "business",
};

async function fetchAwards(search: AwardSearch): Promise<AwardResponse> {
  const query = new URLSearchParams(search);
  const response = await fetch(`/api/awards?${query}`, { cache: "no-store" });
  return (await response.json()) as AwardResponse;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value?: string) {
  if (!value) return "Date to be confirmed";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function relativeDate(value: string) {
  const published = new Date(value).getTime();
  if (!Number.isFinite(published)) return "Recently";
  const minutes = Math.round((published - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function airlinesFor(record: AwardRecord, cabin: AwardSearch["cabin"]) {
  const value = cabin === "business" ? record.JAirlines : record.FAirlines;
  if (Array.isArray(value)) return value.join(", ");
  return value || "Airline not listed";
}

function isDirect(record: AwardRecord, cabin: AwardSearch["cabin"]) {
  const value = cabin === "business" ? record.JDirect : record.FDirect;
  return value === true || value === "true" || value === "True";
}

function selectedAvailable(record: AwardRecord, cabin: AwardSearch["cabin"]) {
  const value = cabin === "business" ? record.JAvailable : record.FAvailable;
  return value === true || value === "true" || value === "True";
}

function transferSources(program: Program, currencies: Currency[]) {
  return currencies.flatMap((currency) => {
    const ratio = program.transfers[currency.id as keyof typeof program.transfers];
    return ratio
      ? [{ currency, ratio: ratio as number }]
      : [];
  });
}

export default function LieFlatApp({ points }: Props) {
  const [section, setSection] = useState<SectionId>("radar");
  const [search, setSearch] = useState<AwardSearch>(defaultSearch);
  const [awardResponse, setAwardResponse] = useState<AwardResponse | null>(null);
  const [awardLoading, setAwardLoading] = useState(true);
  const [awardError, setAwardError] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([
    "amex",
    "chase",
  ]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [fromRegion, setFromRegion] = useState("na");
  const [toRegion, setToRegion] = useState("eu");
  const [cabin, setCabin] = useState<"business" | "first">("business");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealFilter, setDealFilter] = useState<"All" | DealTag>("All");
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState("");

  const programs = useMemo(
    () => new Map(points.programs.map((program) => [program.id, program])),
    [points.programs],
  );
  const filteredAwards = useMemo(
    () =>
      points.awards
        .filter(
          (award) =>
            award.from === fromRegion &&
            award.to === toRegion &&
            award.cabin === cabin,
        )
        .sort((first, second) => first.miles - second.miles),
    [points.awards, fromRegion, toRegion, cabin],
  );

  useEffect(() => {
    let current = true;
    void fetchAwards(defaultSearch)
      .then((result) => {
        if (current) setAwardResponse(result);
      })
      .catch(() => {
        if (current) setAwardError("The search could not be reached. Try again.");
      })
      .finally(() => {
        if (current) setAwardLoading(false);
      });

    void Promise.resolve()
      .then(() => {
        const saved = localStorage.getItem("lieflat-watchlist");
        if (saved && current) setSavedSearches(JSON.parse(saved) as SavedSearch[]);
      })
      .catch(() => {
        if (current) setSavedSearches([]);
      });

    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (section !== "deals") return;
    let current = true;
    void Promise.resolve()
      .then(() => {
        if (!current) return null;
        setDealsLoading(true);
        return fetch("/api/deals").then(async (response) => {
          if (!response.ok) throw new Error("Could not load the feed.");
          return (await response.json()) as { items?: Deal[] };
        });
      })
      .then((result) => {
        if (current && result) setDeals(result.items ?? []);
      })
      .catch(() => {
        if (current) setDealsError("The feed is temporarily unavailable.");
      })
      .finally(() => {
        if (current) setDealsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [section]);

  const programById = programs;
  const paths = filteredAwards.map((award) => {
    const program = programById.get(award.program);
    const currencies = program
      ? transferSources(
          program,
          points.currencies.filter((currency) =>
            selectedCurrencies.includes(currency.id),
          ),
        ).map(({ currency, ratio }) => {
          const needed = Math.ceil(award.miles / ratio);
          const entered = balances[currency.id]?.trim();
          const balance =
            entered === undefined || entered === "" ? undefined : Number(entered);
          return {
            currency,
            ratio,
            needed,
            balance,
            shortfall:
              balance !== undefined && Number.isFinite(balance)
                ? Math.max(0, needed - balance)
                : 0,
            covered:
              balance === undefined ||
              !Number.isFinite(balance) ||
              balance >= needed,
          };
        })
      : [];
    return { award, program, currencies };
  });
  const bestPath = paths.find(
    (path) => path.program && path.currencies.some((currency) => currency.covered),
  );
  const visibleDeals =
    dealFilter === "All" ? deals : deals.filter((deal) => deal.tag === dealFilter);

  async function runSearch(nextSearch = search) {
    setAwardLoading(true);
    setAwardError("");
    try {
      const result = await fetchAwards(nextSearch);
      setAwardResponse(result);
    } catch {
      setAwardError("The search could not be reached. Try again.");
    } finally {
      setAwardLoading(false);
    }
  }

  function updateSearch<K extends keyof AwardSearch>(
    key: K,
    value: AwardSearch[K],
  ) {
    setSearch((current) => ({ ...current, [key]: value }));
  }

  function saveSearch() {
    const next = [
      {
        ...search,
        id: `${search.origin}-${search.destination}-${search.start}-${search.cabin}`,
      },
      ...savedSearches.filter(
        (saved) =>
          saved.origin !== search.origin ||
          saved.destination !== search.destination ||
          saved.start !== search.start ||
          saved.end !== search.end ||
          saved.cabin !== search.cabin,
      ),
    ];
    setSavedSearches(next);
    localStorage.setItem("lieflat-watchlist", JSON.stringify(next));
  }

  function removeSavedSearch(id: string) {
    const next = savedSearches.filter((saved) => saved.id !== id);
    setSavedSearches(next);
    localStorage.setItem("lieflat-watchlist", JSON.stringify(next));
  }

  function toggleCurrency(id: string) {
    setSelectedCurrencies((current) =>
      current.includes(id)
        ? current.filter((currency) => currency !== id)
        : [...current, id],
    );
  }

  const deepLink = `https://seats.aero/search?origins=${encodeURIComponent(search.origin)}&destinations=${encodeURIComponent(search.destination)}`;

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Lie-Flat home">
          lie<span>—</span>flat
        </a>
        <div className="topbar-meta">
          <span className="status-dot" aria-hidden="true" />
          <span>AWARD INTELLIGENCE</span>
        </div>
        <a className="topbar-link" href="#tools">
          Open the planner <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">THE PREMIUM-CABIN PLAYBOOK</p>
            <h1>Never fly below business.</h1>
            <p className="hero-lead">
              Find the seat. Move the right points. Take the long way there.
            </p>
            <a className="primary-button" href="#tools">
              Find your next seat <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="route-art" aria-label="Illustration of a flight path">
            <svg viewBox="0 0 420 260" role="img" aria-hidden="true">
              <path
                className="route-globe"
                d="M72 190c-28-25-40-65-29-101 13-44 58-72 105-67 36 3 66 26 79 59M71 190c30 29 75 38 115 24 23-9 41-25 52-46M61 67c31 13 69 13 101-4M43 107c42 17 92 21 137 9M87 35c-5 36 5 76 30 108M145 22c-13 39-12 83 2 123"
              />
              <path
                className="route-flight"
                d="M92 156c42-66 109-99 183-87 29 5 51 18 68 37"
              />
              <circle className="route-origin" cx="92" cy="156" r="6" />
              <circle className="route-destination" cx="343" cy="106" r="7" />
              <path className="route-plane" d="m331 101 23 5-21 8 5-7z" />
            </svg>
            <div className="route-label route-label-origin">
              <span>FROM</span>
              <strong>New York</strong>
            </div>
            <div className="route-label route-label-destination">
              <span>TO</span>
              <strong>Somewhere better</strong>
            </div>
            <div className="hero-caption">
              <span>01 / 03</span>
              <span>YOUR NEXT CABIN, CLOSER</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="section-nav" id="tools" aria-label="Lie-Flat tools">
        <div className="section-nav-inner" role="tablist" aria-label="Choose a tool">
          {sectionNames.map((item) => (
            <button
              className={`section-tab${section === item.id ? " is-active" : ""}`}
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              aria-controls={`panel-${item.id}`}
              onClick={() => setSection(item.id)}
            >
              <span className="section-tab-index">{item.index}</span>
              {item.label}
            </button>
          ))}
          <span className="review-date">
            DATA REVIEWED <strong>{points.lastReviewed}</strong>
          </span>
        </div>
      </nav>

      <div className="workspace">
        {section === "radar" && (
          <section
            className="tool-panel"
            id="panel-radar"
            role="tabpanel"
            aria-labelledby="tab-radar"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">01 — AWARD RADAR</p>
                <h2>Find the seat worth the miles.</h2>
                <p className="section-intro">
                  Search live premium-cabin award space by route and date.
                </p>
              </div>
              <div className="panel-aside">
                <span className="aside-label">LIVE SEARCH</span>
                <span className="aside-note">Seats.aero partner data</span>
              </div>
            </div>

            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <label className="field">
                <span>From</span>
                <input
                  aria-label="Origin airport"
                  maxLength={3}
                  value={search.origin}
                  onChange={(event) => updateSearch("origin", event.target.value.toUpperCase())}
                  placeholder="JFK"
                  required
                />
              </label>
              <span className="route-separator" aria-hidden="true">→</span>
              <label className="field">
                <span>To</span>
                <input
                  aria-label="Destination airport"
                  maxLength={3}
                  value={search.destination}
                  onChange={(event) =>
                    updateSearch("destination", event.target.value.toUpperCase())
                  }
                  placeholder="NRT"
                  required
                />
              </label>
              <label className="field">
                <span>Start date</span>
                <input
                  aria-label="Start date"
                  type="date"
                  value={search.start}
                  onChange={(event) => updateSearch("start", event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  aria-label="End date"
                  type="date"
                  value={search.end}
                  onChange={(event) => updateSearch("end", event.target.value)}
                  required
                />
              </label>
              <label className="field cabin-field">
                <span>Cabin</span>
                <select
                  aria-label="Cabin"
                  value={search.cabin}
                  onChange={(event) =>
                    updateSearch("cabin", event.target.value as AwardSearch["cabin"])
                  }
                >
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </label>
              <button className="primary-button search-button" type="submit">
                Search seats
              </button>
            </form>

            <div className="watchlist-bar">
              <div>
                <p className="eyebrow">YOUR WATCHLIST</p>
                <p className="watchlist-copy">
                  Save a route and rerun it whenever the timing feels right.
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={saveSearch}>
                <span aria-hidden="true">+</span> Save this search
              </button>
            </div>
            {savedSearches.length > 0 && (
              <ul className="saved-searches" aria-label="Saved searches">
                {savedSearches.map((saved) => (
                  <li className="saved-search" key={saved.id}>
                    <div>
                      <strong>{saved.origin} <span aria-hidden="true">→</span> {saved.destination}</strong>
                      <span>{formatDate(saved.start)} · {saved.cabin}</span>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setSearch(saved);
                        void runSearch(saved);
                      }}
                    >
                      Run search
                    </button>
                    <button
                      className="remove-button"
                      type="button"
                      aria-label={`Remove ${saved.origin} to ${saved.destination} from watchlist`}
                      onClick={() => removeSavedSearch(saved.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="results-heading">
              <div>
                <h3>Premium seats</h3>
                <p>Sort: lowest mileage · Dates in your search window</p>
              </div>
              {awardResponse?.configured && (
                <span className="result-count">{awardResponse.data?.length ?? 0} found</span>
              )}
            </div>
            {awardLoading ? (
              <div className="empty-state" aria-live="polite">
                <span className="loading-indicator" aria-hidden="true" />
                <h3>Checking the cabin map</h3>
                <p>Searching premium award space for {search.origin} to {search.destination}.</p>
              </div>
            ) : awardError ? (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">↗</span>
                <h3>Search unavailable</h3>
                <p>{awardError}</p>
                <button className="secondary-button" onClick={() => void runSearch()} type="button">
                  Try again
                </button>
              </div>
            ) : awardResponse?.configured === false ? (
              <div className="empty-state connect-state">
                <span className="empty-icon" aria-hidden="true">⌁</span>
                <p className="eyebrow">A LITTLE MORE REACH</p>
                <h3>Connect Seats.aero</h3>
                <p>
                  A Seats.aero Pro API key enables live award search. Connect your key
                  to see premium seats across the calendar.
                </p>
                <a
                  className="primary-button"
                  href={deepLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore this route on Seats.aero <span aria-hidden="true">↗</span>
                </a>
              </div>
            ) : awardResponse?.data?.length ? (
              <div className="award-list" aria-live="polite">
                {awardResponse.data.map((record, index) => {
                  const source = record.Source?.toLowerCase() ?? "";
                  const programId = sourceProgramIds[source] ?? source;
                  const program = programById.get(programId);
                  const mileageValue =
                    search.cabin === "business"
                      ? record.JMileageCost
                      : record.FMileageCost;
                  const miles = Number(mileageValue);
                  const seatsValue =
                    search.cabin === "business"
                      ? record.JRemainingSeats
                      : record.FRemainingSeats ?? record.JRemainingSeats;
                  const seats = Number(seatsValue);
                  const transferBanks = program
                    ? transferSources(
                        program,
                        points.currencies.filter(
                          (currency) =>
                            program.transfers[
                              currency.id as keyof typeof program.transfers
                            ],
                        ),
                      ).map(({ currency }) => shortCurrencyNames[currency.id] ?? currency.name)
                    : [];
                  return (
                    <article className="award-card" key={`${record.Date}-${source}-${index}`}>
                      <div className="award-date">
                        <span className="eyebrow">DEPARTURE</span>
                        <strong>{formatDate(record.Date)}</strong>
                        <span className="airport-route">
                          {record.Route?.OriginAirport ?? search.origin} <span>→</span>{" "}
                          {record.Route?.DestinationAirport ?? search.destination}
                        </span>
                      </div>
                      <div className="award-main">
                        <span className="program-name">{(program?.name ?? source) || "Program"}</span>
                        <strong className="mileage-value">
                          {Number.isFinite(miles) ? formatNumber(miles) : "—"}
                          <span> miles</span>
                        </strong>
                        <span className="award-meta">
                          {selectedAvailable(record, search.cabin)
                            ? "Seat available"
                            : "Award seat"}
                          {Number.isFinite(seats) && seats > 0
                            ? ` · ${seats} ${seats === 1 ? "seat" : "seats"}`
                            : ""}
                        </span>
                      </div>
                      <div className="award-details">
                        <span className="detail-label">AIRLINE</span>
                        <span>{airlinesFor(record, search.cabin)}</span>
                        <span className="detail-label">ROUTING</span>
                        <span>{isDirect(record, search.cabin) ? "Nonstop" : "One or more stops"}</span>
                      </div>
                      <div className="transfer-line">
                        <span className="detail-label">TRANSFER FROM</span>
                        <span>{transferBanks.length ? transferBanks.join(" · ") : "Check program partners"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">⌁</span>
                <h3>No seats in this window</h3>
                <p>Try a wider date range or another route to find your next lie-flat seat.</p>
              </div>
            )}
          </section>
        )}

        {section === "points" && (
          <section
            className="tool-panel"
            id="panel-points"
            role="tabpanel"
            aria-labelledby="tab-points"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">02 — POINTS PATH</p>
                <h2>Use what you already have.</h2>
                <p className="section-intro">
                  Find the cleanest transfer path from your bank points to the seat.
                </p>
              </div>
              <div className="panel-aside">
                <span className="aside-label">CHARTS, NOT PROMISES</span>
                <span className="aside-note">Typical saver-level pricing</span>
              </div>
            </div>

            <div className="planner-grid">
              <div className="planner-controls">
                <fieldset className="currency-picker">
                  <legend>Which points do you hold?</legend>
                  <p className="control-note">Choose any bank currency. Balances are optional.</p>
                  <div className="currency-grid">
                    {points.currencies.map((currency) => (
                      <label
                        className={`currency-option${selectedCurrencies.includes(currency.id) ? " is-selected" : ""}`}
                        key={currency.id}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCurrencies.includes(currency.id)}
                          onChange={() => toggleCurrency(currency.id)}
                        />
                        <span className="checkbox-mark" aria-hidden="true">✓</span>
                        <span>{shortCurrencyNames[currency.id] ?? currency.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="balance-list">
                    {points.currencies
                      .filter((currency) => selectedCurrencies.includes(currency.id))
                      .map((currency) => (
                        <label className="balance-field" key={currency.id}>
                          <span>{currency.name}</span>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder="Add balance"
                            aria-label={`${currency.name} balance`}
                            value={balances[currency.id] ?? ""}
                            onChange={(event) =>
                              setBalances((current) => ({
                                ...current,
                                [currency.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                  </div>
                </fieldset>

                <div className="journey-picker">
                  <label className="field">
                    <span>From region</span>
                    <select
                      value={fromRegion}
                      onChange={(event) => setFromRegion(event.target.value)}
                    >
                      {points.regions.map((region) => (
                        <option key={region.id} value={region.id}>{region.name}</option>
                      ))}
                    </select>
                  </label>
                  <span className="journey-arrow" aria-hidden="true">→</span>
                  <label className="field">
                    <span>To region</span>
                    <select
                      value={toRegion}
                      onChange={(event) => setToRegion(event.target.value)}
                    >
                      {points.regions.map((region) => (
                        <option key={region.id} value={region.id}>{region.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field cabin-field">
                    <span>Cabin</span>
                    <select
                      value={cabin}
                      onChange={(event) =>
                        setCabin(event.target.value as "business" | "first")
                      }
                    >
                      <option value="business">Business</option>
                      <option value="first">First</option>
                    </select>
                  </label>
                </div>
              </div>

              <aside className="best-path">
                <p className="eyebrow">YOUR BEST PATH</p>
                {bestPath?.program ? (
                  <>
                    <span className="best-path-miles">
                      {formatNumber(bestPath.award.miles)} <span>miles</span>
                    </span>
                    <p className="best-path-copy">
                      {(() => {
                        const source = bestPath.currencies.find((currency) => currency.covered);
                        if (!source || !bestPath.program) return "A transfer path is available.";
                        return `Transfer ${formatNumber(source.needed)} ${shortCurrencyNames[source.currency.id] ?? source.currency.name} → ${bestPath.program.name} · ${bestPath.award.metal}`;
                      })()}
                    </p>
                    <a
                      className="inline-link"
                      href={bestPath.program.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explore the program <span aria-hidden="true">↗</span>
                    </a>
                  </>
                ) : (
                  <p className="best-path-copy">
                    Choose a points currency with a transfer partner in this market to
                    see your best path.
                  </p>
                )}
                <p className="irreversible-note">
                  Transfers are irreversible. Confirm the seat exists before you transfer.
                </p>
              </aside>
            </div>

            <div className="results-heading planner-results-heading">
              <div>
                <h3>Ways to get there</h3>
                <p>{filteredAwards.length} chart {filteredAwards.length === 1 ? "entry" : "entries"} · Sorted by miles required</p>
              </div>
              <span className="result-count">{cabin} cabin</span>
            </div>
            {paths.length ? (
              <div className="path-list">
                {paths.map(({ award, program, currencies }) => (
                  <article className="path-card" key={`${award.program}-${award.from}-${award.to}-${award.cabin}`}>
                    <div className="path-card-heading">
                      <div>
                        <span className="eyebrow">{program?.alliance ?? "PROGRAM"}</span>
                        <h3>
                          {program ? (
                            <a href={program.url} target="_blank" rel="noreferrer">
                              {program.name} <span aria-hidden="true">↗</span>
                            </a>
                          ) : (
                            award.program
                          )}
                        </h3>
                      </div>
                      <strong className="path-mileage">{formatNumber(award.miles)} <span>miles</span></strong>
                    </div>
                    <p className="path-metal">{award.metal}</p>
                    <p className="path-notes">{award.notes}</p>
                    <div className="path-transfer">
                      <span className="detail-label">YOUR TRANSFER OPTIONS</span>
                      {currencies.length ? (
                        <div className="transfer-options">
                          {currencies.map(({ currency, ratio, needed, balance, shortfall, covered }) => (
                            <div className="transfer-option" key={currency.id}>
                              <span className="transfer-currency">
                                <span className="transfer-dot" aria-hidden="true" />
                                {shortCurrencyNames[currency.id] ?? currency.name}
                                <span className="ratio-note">{ratio}:1</span>
                              </span>
                              <strong>{formatNumber(needed)} bank points needed</strong>
                              {balance === undefined ? (
                                <span className="balance-status">Add a balance to check coverage</span>
                              ) : covered ? (
                                <span className="balance-status is-covered">
                                  Covered · {formatNumber(balance - needed)} left over
                                </span>
                              ) : (
                                <span className="balance-status is-short">
                                  Short by {formatNumber(shortfall)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-transfer">
                          {selectedCurrencies.length
                            ? "None of your selected currencies transfer to this program."
                            : "Choose a bank currency above to see your transfer options."}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">⌁</span>
                <h3>No chart entries for this route</h3>
                <p>Try a different region pair or cabin to explore available award paths.</p>
              </div>
            )}
          </section>
        )}

        {section === "deals" && (
          <section
            className="tool-panel"
            id="panel-deals"
            role="tabpanel"
            aria-labelledby="tab-deals"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">03 — FARE GLITCHES & PREMIUM DEALS</p>
                <h2>Good cabins. Better timing.</h2>
                <p className="section-intro">
                  Fresh premium-cabin finds from trusted miles and travel sources.
                </p>
              </div>
              <div className="panel-aside">
                <span className="aside-label">UPDATED EVERY 30 MIN</span>
                <span className="aside-note">Nine independent feeds</span>
              </div>
            </div>
            <div className="deal-filters" aria-label="Filter deal stories">
              <button
                className={`filter-chip${dealFilter === "All" ? " is-selected" : ""}`}
                type="button"
                onClick={() => setDealFilter("All")}
              >
                All <span>{deals.length}</span>
              </button>
              {dealTags.map((tag) => (
                <button
                  className={`filter-chip${dealFilter === tag ? " is-selected" : ""}`}
                  type="button"
                  key={tag}
                  onClick={() => setDealFilter(tag)}
                >
                  {tag}
                  <span>{deals.filter((deal) => deal.tag === tag).length}</span>
                </button>
              ))}
            </div>
            {dealsLoading ? (
              <div className="empty-state" aria-live="polite">
                <span className="loading-indicator" aria-hidden="true" />
                <h3>Gathering the good stuff</h3>
                <p>Pulling the latest premium-cabin stories into one place.</p>
              </div>
            ) : dealsError ? (
              <div className="empty-state">
                <h3>Feed unavailable right now</h3>
                <p>{dealsError}</p>
              </div>
            ) : visibleDeals.length ? (
              <div className="deal-list">
                {visibleDeals.map((deal) => (
                  <article className="deal-item" key={`${deal.title}-${deal.source}`}>
                    <div className="deal-date">
                      <span className={`deal-tag tag-${deal.tag.toLowerCase().replaceAll(" ", "-")}`}>
                        {deal.tag}
                      </span>
                      <time dateTime={deal.publishedAt}>{relativeDate(deal.publishedAt)}</time>
                    </div>
                    <div className="deal-content">
                      <a href={deal.url} target="_blank" rel="noreferrer">
                        {deal.title} <span aria-hidden="true">↗</span>
                      </a>
                      <span className="deal-source">{deal.source}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">⌁</span>
                <h3>No stories in this lane</h3>
                <p>Try another filter or check back for the next premium-cabin find.</p>
              </div>
            )}
            <p className="data-note">
              Feed headlines are collected from third-party publishers. Confirm all
              pricing, availability, and terms with the source before booking.
            </p>
          </section>
        )}
      </div>

      <aside className="disclaimer">
        <span className="disclaimer-mark" aria-hidden="true">i</span>
        <div>
          <strong>Points Path is a starting point, not a booking guarantee.</strong>
          <p>
            {points._note.split(". ").slice(0, 2).join(". ")}. Always confirm
            availability on the airline site before transferring; transfers are
            irreversible.
          </p>
        </div>
        <span className="disclaimer-date">REVIEWED {points.lastReviewed}</span>
      </aside>

      <footer className="footer">
        <a className="wordmark footer-wordmark" href="#top">
          lie<span>—</span>flat
        </a>
        <span>Built with Devin</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
