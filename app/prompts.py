"""Turn structured trend data into an image prompt."""

import re

from pydantic import BaseModel, Field

STYLE_SUFFIX = (
    "Editorial interior photography, natural daylight, "
    "shot from a slightly elevated eye level, looking across the room, "
    "the rug prominent in the lower half of the frame with the furniture, walls and "
    "windows of the room clearly visible, not a close-up product shot, "
    "realistic textures, no people, no text, no watermarks."
)


class Trend(BaseModel):
    name: str
    materials: list[str] = []
    colors: list[str] = []
    style: str = ""
    look: str = Field("", max_length=300)
    num_images: int = Field(2, ge=1, le=3)


def rug_phrase(name):
    """'Bold abstract rugs' -> 'Bold abstract rug', 'Natural sisal runners' -> 'Natural sisal runner'."""
    base = re.sub(r"\s+rugs?$", "", name, flags=re.IGNORECASE)
    if base.lower().endswith("runners"):
        return base[:-1]
    return f"{base} rug"


def starts_with_acronym(phrase):
    """True for 'UV-safe rug' or 'NYC loft rug', False for 'Natural sisal runner'."""
    return phrase[1:2].isupper()


def mid_sentence(phrase):
    """'Natural sisal runner' -> 'natural sisal runner', but 'UV-safe rug' stays as is."""
    if starts_with_acronym(phrase):
        return phrase
    return phrase[:1].lower() + phrase[1:]


def article(phrase):
    """'a' or 'an'. Acronyms are read letter by letter: 'a UV-safe rug', 'an NYC loft rug'."""
    if starts_with_acronym(phrase):
        return "an" if phrase[0] in "AEFHILMNORSX" else "a"
    return "an" if phrase[:1].lower() in "aeiou" else "a"


def join_items(items):
    """['jute', ' ', 'wool '] -> 'jute, wool'."""
    return ", ".join(item.strip() for item in items if item.strip())


def build_prompt(trend: Trend) -> str:
    rug = mid_sentence(rug_phrase(trend.name.strip()))
    materials = join_items(trend.materials)
    colors = join_items(trend.colors)
    look = trend.look.strip().rstrip(".").strip()

    description = f"{article(rug)} {rug}"
    if materials:
        description += f" made of {materials}"
    if colors:
        description += f" in {colors}"

    sentences = [f"Photorealistic {trend.style.strip() or 'room'} featuring {description}, laid on the floor."]
    if look:
        sentences.append(f"Rug details: {look}.")
    sentences.append(STYLE_SUFFIX)
    return " ".join(sentences)
