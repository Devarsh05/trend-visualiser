"""Trend Visualizer API: POST a trend, get back room image URLs."""

import os
import secrets

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from app.generator import GenerationError, generate_images
from app.prompts import Trend, build_prompt

load_dotenv()  # local dev only; never overrides env vars already set (Docker, Render)

app = FastAPI(title="Trend Visualizer")


class VisualizeResponse(BaseModel):
    trend: str
    prompt: str
    images: list[str]


def require_api_key(x_api_key: str | None = Header(None)):
    """Reject the request unless x-api-key matches SERVICE_API_KEY. Fails closed if it isn't set."""
    expected = os.getenv("SERVICE_API_KEY", "")
    if not expected or not x_api_key or not secrets.compare_digest(
        x_api_key.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/visualize", response_model=VisualizeResponse, dependencies=[Depends(require_api_key)])
def visualize(trend: Trend):
    prompt = build_prompt(trend)
    try:
        images = generate_images(prompt, trend.num_images)
    except GenerationError:
        raise HTTPException(status_code=502, detail="Image generation failed")
    return VisualizeResponse(trend=trend.name, prompt=prompt, images=images)
