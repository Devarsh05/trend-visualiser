import re
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.generator import GenerationError
from app.main import app
from app.prompts import Trend, build_prompt

API_KEY = "test-key"
FAKE_URLS = ["https://example.com/1.jpg", "https://example.com/2.jpg"]
TREND = {
    "name": "Vintage-wash jute",
    "materials": ["jute"],
    "colors": ["warm neutrals", "faded terracotta"],
    "style": "boho living room",
    "num_images": 2,
}

client = TestClient(app)


@pytest.fixture(autouse=True)
def service_key(monkeypatch):
    monkeypatch.setenv("SERVICE_API_KEY", API_KEY)


@pytest.fixture
def mock_generate():
    with patch("app.main.generate_images", return_value=FAKE_URLS) as mock:
        yield mock


def post_visualize(body=TREND, key=API_KEY):
    headers = {"x-api-key": key} if key is not None else {}
    return client.post("/visualize", json=body, headers=headers)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_visualize_valid_request(mock_generate):
    resp = post_visualize()
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == {"trend", "prompt", "images"}
    assert data["trend"] == "Vintage-wash jute"
    assert data["images"] == FAKE_URLS
    mock_generate.assert_called_once_with(data["prompt"], 2)


def test_visualize_missing_key(mock_generate):
    assert post_visualize(key=None).status_code == 401
    mock_generate.assert_not_called()


def test_visualize_wrong_key(mock_generate):
    assert post_visualize(key="wrong-key").status_code == 401
    mock_generate.assert_not_called()


def test_visualize_fails_closed_without_service_key(monkeypatch, mock_generate):
    monkeypatch.delenv("SERVICE_API_KEY", raising=False)
    assert post_visualize(key="").status_code == 401
    assert post_visualize(key="anything").status_code == 401
    mock_generate.assert_not_called()


def test_visualize_too_many_images(mock_generate):
    assert post_visualize(body={**TREND, "num_images": 5}).status_code == 422
    mock_generate.assert_not_called()


def test_visualize_wrong_key_checked_before_body(mock_generate):
    assert post_visualize(body={**TREND, "num_images": 5}, key="wrong-key").status_code == 401
    mock_generate.assert_not_called()


def test_visualize_generation_error():
    with patch("app.main.generate_images", side_effect=GenerationError("boom")):
        resp = post_visualize()
    assert resp.status_code == 502


def test_build_prompt():
    prompt = build_prompt(Trend(**TREND))
    assert prompt.startswith("Photorealistic boho living room featuring a vintage-wash jute rug")
    assert "made of jute in warm neutrals, faded terracotta, laid on the floor." in prompt
    assert "no people" in prompt

    sparse = build_prompt(Trend(name="Abstract rugs", materials=[" "], colors=[]))
    assert sparse.startswith("Photorealistic room featuring an abstract rug, laid on the floor.")
    assert "made of" not in sparse
    assert "  " not in sparse


def test_build_prompt_keeps_acronyms():
    assert "featuring a UV-resistant outdoor rug," in build_prompt(Trend(name="UV-resistant outdoor rugs"))
    assert "featuring an NYC loft rug," in build_prompt(Trend(name="NYC loft rugs"))


def test_build_prompt_with_look():
    prompt = build_prompt(Trend(**TREND, look="a faded, sun-bleached look."))
    assert "laid on the floor. Rug details: a faded, sun-bleached look. Editorial" in prompt
    assert ".." not in prompt


@pytest.mark.parametrize("look", ["", "   "])
def test_build_prompt_without_look(look):
    prompt = build_prompt(Trend(**TREND, look=look))
    assert "Rug details" not in prompt
    assert "laid on the floor. Editorial" in prompt
    assert "  " not in prompt
    assert ".." not in prompt
    assert ". ." not in prompt


@pytest.mark.parametrize("trend", [
    TREND,
    {**TREND, "look": "tight woven edges."},
    {**TREND, "look": "  hand-knotted pile...  "},
    {**TREND, "look": "   "},
    {"name": "Natural sisal runners", "materials": [" sisal ", ""], "colors": ["sand ", " "], "style": " "},
    {"name": "Abstract rugs"},
])
def test_build_prompt_punctuation(trend):
    prompt = build_prompt(Trend(**trend))
    assert not re.search(r"\.[A-Za-z]", prompt)
    for bad in ("..", "  ", " ,"):
        assert bad not in prompt
