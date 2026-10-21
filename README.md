# Lie-Flat

**Never fly below business.** Lie-Flat brings three premium-cabin tools together:

- **Award Radar** searches Seats.aero partner award availability by route, travel
  window, and cabin. Save frequent routes in the browser watchlist.
- **Points Path** compares published saver-level award estimates with the bank
  currencies you hold and shows the transfer amounts needed for each program.
- **Fare Glitches** gathers recent premium-cabin and points stories from Google
  News and specialist travel feeds.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

`SEATS_AERO_API_KEY` is optional. Add a Seats.aero Pro partner API key to
`.env.local` to enable live searches at `/api/awards`. Without it, Award Radar
shows a Seats.aero connection prompt and never displays sample results. The
deal-feed route needs no API key.

## Points data disclaimer

`data/points.json` is the source for transfer partners, transfer ratios, and award
estimates. Its award prices are typical one-way saver levels compiled from
published charts and common sweet spots; dynamic pricing and availability vary.
Always confirm the seat with the airline before moving points. Transfers are
irreversible. The data file includes its last-reviewed date.
