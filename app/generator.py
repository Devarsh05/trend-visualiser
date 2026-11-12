"""Generate room images with Fal.ai. fal_client reads FAL_KEY from the environment."""

import logging

import fal_client

MODEL = "fal-ai/flux/schnell"
IMAGE_SIZE = "landscape_4_3"  # 1024x768, billed as 1 megapixel
CLIENT_TIMEOUT_S = 60

logger = logging.getLogger(__name__)


class GenerationError(Exception):
    """Fal failed, timed out or returned an unexpected response."""


def generate_images(prompt: str, n: int) -> list[str]:
    arguments = {
        "prompt": prompt,
        "image_size": IMAGE_SIZE,
        "output_format": "jpeg",
        "num_images": n,
    }
    try:
        result = fal_client.subscribe(MODEL, arguments=arguments, client_timeout=CLIENT_TIMEOUT_S)
        urls = [img["url"] for img in result["images"]]
    except Exception as exc:  # Fal API error, timeout, network, or unexpected response shape
        logger.warning("Fal call failed: %s: %s", type(exc).__name__, exc)
        raise GenerationError(type(exc).__name__) from exc

    if not urls or not all(isinstance(url, str) and url for url in urls):
        logger.warning("Fal returned no usable image URLs")
        raise GenerationError("no image URLs in response")
    return urls
