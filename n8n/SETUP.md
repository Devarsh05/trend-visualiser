# n8n setup: Trend Visuals

How to add the Trend Visualizer branch to the existing n8n trend workflow (n8n 2.40.7). The
quickest route is to paste [`trend_visuals_branch.json`](trend_visuals_branch.json) onto the
canvas (section 3). Section 4 lists every setting the snippet contains, so you can check the
pasted nodes or build them by hand.

```
When chat message received ──► Input Parser1 ──► … ──► Collect All Sections ──► Assemble HTML Report
          │                                                     │
          └──► Wake Visualiser                                  └──► Prep Trend Text ──► Extract Trends ──► Map Trends ──► Visualize Trend ──► Build Trend Gallery
                                                                                            ▲         ▲
                                                                       Google Gemini Chat Model     Structured Output Parser
```

**Cost:** each run sends at most 5 trends × 2 images to Fal, about $0.03 (about $0.09 worst case if
every call is retried twice).

## Secrets

- The Fal key (`FAL_KEY`) lives only in Render's environment variables. n8n never sees it.
- The service key (`SERVICE_API_KEY`) lives only in the **Trend Visualizer API key** Header Auth
  credential. Don't type it into a node's Headers or URL.
- **The Cloudflare node ("Generate Image(cloudfare)") must use a Header Auth credential, never a
  typed header.** Create a Header Auth credential with Name `Authorization` and Value
  `Bearer <your Cloudflare token>`, select it under Authentication, and delete the `Authorization`
  row from the node's Headers. A typed header is saved in plain text in every workflow export.
  If the token was ever typed into the node, revoke it in Cloudflare and issue a new one.
- `n8n/trend_workflow_original.json` (a full workflow export) is gitignored. Keep it that way.

## 1. Before you start

- The service is live at `https://trend-visualiser.onrender.com`, and opening
  `https://trend-visualiser.onrender.com/health` in a browser returns `{"status":"ok"}`.
- `SERVICE_API_KEY` is set on Render.

## 2. Credentials

Create these under **Credentials → Add credential**. The snippet contains no credentials, so you
select them on the nodes after pasting.

| Credential | Type | Settings | Used by |
| --- | --- | --- | --- |
| `Trend Visualizer API key` | Header Auth | Name `x-api-key`, Value = your `SERVICE_API_KEY` | Visualize Trend |
| your Gemini credential | Google Gemini (PaLM) API | your Gemini API key | Google Gemini Chat Model |

No Google Sheets credential is needed: the branch ends in a Code node that builds an HTML file.

## 3. Paste the snippet

1. Open [`trend_visuals_branch.json`](trend_visuals_branch.json), select everything and copy it.
2. Open the trend workflow, click an empty spot on the canvas and press **Ctrl+V**. The 8 nodes
   land below the existing ones, already connected to each other. If n8n moves the group, drag
   **Wake Visualiser** under the trigger and the rest under **Collect All Sections**.
3. Add the two connections the snippet can't make, because they start from existing nodes. Both
   are extra outputs; leave the existing connections as they are.
   - **When chat message received** → **Wake Visualiser**
   - **Collect All Sections** → **Prep Trend Text**
4. Select credentials:
   - **Google Gemini Chat Model**: your Gemini credential
   - **Visualize Trend**: Authentication is already `Generic Credential Type` → `Header Auth`;
     select `Trend Visualizer API key`
5. Save the workflow.

## 4. Node reference

### Wake Visualiser (HTTP Request)

Render's free tier spins the service down after 15 minutes idle, and waking it takes about a
minute. This node pings it at the start of the run, so it is warm by the time the trend agent
finishes. Nothing is connected after it.

| Setting | Value |
| --- | --- |
| Input | **When chat message received** (extra output) |
| Method | `GET` |
| URL | `https://trend-visualiser.onrender.com/health` |
| Authentication | None |
| Options → Timeout | `120000` |
| Settings → On Error | `Continue` (`continueRegularOutput`) |

### Prep Trend Text (Code)

| Setting | Value |
| --- | --- |
| Input | **Collect All Sections** (extra output; Assemble HTML Report keeps its connection) |
| Mode | `Run Once for All Items` |
| Language | JavaScript |
| Code | contents of [`prep_trend_text.js`](prep_trend_text.js) |

Output: one item `{ category, reportText }`. It reads only `sections` and `metadata` and never
copies `imageStore`.

### Extract Trends (Basic LLM Chain)

| Setting | Value |
| --- | --- |
| Input | **Prep Trend Text** |
| Source for Prompt | `Define below` |
| Require Specific Output Format | on |
| Chat Model (sub-node) | **Google Gemini Chat Model**, model `models/gemini-2.5-flash` |
| Output Parser (sub-node) | **Structured Output Parser** |

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

**Structured Output Parser:** Schema Type `Generate From JSON Example`.

**Structured Output Parser JSON example:**

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

### Map Trends (Code)

| Setting | Value |
| --- | --- |
| Input | **Extract Trends** |
| Mode | `Run Once for All Items` |
| Language | JavaScript |
| Code | contents of [`map_trends.js`](map_trends.js) |

Output: one item per trend (at most 5) shaped like the `/visualize` request body.

### Visualize Trend (HTTP Request)

Runs once per trend item.

| Setting | Value |
| --- | --- |
| Input | **Map Trends** |
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

### Build Trend Gallery (Code)

Works like **Download Final Report**: it returns the page as binary data you download from the
node's output.

| Setting | Value |
| --- | --- |
| Input | **Visualize Trend** |
| Mode | `Run Once for All Items` |
| Language | JavaScript |
| Code | contents of [`build_gallery.js`](build_gallery.js) |

Output: one item with `json` `{ "fileName": "trend_visuals_YYYY-MM-DD.html", "trendCount" }` and
`binary.data`, a self-contained HTML page (`text/html`) titled **Trend Visuals — YYYY-MM-DD**
(UTC date). It has one card per trend: the trend name, its images side by side and the prompt in
small grey text. Trends without images are skipped. The images load from their Fal URLs, so the
page needs an internet connection to show them.

## 5. Test it

1. Execute **Wake Visualiser** alone and confirm `{"status":"ok"}`.
2. Pin the sample data on **Collect All Sections** (or run the workflow up to it). Then execute
   **Prep Trend Text**, **Extract Trends** and **Map Trends**, and check that Map Trends outputs
   1-5 sensible items. None of these call Fal.
3. For the first paid run, set `MAX_TRENDS = 1` in Map Trends so only one trend goes to Fal
   (about $0.006). Execute **Visualize Trend** and **Build Trend Gallery**, then download the
   HTML file from Build Trend Gallery's output (Binary tab) and open it in a browser.
4. Set `MAX_TRENDS` back to `5` and run the full workflow.

## 6. Regenerate the snippet

`trend_visuals_branch.json` is generated; don't edit it by hand. After changing
`prep_trend_text.js`, `map_trends.js`, `build_gallery.js`, or the prompt or JSON example in this
file, run from the repo root:

```powershell
node --test "n8n/tests/*.test.js"      # Code node tests
node n8n/scripts/build_snippet.js      # rewrites n8n/trend_visuals_branch.json
```

The script takes the prompt and JSON example from the code blocks under
**Prompt (Text field, expression mode)** and **Structured Output Parser JSON example** above, so
keep those two labels as they are. It refuses to write the file if the snippet has duplicate node
names, a connection to an unknown node, a `credentials` entry, a `<PLACEHOLDER>` or anything that
looks like a key.

To update a workflow that already has the branch, delete the 8 pasted nodes before pasting again.
Otherwise n8n renames the new copies (`Prep Trend Text1`, …).
