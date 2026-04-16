"""
Minerva Reader Icon Generator
Generates batches of owl icon candidates using OpenAI's image API.

Usage:
  python scripts/generate-icon.py                  # Run default prompts, 5 images
  python scripts/generate-icon.py -n 3             # Generate 3 images
  python scripts/generate-icon.py -p "your prompt" # Custom prompt
  python scripts/generate-icon.py -q high          # Set quality (low/medium/high/auto)
  python scripts/generate-icon.py -s 1024x1024     # Set size
  python scripts/generate-icon.py --transparent     # Request transparent background
"""

import argparse
import asyncio
import base64
import mimetypes
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

from openai import AsyncOpenAI, OpenAI

OUTPUT_DIR = PROJECT_ROOT / "icon-candidates"

# --- Default prompts (rotate through these if no custom prompt given) ---
PROMPTS = {
    "face-refined": (
        "Refine this owl face app icon. Keep the exact same composition — owl face filling "
        "the entire rounded square, close-up front view, large expressive eyes, small beak. "
        "Changes: shift the green from bright lime to a medium olive green (HSL 82, 35%, "
        "48%) — the owl should be clearly and obviously GREEN, not brown, not khaki, not "
        "muddy. A natural olive green like fresh sage leaves. The icon should be well-lit "
        "and vibrant, NOT dark or shadowy. Make the style more elegant and sophisticated — "
        "less cartoonish, less flat. Add subtle feather texture and depth. The eyes should "
        "stay large and prominent but feel refined rather than childlike — warm amber-gold "
        "with more detail in the iris. Keep the dark outline/border around the icon. Light "
        "or medium-toned background behind the owl, NOT black. The expression should be "
        "calm, wise, and approachable. Premium, polished app icon. No text."
    ),
    "face-textured": (
        "Refine this owl face app icon. Maintain the same layout — owl face close-up filling "
        "the rounded square, big eyes, small beak, feathered edges. Change the color from "
        "bright lime to a medium olive green — still clearly green, just less saturated and "
        "neon. Think the color of olive trees or sage leaves (HSL 82, 35%, 48%). NOT brown, "
        "NOT dark, NOT muddy. The icon should be bright and well-lit, not in shadow. Add "
        "more realistic feather texture — layered, with subtle highlights and shadows that "
        "give depth. The eyes should be detailed amber-gold with visible iris texture, "
        "still large and central but more mature-looking. Slightly reduce the stark black "
        "outlines to feel less like a cartoon. Background should be a lighter green or "
        "cream, NOT black. Premium app icon feel — warm, inviting, wise. No text."
    ),
    "face-painterly": (
        "Refine this owl face app icon. Same composition — owl face filling the entire "
        "rounded square icon, viewed from the front. Shift the bright lime green to a "
        "medium olive green — muted but still clearly GREEN (HSL 82, 35%, 48%). The owl "
        "must look green, not brown or grey. Keep it well-lit and warm, NOT dark or moody. "
        "Apply a more painterly, semi-realistic illustration style — soft brushwork texture "
        "on the feathers instead of flat color fills. The eyes remain large and central, "
        "warm amber-gold, but with more depth and realism — catch-lights, subtle color "
        "gradation in the iris. Reduce the heavy black outlines to softer, more integrated "
        "edges. Background should be light or warm-toned, NOT black. The feel should be "
        "elegant and literary, warm and approachable. No text."
    ),
}


async def generate_one(
    client: AsyncOpenAI,
    kwargs: dict,
    label: str,
    index: int,
    total: int,
    batch_dir: Path,
    ref_images: list[str] | None = None,
):
    """Generate a single image and save it."""
    try:
        print(f"  [{index}/{total}] Generating...", flush=True)
        start = time.time()
        if ref_images:
            mime_map = {".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
            opened = []
            tuples = []
            for p in ref_images:
                ext = Path(p).suffix.lower()
                mime = mime_map.get(ext) or mimetypes.guess_type(p)[0] or "image/png"
                f = open(p, "rb")
                opened.append(f)
                tuples.append((Path(p).name, f.read(), mime))
            try:
                result = await client.images.edit(image=tuples, **kwargs)
            finally:
                for f in opened:
                    f.close()
        else:
            result = await client.images.generate(**kwargs)
        elapsed = time.time() - start

        image_b64 = result.data[0].b64_json
        image_bytes = base64.b64decode(image_b64)

        filepath = batch_dir / f"{label}_{index:02d}.png"
        with open(filepath, "wb") as f:
            f.write(image_bytes)

        print(f"  [{index}/{total}] done ({elapsed:.1f}s) -> {filepath.name}")
        return True
    except Exception as e:
        print(f"  [{index}/{total}] FAILED: {e}")
        return False


async def generate_batch(
    client: AsyncOpenAI,
    prompt: str,
    label: str,
    n: int = 5,
    quality: str = "auto",
    size: str = "1024x1024",
    transparent: bool = False,
    ref_images: list[str] | None = None,
):
    """Generate n images concurrently for a given prompt."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_dir = OUTPUT_DIR / f"{timestamp}_{label}"
    batch_dir.mkdir(parents=True, exist_ok=True)

    # Save the prompt for reference
    (batch_dir / "prompt.txt").write_text(prompt, encoding="utf-8")

    mode = "EDIT (with reference)" if ref_images else "GENERATE"
    print(f"\n{'='*60}")
    print(f"Batch: {label} [{mode}]")
    print(f"Generating {n} images CONCURRENTLY at {size}, quality={quality}, transparent={transparent}")
    if ref_images:
        print(f"Reference images: {ref_images}")
    print(f"Output: {batch_dir}")
    print(f"{'='*60}")

    kwargs = dict(
        model="gpt-image-1.5",
        prompt=prompt,
        size=size,
        quality=quality,
    )
    if transparent:
        kwargs["background"] = "transparent"

    tasks = [
        generate_one(client, kwargs, label, i + 1, n, batch_dir, ref_images)
        for i in range(n)
    ]
    results = await asyncio.gather(*tasks)
    successes = sum(1 for r in results if r)

    print(f"\n  {successes}/{n} images saved to {batch_dir}")
    return batch_dir


async def main():
    parser = argparse.ArgumentParser(description="Generate Minerva owl icon candidates")
    parser.add_argument("-n", type=int, default=5, help="Number of images per prompt (default: 5)")
    parser.add_argument("-p", "--prompt", type=str, help="Custom prompt (overrides defaults)")
    parser.add_argument("-l", "--label", type=str, default="custom", help="Label for custom prompt batch")
    parser.add_argument("-q", "--quality", type=str, default="high", choices=["low", "medium", "high", "auto"],
                        help="Image quality (default: high)")
    parser.add_argument("-s", "--size", type=str, default="1024x1024",
                        choices=["1024x1024", "1024x1536", "1536x1024", "auto"],
                        help="Image size (default: 1024x1024)")
    parser.add_argument("--transparent", action="store_true", help="Request transparent background")
    parser.add_argument("--ref", type=str, nargs="+", help="Reference image path(s) — uses edit API instead of generate")
    parser.add_argument("--all", action="store_true", help="Run all default prompts")
    parser.add_argument("--pick", type=str, choices=list(PROMPTS.keys()),
                        help="Run a specific default prompt")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not found. Make sure it's in .env.local")
        sys.exit(1)

    client = AsyncOpenAI(api_key=api_key)

    start = time.time()

    ref = args.ref if args.ref else None

    if args.prompt:
        await generate_batch(client, args.prompt, args.label, args.n, args.quality, args.size, args.transparent, ref)
    elif args.pick:
        await generate_batch(client, PROMPTS[args.pick], args.pick, args.n, args.quality, args.size, args.transparent, ref)
    elif args.all or not args.pick:
        # Run all prompts concurrently too
        batch_tasks = [
            generate_batch(client, prompt, label, args.n, args.quality, args.size, args.transparent, ref)
            for label, prompt in PROMPTS.items()
        ]
        await asyncio.gather(*batch_tasks)

    elapsed = time.time() - start
    print(f"\nAll done in {elapsed:.1f}s! Browse results in: {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
