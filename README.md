# Pollinations Community Explorer

A live directory for discovering **free community models** listed by Pollinations.ai.

## Features
- Pulls the public Pollinations model catalog (no API key required).
- Filters to models with explicitly zero pricing by default.
- Categories, search, capability filters, RPM/context metadata and model detail panels.
- Automatic refresh every 20 seconds plus a manual refresh button.
- Shows published data only; unavailable metadata is labelled "Not published".
- Lingo device-language translation integration.

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Data source
`https://gen.pollinations.ai/models?source=community&reliability=all`

The directory reads the public API directly in the browser. Rate limits, prices, health and capability metadata can change upstream. RPM is never estimated. A model is counted as free only when its published price fields are explicitly zero (or the API explicitly marks it free).

This independent community project is not affiliated with Pollinations.ai.

Made by [3fow](https://guns.lol/nosleepytimee).
