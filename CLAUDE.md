# CLAUDE.md

## Project
Trend Visualizer is a small FastAPI service that turns rug trends from an n8n trend agent into
photorealistic room images. n8n calls `POST /visualize`. The service builds an image prompt,
calls Fal.ai and returns image URLs. n8n then writes those URLs into a Google Sheets dashboard
as `=IMAGE(url)`. It's a side project for the Wayfair AI Agent Engineering externship, shown in
a 60–90 second demo clip at the final presentation. Full spec: `docs/PRD.md`.

## Current phase
**Phase 0: setup + spike.** Check that a prompt template reliably produces good room images,
and pick a Fal model.

- [ ] Phase 0: setup + spike
- [ ] Phase 1: service build
- [ ] Phase 2: deploy (Railway) + n8n integration
- [ ] Phase 3: polish
- [ ] Phase 4: freeze + demo

## Stack
Python 3.11+, FastAPI, Pydantic, fal-client, python-dotenv, pytest. Docker, deployed on Railway.
n8n for orchestration.

## Commands (Windows, PowerShell, venv in `.venv`)
```powershell
.\.venv\Scripts\Activate.ps1                 # activate venv
pip install -r requirements.txt              # install deps
uvicorn app.main:app --reload                # dev server → http://127.0.0.1:8000
pytest                                       # run tests (Fal always mocked)
python spike\spike.py                        # Phase 0 spike: CALLS FAL, COSTS MONEY, ask first
```

## Repo layout
- `app/main.py` (planned, Phase 1): FastAPI app, `/health` and `/visualize` endpoints
- `app/prompts.py` (planned, Phase 1): `build_prompt(trend)` → image prompt string
- `app/generator.py` (planned, Phase 1): Fal.ai call, returns image URLs
- `spike/`: Phase 0 experiments (`spike/output/` is gitignored)
- `tests/`: pytest tests, Fal calls always mocked
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
