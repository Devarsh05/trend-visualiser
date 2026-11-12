# CLAUDE.md

## Project
Trend Visualizer is a small FastAPI service that turns rug trends from an n8n trend agent into
photorealistic room images. n8n calls `POST /visualize`. The service builds an image prompt,
calls Fal.ai and returns image URLs. n8n then builds a self-contained HTML gallery file
(`trend_visuals_<date>.html`, one card per trend) that you download from the workflow, like the
existing HTML trend report. It's a side project for the Wayfair AI Agent Engineering externship, shown in
a 60–90 second demo clip at the final presentation. Full spec: `docs/PRD.md`.

## Current phase
**Phase 2: deploy + n8n integration.** The service runs on Render. Wire it into the n8n trend
workflow (Prep Trend Text → Extract Trends → Map Trends → `POST /visualize` → Build Trend Gallery).
No Google Sheets: the n8n instance has no Google credential.
Node setup: `n8n/SETUP.md`.

- [x] Phase 0: setup + spike
- [ ] Phase 1: service build
- [ ] Phase 2: deploy (Render) + n8n integration
- [ ] Phase 3: polish
- [ ] Phase 4: freeze + demo

## Stack
Python 3.11+, FastAPI, Pydantic, fal-client, python-dotenv, pytest. Docker, deployed on Render
(free tier: spins down after 15 min idle, ~1 min cold start). n8n for orchestration; its Code
node scripts are plain JavaScript tested with Node's built-in runner (no npm packages).

## Commands (Windows, PowerShell, venv in `.venv`)
```powershell
.\.venv\Scripts\Activate.ps1                 # activate venv
pip install -r requirements.txt              # install deps
uvicorn app.main:app --reload                # dev server → http://127.0.0.1:8000
pytest                                       # run tests (Fal always mocked)
node --test "n8n/tests/*.test.js"            # test the n8n Code node scripts
node n8n/scripts/build_snippet.js            # regenerate n8n/trend_visuals_branch.json
python spike\spike.py                        # Phase 0 spike: CALLS FAL, COSTS MONEY, ask first
```

## Repo layout
- `app/main.py` (in progress, Phase 1): FastAPI app, `/health` and `/visualize` endpoints
- `app/prompts.py` (in progress, Phase 1): `build_prompt(trend)` → image prompt string
- `app/generator.py` (in progress, Phase 1): Fal.ai call, returns image URLs
- `spike/`: Phase 0 experiments (`spike/output/` is gitignored)
- `tests/`: pytest tests, Fal calls always mocked
- `n8n/`: Code node scripts (`prep_trend_text.js`, `map_trends.js`, `build_gallery.js`), their
  tests in `n8n/tests/`,
  node setup in `SETUP.md`, and `sample_trend_output.json` (real agent output, base64 removed)
  - `trend_visuals_branch.json`: paste-ready n8n snippet of the whole branch. Generated, never
    edit by hand: rerun `node n8n/scripts/build_snippet.js` after changing the Code node scripts
    or the prompt/JSON example in `SETUP.md`
  - `scripts/build_snippet.js`: builds and validates that snippet (no credentials, keys or
    placeholders)
  - `trend_workflow_original.json`: full workflow export, gitignored, reference only
- `docs/PRD.md`: product spec

## API contract
- `GET /health` → `{"status": "ok"}`, no auth
- `POST /visualize` requires an `x-api-key` header that matches `SERVICE_API_KEY`
  - Body: `name`, `materials[]`, `colors[]`, `style`, `num_images` (default 2, max 3)
  - Returns: `trend`, `prompt`, `images[]`
  - Errors: `401` bad/missing key · `422` invalid body · `502` Fal failure or timeout

## Rules
- **Secrets:** never print, log, hardcode or commit secrets. `FAL_KEY` and `SERVICE_API_KEY`
  come only from environment variables. `.env` is gitignored, and `.env.example` holds empty
  placeholders.
- **Fal costs money:** never run anything that calls the Fal API without first stating the
  estimated cost and waiting for my go-ahead. The total project budget is under $15.
- **Tests never make real API calls.** Mock the Fal client.
- **Git:** never commit or push unless I explicitly ask. I review and commit myself.
- **No AI attribution:** when I ask you to commit or push, never add AI attribution
  (no `Co-Authored-By: Claude`, "Generated with Claude Code" or similar) to commit messages,
  PR descriptions or files.
- **Plan first:** show a plan before any multi-file change.
- **Dependencies:** don't add any without asking. Exception: in Phase 1, `fastapi`, `uvicorn`,
  `pydantic` and `pytest` are pre-approved. Anything beyond those still needs my go-ahead.
- **Keep it simple.** Out of scope unless I say otherwise: databases, Kubernetes, fine-tuning,
  auth beyond the API key, a custom frontend, and any real Wayfair product images.
