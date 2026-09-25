"""Phase 0 spike: generate room images from sample rug trends via Fal.ai.

Usage:
    python spike/spike.py --model schnell --dry-run
    python spike/spike.py --model schnell
    python spike/spike.py --model pro --num-images 2 --seed 42
"""

import argparse
import csv
import os
import re
import sys
import time
from pathlib import Path

import fal_client
import requests
from dotenv import load_dotenv

OUTPUT_DIR = Path(__file__).parent / "output"

# Short key -> (Fal endpoint ID, approx USD per 1024x768 image, supports num_images)
MODELS = {
    "schnell": ("fal-ai/flux/schnell", 0.003, True),
    "pro": ("fal-ai/flux-2-pro", 0.03, False),
}

TRENDS = [
    {
        "name": "Vintage-wash jute",
        "materials": "jute",
        "colors": "warm neutrals, faded terracotta",
        "style": "boho living room",
    },
    {
        "name": "Moroccan-inspired shag",
        "materials": "wool",
        "colors": "cream, charcoal diamond pattern",
        "style": "modern bedroom",
    },
    {
        "name": "Washable performance rugs",
        "materials": "polyester",
        "colors": "soft sage, oatmeal",
        "style": "family living room with kids' toys",
    },
    {
        "name": "Bold abstract rugs",
        "materials": "wool blend",
        "colors": "mustard, cobalt, blush",
        "style": "eclectic apartment living room",
    },
    {
        "name": "Natural sisal runners",
        "materials": "sisal",
        "colors": "sand, natural fiber",
        "style": "Scandinavian entryway",
    },
]

STYLE_SUFFIX = (
    "Editorial interior photography, natural daylight, wide-angle lens, "
    "the rug clearly visible as the focal point on the floor, "
    "realistic textures, no text, no watermarks."
)

IMAGE_SIZE = "landscape_4_3"  # 1024x768, billed as 1 megapixel
CLIENT_TIMEOUT_S = 180
DOWNLOAD_TIMEOUT_S = 60


def rug_phrase(name):
    """'Bold abstract rugs' -> 'Bold abstract rug', 'Natural sisal runners' -> 'Natural sisal runner'."""
    base = re.sub(r"\s+rugs?$", "", name, flags=re.IGNORECASE)
    if base.lower().endswith("runners"):
        return base[:-1]
    return f"{base} rug"


def build_prompt(trend):
    return (
        f"Photorealistic {trend['style']} featuring a {rug_phrase(trend['name'])} "
        f"made of {trend['materials']} in {trend['colors']}, laid on the floor. "
        + STYLE_SUFFIX
    )


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def call_fal(endpoint, arguments):
    """One timed Fal call. Returns (list of image URLs, seconds)."""
    start = time.perf_counter()
    result = fal_client.subscribe(endpoint, arguments=arguments, client_timeout=CLIENT_TIMEOUT_S)
    elapsed = time.perf_counter() - start
    return [img["url"] for img in result["images"]], elapsed


def generate(model_key, prompt, n, seed, slug):
    """Generate n images. Returns (list of image URLs, list of per-call seconds)."""
    endpoint, _, supports_num_images = MODELS[model_key]
    base_args = {"prompt": prompt, "image_size": IMAGE_SIZE, "output_format": "jpeg"}

    if supports_num_images:
        batches = [{**base_args, "num_images": n, "seed": seed}]
    else:
        batches = [{**base_args, "seed": seed + i} for i in range(n)]

    urls, timings = [], []
    for i, args in enumerate(batches, start=1):
        batch_urls, elapsed = call_fal(endpoint, args)
        print(f"  [{model_key}] {slug} call {i}/{len(batches)}: {elapsed:.1f}s")
        urls.extend(batch_urls)
        timings.append(elapsed)
    return urls, timings


def download(url, path):
    resp = requests.get(url, timeout=DOWNLOAD_TIMEOUT_S)
    resp.raise_for_status()
    path.write_bytes(resp.content)


def log_timings(model_key, slug, timings):
    csv_path = OUTPUT_DIR / "timings.csv"
    is_new = not csv_path.exists()
    with csv_path.open("a", newline="") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["model", "trend", "call", "seconds"])
        for i, seconds in enumerate(timings, start=1):
            writer.writerow([model_key, slug, i, f"{seconds:.2f}"])


def main():
    parser = argparse.ArgumentParser(description="Trend Visualizer image-model spike")
    parser.add_argument("--model", required=True, choices=MODELS.keys())
    parser.add_argument("--num-images", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true", help="print prompts and cost, no API calls")
    args = parser.parse_args()

    endpoint, price_per_image, _ = MODELS[args.model]
    total_images = len(TRENDS) * args.num_images
    print(f"Model: {args.model} ({endpoint})")
    print(f"Images: {len(TRENDS)} trends x {args.num_images} = {total_images}, "
          f"estimated cost ~${total_images * price_per_image:.2f}")

    if args.dry_run:
        for trend in TRENDS:
            print(f"\n[{slugify(trend['name'])}]\n{build_prompt(trend)}")
        return 0

    load_dotenv()
    if not os.getenv("FAL_KEY"):
        print("FAL_KEY not set. Copy .env.example to .env and add your key.")
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_timings, failed = [], []

    for trend in TRENDS:
        slug = slugify(trend["name"])
        prompt = build_prompt(trend)
        trend_dir = OUTPUT_DIR / slug
        trend_dir.mkdir(parents=True, exist_ok=True)
        (trend_dir / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")

        print(f"\n{trend['name']}")
        try:
            urls, timings = generate(args.model, prompt, args.num_images, args.seed, slug)
            for i, url in enumerate(urls, start=1):
                download(url, trend_dir / f"{args.model}_{i}.jpg")
        except Exception as exc:  # API, network, or unexpected response shape
            print(f"  ERROR [{args.model}] {slug}: {type(exc).__name__}: {exc}")
            failed.append(slug)
            continue
        log_timings(args.model, slug, timings)
        all_timings.extend(timings)
        print(f"  saved {len(urls)} image(s) to {trend_dir.relative_to(OUTPUT_DIR.parent.parent)}")

    print("\nSummary")
    print(f"  succeeded: {len(TRENDS) - len(failed)}/{len(TRENDS)}")
    if all_timings:
        print(f"  mean latency per call: {sum(all_timings) / len(all_timings):.1f}s "
              f"(min {min(all_timings):.1f}s, max {max(all_timings):.1f}s)")
    if failed:
        print(f"  failed: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
