# n8n setup: Trend Visuals

How to add the Trend Visualizer to the existing n8n trend workflow. Every step is done by hand
in the n8n UI. The code for the two Code nodes lives in this folder; paste it in as-is.

```
Trigger ──► (existing trend agent nodes) ──► Assemble HTML Report
   │                                    └──► Prep Trend Text ──► Extract Trends ──► Map Trends ──► Visualize Trend ──► Append to Sheet
   └──► Wake Up Service
```

**Cost:** each run sends at most 5 trends × 2 images to Fal, about $0.03 (about $0.09 worst case if
every call is retried). The Fal key stays on Render, so n8n only ever holds the service key.

## Before you start

- The service is live on Render, e.g. `https://trend-visualiser.onrender.com`. Replace this with
  your URL below. `GET /health` returns `{"status":"ok"}` in a browser.
- You have the `SERVICE_API_KEY` value set on Render.
- The dashboard spreadsheet has a tab named exactly **`Trend Visuals`** with this header row in
  row 1: `date | trend | prompt | image_1 | image_2`. For readable thumbnails, set row height to
  about 150 px and columns D and E to about 200 px wide.

## 1. Credential: Trend Visualizer API key

**Credentials → Add credential → Header Auth**

| Field | Value |
| --- | --- |
| Credential name | `Trend Visualizer API key` |
| Name | `x-api-key` |
| Value | your `SERVICE_API_KEY` |

The key lives only in this credential. It never appears in the workflow JSON or a node field.

## 2. Wake Up Service (HTTP Request)

Render's free tier spins the service down after 15 minutes idle, and waking it takes about a
minute. This node pings it at the start of the run, so it is warm by the time the trend agent
finishes.

Connect it to the **Trigger** as a second, parallel output. Connect nothing after it.

| Setting | Value |
| --- | --- |
| Method | `GET` |
| URL | `https://trend-visualiser.onrender.com/health` |
| Authentication | None |
| Options → Timeout | `120000` |
| Settings → On Error | `Continue` |

## 3. Prep Trend Text (Code)

Connect it from the **same node that feeds "Assemble HTML Report"**, as a second output. Assemble
HTML Report keeps its connection unchanged.

| Setting | Value |
| --- | --- |
| Mode | `Run Once for All Items` |
| Language | JavaScript |
| Code | contents of [`prep_trend_text.js`](prep_trend_text.js) |

Output: one item `{ category, reportText }`. It reads only `sections` and `metadata` and never
copies `imageStore`.

## 4. Extract Trends (Basic LLM Chain)

Connect it after **Prep Trend Text**.

| Setting | Value |
| --- | --- |
| Source for Prompt | `Define below` |
| Require Specific Output Format | on |
| Chat Model (sub-node) | the same model the trend agent uses |
| Output Parser (sub-node) | **Structured Output Parser** (below) |

**Prompt (Text field, expression mode):**

```
You turn a market trend report into short visual briefs for an image generator that renders
photorealistic rooms with a rug as the focal point.

Category: {{ $json.category }}

Report:
{{ $json.reportText }}

Extract up to 5 distinct visual rug trends from the report, most important first. Prefer the
named micro-segments. For each trend return:
- name: short trend name in sentence case, ending in "rugs" or "runners"
  (e.g. "Organic modern neutral rugs").
- materials: 1-3 rug materials named in the report (e.g. "wool", "polyester").
- colors: 2-4 plain color names from the report (e.g. "warm beige", "terracotta"). No hex codes.
- style: the room the rug would sit in, as interior style + room type
  (e.g. "calm Scandinavian living room").
- look: one phrase of at most 200 characters, starting with "a" or "an", describing what the rug
  itself looks like: shape, pile height, texture, pattern, edges
  (e.g. "a round, irregular shape with subtle high-low carving in tone-on-tone neutrals").

Only describe what the report supports. No brands, prices, sizes, percentages or marketing claims.
```

**Structured Output Parser:**

| Setting | Value |
| --- | --- |
| Schema Type | `Generate From JSON Example` |
| JSON Example | below |

```json
{
  "trends": [
    {
      "name": "Organic modern neutral rugs",
      "materials": ["wool", "polyester"],
      "colors": ["warm beige", "cream", "soft sand"],
      "style": "calm minimalist living room",
      "look": "a round, irregular shape with subtle high-low carving in tone-on-tone neutrals"
    }
  ]
}
```

The chain outputs `{ "output": { "trends": [...] } }`.

## 5. Map Trends (Code)

Connect it after **Extract Trends**.

| Setting | Value |
| --- | --- |
| Mode | `Run Once for All Items` |
| Language | JavaScript |
| Code | contents of [`map_trends.js`](map_trends.js) |

Output: one item per trend (at most 5) shaped like the `/visualize` request body.

## 6. Visualize Trend (HTTP Request)

Connect it after **Map Trends**. It runs once per trend item.

| Setting | Value |
| --- | --- |
| Method | `POST` |
| URL | `https://trend-visualiser.onrender.com/visualize` |
| Authentication | `Generic Credential Type` → `Header Auth` → `Trend Visualizer API key` |
| Send Body | on |
| Body Content Type | `JSON` |
| Specify Body | `Using JSON` |
| JSON | `{{ $json }}` (expression mode) |
| Options → Timeout | `120000` |
| Settings → Retry On Fail | on |
| Settings → Max Tries | `3` (the first try plus 2 retries) |
| Settings → Wait Between Tries (ms) | `5000` |

Output per trend: `{ "trend", "prompt", "images": [url, url] }`.

Errors: `401` means the credential's key doesn't match `SERVICE_API_KEY` on Render. `422` means the
body is invalid (check Map Trends' output). `502` means Fal failed or timed out.

## 7. Append to Sheet (Google Sheets)

Connect it after **Visualize Trend**.

| Setting | Value |
| --- | --- |
| Operation | `Append Row` |
| Document | the dashboard spreadsheet |
| Sheet | `Trend Visuals` |
| Mapping Column Mode | `Map Each Column Manually` |
| Options → Cell Format | `Let Google Sheets format` (`USER_ENTERED`, so `=IMAGE()` renders) |

| Column | Value (expression mode) |
| --- | --- |
| `date` | `{{ $now.toFormat('yyyy-MM-dd') }}` |
| `trend` | `{{ $json.trend }}` |
| `prompt` | `{{ $json.prompt }}` |
| `image_1` | `=IMAGE("{{ $json.images[0] }}")` |
| `image_2` | `=IMAGE("{{ $json.images[1] }}")` |

## Test it

1. Run **Wake Up Service** alone and confirm `{"status":"ok"}`.
2. Pin the sample data on the node that feeds Assemble HTML Report (or run the workflow up to it).
   Then execute **Prep Trend Text**, **Extract Trends** and **Map Trends**, and check that Map
   Trends outputs 1-5 sensible items. None of these call Fal.
3. For the first paid run, set `MAX_TRENDS = 1` in Map Trends so only one trend goes to Fal
   (about $0.006). Execute **Visualize Trend** and **Append to Sheet** and check the
   `Trend Visuals` tab.
4. Set `MAX_TRENDS` back to `5` and run the full workflow.
