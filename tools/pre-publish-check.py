#!/usr/bin/env python3
"""Pre-publish regression check for Betu & Bholu's Jungle Adventure.

Screenshot-sweeps the title page and all 9 chapters of the built game,
compares each frame against committed baselines, and flags:

  - page errors / failed asset requests (the Sep 19 black-box class of bug)
  - a mostly-dark canvas (characters rendering as black boxes)
  - visual diffs vs baseline (shifted actors, clipped sprites, lost hats)

Standing workflow (user accepted 2026-09-23): whenever editor-exported
story JSON is applied, run this BEFORE commit/build, show the report to
the user, and only commit + build/publish once the user confirms clean.

Usage:
  npm run qa                       # build, sweep, compare against baselines
  npm run qa -- --update-baselines  # regenerate baselines (ONLY after a publish is confirmed live)
  npm run qa -- --no-build          # skip the build, sweep the existing dist/

Exit code: 0 = clean, 1 = issues found (also fails if baselines are missing
and --update-baselines was not given).

Notes:
  - Baselines live in qa/baselines/ and are committed to git. They represent
    the last published (live) build. Never regenerate them to silence a diff —
    a diff means the build changed vs what is live; update baselines only
    after the new build is published and confirmed live.
  - Screenshots are environment-sensitive (Google Fonts are blocked in this
    sandbox, so text renders in the fallback font). Baselines are only
    meaningful when generated and compared in the same environment.
"""

# Re-exec into the repo venv if it exists, so `npm run qa` just works.
import os
import sys

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_VENV_PY = os.path.join(_REPO, ".venv", "bin", "python")
if os.path.exists(_VENV_PY) and os.path.abspath(sys.executable) != os.path.abspath(_VENV_PY):
    os.execv(_VENV_PY, [_VENV_PY] + sys.argv)

import argparse
import functools
import http.server
import json
import shutil
import socket
import subprocess
import threading
import time
from datetime import datetime, timezone, timedelta

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:
    sys.exit("Pillow is required: .venv/bin/pip install Pillow")
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright is required: .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium")

VIEWPORT = {"width": 1280, "height": 800}
SETTLE_MS = 2500          # wait after scene load before screenshot A
SELFCHECK_MS = 1000       # gap between screenshots A and B (animation stability)
ADVANCE_GAP_S = 0.85      # > 600ms advance debounce guard in StoryScene
DIFF_THRESHOLD = 0.01     # >1% changed pixels vs baseline => DIFF
SELF_DIFF_THRESHOLD = 0.002  # A-vs-B above this => scene still animating => UNSTABLE
DARK_LUMA = 25            # luminance below this counts as "near black"
DARK_FRACTION = 0.55      # >55% near-black pixels => DARK_CANVAS warning
FONT_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")  # blocked in sandbox; warnings only

CDT = timezone(timedelta(hours=-5))


def load_chapters():
    chapters = {}
    for i in range(1, 10):
        cid = f"ch{i}"
        with open(os.path.join(_REPO, "public", "content", "chapters", f"{cid}.json")) as f:
            chapters[cid] = json.load(f)
    return chapters


def plan(chapters):
    """Return [(name, url_suffix, advances)] capture plan."""
    steps = [("title", "/", 0)]
    for i in range(1, 10):
        cid = f"ch{i}"
        ch = chapters[cid]
        n_lines = len(ch.get("lines", []))
        if ch.get("minigame"):
            steps.append((f"{cid}-start", f"/?chapter={cid}", 0))
            steps.append((f"{cid}-game", f"/?chapter={cid}&skip=1", 0))
        else:
            steps.append((f"{cid}-start", f"/?chapter={cid}", 0))
            if n_lines > 1:
                steps.append((f"{cid}-end", f"/?chapter={cid}", n_lines - 1))
            else:
                steps.append((f"{cid}-end", f"/?chapter={cid}", 0))
        if cid == "ch9":
            # one more advance past the last line lands on the end screen
            steps.append(("end-screen", f"/?chapter={cid}", n_lines))
    return steps


def start_server(dist_dir):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=dist_dir)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{port}"


def changed_fraction(img_a, img_b):
    diff = ImageChops.difference(img_a.convert("RGB"), img_b.convert("RGB"))
    px = diff.load()
    w, h = diff.size
    changed = 0
    total = w * h
    for y in range(0, h, 2):  # sample every 2nd row/col: 4x faster, same signal
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if r > 12 or g > 12 or b > 12:
                changed += 1
    return changed / (total / 4)


def dark_fraction(img):
    gray = img.convert("L")
    hist = gray.histogram()
    dark = sum(hist[:DARK_LUMA])
    return dark / (img.size[0] * img.size[1])


def make_diff_image(img_a, img_b, out_path):
    a = img_a.convert("RGB")
    b = img_b.convert("RGB")
    diff = ImageChops.difference(a, b)
    mask = diff.convert("L").point(lambda v: 255 if v > 12 else 0)
    overlay = Image.new("RGB", a.size, (255, 0, 0))
    out = Image.blend(a, overlay, 0.0)
    out.paste(overlay, mask=mask)
    out.save(out_path)


def capture(page, name, url, advances, shot_dir):
    errors, failed, font_failed = [], [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def on_response(resp):
        if resp.status >= 400:
            (font_failed if any(h in resp.url for h in FONT_HOSTS) else failed).append(
                f"{resp.status} {resp.url}")

    def on_failed(req):
        url_ = req.url
        (font_failed if any(h in url_ for h in FONT_HOSTS) else failed).append(f"FAILED {url_}")

    page.on("response", on_response)
    page.on("requestfailed", on_failed)

    page.goto(url, wait_until="networkidle", timeout=30000)
    page.wait_for_selector("canvas", timeout=20000)
    page.wait_for_timeout(SETTLE_MS)
    for _ in range(advances):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(int(ADVANCE_GAP_S * 1000))
    page.wait_for_timeout(400)

    a_path = os.path.join(shot_dir, f"{name}.a.png")
    b_path = os.path.join(shot_dir, f"{name}.png")
    page.screenshot(path=a_path)
    page.wait_for_timeout(SELFCHECK_MS)
    page.screenshot(path=b_path)
    img_a, img_b = Image.open(a_path), Image.open(b_path)
    self_diff = changed_fraction(img_a, img_b)
    os.remove(a_path)
    return {"errors": errors, "failed": failed, "font_failed": font_failed,
            "dark": dark_fraction(img_b), "self_diff": self_diff, "shot": b_path}


def main():
    ap = argparse.ArgumentParser(description="Pre-publish screenshot regression check.")
    ap.add_argument("--update-baselines", action="store_true",
                    help="regenerate qa/baselines from this run (only after a publish is confirmed live)")
    ap.add_argument("--no-build", action="store_true", help="skip npm run build, sweep existing dist/")
    args = ap.parse_args()

    dist = os.path.join(_REPO, "dist")
    if not args.no_build:
        print("Building…")
        r = subprocess.run(["npm", "run", "build"], cwd=_REPO, capture_output=True, text=True)
        if r.returncode != 0:
            print("BUILD FAILED:\n" + r.stdout + r.stderr)
            return 2
        print("Build OK.")
    if not os.path.isdir(dist):
        print("dist/ missing — run npm run build first.")
        return 2

    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=_REPO,
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = "unknown"

    chapters = load_chapters()
    steps = plan(chapters)
    ts = datetime.now(CDT).strftime("%Y%m%d-%H%M%S")
    run_dir = os.path.join(_REPO, "qa", "runs", ts)
    shot_dir = os.path.join(run_dir, "shots")
    diff_dir = os.path.join(run_dir, "diffs")
    os.makedirs(shot_dir, exist_ok=True)
    base_dir = os.path.join(_REPO, "qa", "baselines")
    if args.update_baselines:
        os.makedirs(base_dir, exist_ok=True)

    srv, base = start_server(dist)
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--mute-audio", "--autoplay-policy=no-user-gesture-required"])
            for name, suffix, advances in steps:
                ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=1)
                page = ctx.new_page()
                try:
                    res = capture(page, name, base + suffix, advances, shot_dir)
                except Exception as e:  # noqa: BLE001 — a hung page must not kill the sweep
                    res = {"errors": [f"CAPTURE FAILED: {e}"], "failed": [], "font_failed": [],
                           "dark": 0.0, "self_diff": 0.0, "shot": None, "capture_failed": True}
                ctx.close()

                baseline = os.path.join(base_dir, f"{name}.png")
                status, notes, diff_pct = "PASS", [], 0.0
                if res.get("capture_failed"):
                    status = "ERROR"
                    notes.append("capture failed")
                elif res["errors"] or res["failed"]:
                    status = "ERROR"
                    notes.append(f"{len(res['errors'])} page error(s), {len(res['failed'])} failed request(s)")
                elif res["dark"] > DARK_FRACTION:
                    status = "DARK_CANVAS"
                    notes.append(f"{res['dark']:.0%} near-black pixels — possible black-box render bug")
                elif res["self_diff"] > SELF_DIFF_THRESHOLD:
                    status = "UNSTABLE"
                    notes.append(f"scene still animating between shots ({res['self_diff']:.2%})")
                elif not os.path.exists(baseline):
                    if args.update_baselines:
                        shutil.copy(res["shot"], baseline)
                        status = "BASELINED"
                        notes.append("baseline recorded")
                    else:
                        status = "NO_BASELINE"
                        notes.append("no baseline — run with --update-baselines after a live publish")
                else:
                    diff_pct = changed_fraction(Image.open(res["shot"]), Image.open(baseline))
                    if diff_pct > DIFF_THRESHOLD:
                        status = "DIFF"
                        os.makedirs(diff_dir, exist_ok=True)
                        dp = os.path.join(diff_dir, f"{name}.diff.png")
                        make_diff_image(Image.open(res["shot"]), Image.open(baseline), dp)
                        notes.append(f"{diff_pct:.2%} changed vs baseline — see diffs/{name}.diff.png")
                if res["font_failed"]:
                    notes.append(f"{len(res['font_failed'])} font request(s) failed (sandbox-blocked, warning only)")
                results.append({"name": name, "status": status, "diff_pct": diff_pct,
                                "notes": "; ".join(notes), "errors": res["errors"], "failed": res["failed"]})
                print(f"  {name:12} {status:12} {diff_pct:6.2%}  {'; '.join(notes)}")
            browser.close()
    finally:
        srv.shutdown()

    stamp = datetime.now(CDT).strftime("%Y-%m-%d %H:%M %Z")
    lines = [f"# Pre-publish check — {stamp} (commit {commit})", "",
             f"Swept {len(results)} states. Baselines: qa/baselines/.", "",
             "| page | status | diff vs baseline | notes |",
             "|---|---|---|---|"]
    for r in results:
        lines.append(f"| {r['name']} | {r['status']} | {r['diff_pct']:.2%} | {r['notes']} |")
    bad = [r for r in results if r["status"] not in ("PASS", "BASELINED")]
    if bad:
        lines += ["", "## Error details"]
        for r in bad:
            for e in r["errors"]:
                lines.append(f"- **{r['name']}** page error: `{e[:200]}`")
            for f_ in r["failed"]:
                lines.append(f"- **{r['name']}** failed request: `{f_[:200]}`")
    summary = "CLEAN — no regressions vs baselines." if not bad else \
        f"{len(bad)} page(s) need attention: " + ", ".join(f"{r['name']} ({r['status']})" for r in bad)
    lines += ["", f"**Result: {summary}**"]
    with open(os.path.join(run_dir, "REPORT.md"), "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\nReport: qa/runs/{ts}/REPORT.md")
    print(f"Result: {summary}")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
