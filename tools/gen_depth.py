"""Generate grayscale depth maps (near=white, far=black) for FV scenes.

Uses Depth Anything V2 Small via Hugging Face transformers.
Output: assets/<name>-depth.jpg at 1/2 resolution, Gaussian blur sigma=2.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter
from transformers import pipeline

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

def main():
    pipe = pipeline(
        "depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
        device=-1,
    )
    for name in ["scene-01", "scene-02"]:
        src = ASSETS / f"{name}.jpg"
        img = Image.open(src).convert("RGB")
        w, h = img.size
        print(f"{name}: {w}x{h} -> estimating depth...", flush=True)
        depth = pipe(img)["depth"]  # PIL image, disparity: near = bright
        depth = depth.convert("L").resize((w // 2, h // 2), Image.LANCZOS)
        depth = depth.filter(ImageFilter.GaussianBlur(2))
        out = ASSETS / f"{name}-depth.jpg"
        depth.save(out, quality=92)
        print(f"  saved {out} ({depth.size[0]}x{depth.size[1]})", flush=True)

if __name__ == "__main__":
    sys.exit(main())
