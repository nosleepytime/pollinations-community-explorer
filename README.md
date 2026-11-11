# Community Atlas · Pollinations Model Explorer

Responsive, English-only community model catalog with a public read-only REST API, live 20-second countdown, full upstream metadata, search, filtering, and installable PWA support.

> **Independent project.** Not affiliated with or endorsed by Pollinations.ai.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server serves the same `/api/models` endpoint locally. Run tests with `npm run check`, and produce a static front-end build with `npm run build`.

## Deploy on Vercel

Import [nosleepytime/pollinations-community-explorer](https://github.com/nosleepytime/pollinations-community-explorer) as a Vite project. Framework: **Vite**. Build command: **npm run build**. Output directory: **dist**. The `api/models.js` file is deployed as a Vercel serverless function. No tokens or environment variables are needed for the public model catalog.

## Read-only API

### `GET /api/models`

The API fetches the public catalog from `https://gen.pollinations.ai/models?reliability=all`. All models are cached for **15 seconds** at the function-instance level and the response uses an edge cache of **15 seconds**. Any data not published by Pollinations is shown as unavailable, rather than invented.

| Parameter | Default | Example / values |
| --- | --- | --- |
| `source` | `community` | `community`, `official`, `all` |
| `freeOnly` (or `free`) | `true` | `true`, `false` |
| `category` | `all` | `all`, `text`, `image`, `video`, `audio`, `embeddings`, `realtime`, `3d` |
| `capability` | `all` | `vision`, `video-vision`, `reasoning`, `tool-calling`, `streaming`, `audio-input`, `audio-output`, etc. |
| `q` (or `search`) | empty | substring of ID, publisher, capability or description |
| `status` | `all` | `healthy`, `degraded`, `unhealthy`, `unknown`, etc., as reported |
| `sort` | `name` | `name`, `category`, `rpm`, `health` |
| `limit` | `1000` | integer 1–1000 |
| `offset` | `0` | nonnegative integer |
| `includeRaw` | `true` | `true`, `false` |
| `refresh` | `false` | `true` bypasses local 15-second cache; platform edge cache may still apply |

Example requests:

```http
GET /api/models
GET /api/models?freeOnly=true&category=image
GET /api/models?freeOnly=false&category=text&capability=reasoning
GET /api/models?q=community%2FCatniti%2Fagnes-3.0-flash
GET /api/models?source=all&sort=rpm&limit=30&offset=0
```

Example response **shape** (illustrative only):

```json
{
  "object": "list",
  "source": "community",
  "total": 1,
  "count": 1,
  "limit": 1000,
  "offset": 0,
  "hasMore": false,
  "updatedAt": "2026-11-11T20:00:00.000Z",
  "summary": { "total": 1, "categories": {"text": 1}, "free": {"free": 1, "paid": 0, "unknown": 0}, "statuses": {"unknown": 1} },
  "data": [
    {
      "id": "community/example/example-model",
      "name": "Example model",
      "category": "text",
      "source": "community",
      "freeStatus": "free",
      "rpm": null,
      "capabilities": ["vision"],
      "raw": {"id": "community/example/example-model", "category": "text", "pricing": {"promptTextPrice": 0}, "capabilities": {"vision": true}}
    }
  ]
}
```

### What “free” means

Only explicit free flags or published *all-zero* price values count as **verified free**. Explicit paid flags or positive costs count as **paid**. Entries with no published pricing are **unknown**. By default `freeOnly=true` excludes **paid** entries while keeping **unknown-price community** models discoverable, clearly labeled as **Unknown**. The endpoint cannot guarantee that a model can be invoked free of charge; usage permissions and quotas depend on Pollinations.

### Availability

Health states reflect the upstream catalog's status rather than an independent model invocation test. Pollinations health metrics may refresh less frequently than this site's 20-second polling. The countdown means **next catalog check**, not guaranteed new upstream health measurements.

### CORS / methods

Supports `GET`, `HEAD`, and preflight `OPTIONS`; all other methods receive `405`. `GET` accepts URL query parameters, not a JSON request body.

## PWA

A web manifest and lightweight service worker enable installation on supported platforms. In Chrome/Android use **Install app**; on iOS Safari use **Share → Add to Home Screen**. The service worker never caches `/api/models`, so model information is not stored as an offline result.

## Attribution

Data: [Pollinations.ai](https://pollinations.ai/) · [Community models](https://enter.pollinations.ai/models?q=source:community). Made by [3fow](https://guns.lol/nosleepytimee).
