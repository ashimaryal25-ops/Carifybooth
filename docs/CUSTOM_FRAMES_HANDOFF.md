# Custom frame themes — handoff for the booth PC

**Branch: `custom-frames`.** Read this whole file before touching anything.
It explains what the feature is, how it is implemented, what is untested, and
exactly what to verify on the real printer.

---

## 1. What this is

The Customize step's "Custom themes coming soon!" stub is now a working theme
picker. Guests can choose one of Chloe's designed frames (soccer, basketball,
doodles, …) instead of a plain background colour.

**This is an ADDITION, not a replacement.** The plain colour strip (5 presets +
colour wheel) still works exactly as before, including its calibrated
`composeForPrint` path (`OUTER_MARGIN=40` / `INNER_MARGIN=18` on the 4×6).
**Nothing in that path was touched. Do not touch it.** Those numbers are the
result of days of physical print calibration on the DS-RX1.

## 2. Why every theme has TWO files (the printer story)

The DNP DS-RX1 prints borderless (driver `Border: Disable` = overscan) and cuts
the 4×6 into two 2×6 strips at the centre. A symmetric layout does NOT come out
symmetric on paper — edges get eaten unevenly. The plain-colour path compensates
in code (the 40/18 inset). Chloe compensates **in the artwork itself**:

- `public/frames/single/…` — the **even**, correct-looking 2×6 frame
  (612×1804 RGBA, transparent photo windows, branding baked in).
  Shown on screen only. Source: repo `ashimaryal25-ops/GBooth`, folder
  `Photo Booth-strip/`.
- `public/frames/print/backend-…` — a **complete pre-composed 4×6**
  (1200×1800 RGBA): both strips already side by side, pattern bleeding across
  the centre seam, edge compensation drawn in by hand and verified with real
  test prints. Deliberately looks uneven on screen so it comes out even on
  paper. Source: `GBooth/backendstrip/`.

So: guest sees the even `single` file; the printer receives the uneven `print`
file with photos composited in. The custom-frame print path **bypasses
`composeForPrint` entirely** — the backend sheet goes to
`/api/collage/print` → `print-card.ps1` (`DoubleStrip4x6`, `-Strips` queue)
as-is at 1200×1800.

## 3. How it's implemented

All app changes are in **`src/components/PhotoCollage.tsx`**:

- `frameKey` / `frameImg` state — `null` = plain colour path (unchanged).
- Theme picker UI replaces the stub in the STRIPS panel. "Plain" tile first,
  then one tile per theme available at the current photo count (2/3/4). A
  theme picked at 3 shots silently drops back to Plain if the guest re-picks a
  count that theme doesn't exist for (`availableFrames` / `activeFrame`).
- `renderStrip` — when a frame is active: photos are drawn first
  (cover-cropped, mirrored, filter applied — same maths as the plain strip via
  the shared `drawPhotoInto` helper), then the frame PNG is drawn on top;
  photos show through its transparent windows. Stickers go on top of the art.
  The plain-colour branch below it is untouched.
- `composeFrameForPrint` — same compositing against the **backend 4×6**: photos
  into the left-half and right-half windows, art on top, stickers duplicated
  onto both halves. Each photo is cropped to the **single** frame's window
  aspect (what the guest saw) and then stretched into the print window — the
  horizontal squeeze between the two is part of Chloe's compensation, so this
  is intentional, not a bug.
- `handlePrint` routes: `activeFrame ? composeFrameForPrint : composeForPrint`.
- `paintFrameBleed` — Chloe's exports stop short of the paper edge in places
  (every print sheet has a ~20px fully-transparent band at the top;
  `tech-2pic` and `penhall-2pic` also ~50px on the right). Those would print
  as white slivers, so the outermost opaque row/column of the art is smeared
  outward to fill them.

**`src/data/frame-themes.ts`** is the manifest: for every `{theme, photoCount}`
it stores both file paths, the photo-window rectangles, and the transparent
edge-band widths. It is **GENERATED — do not edit by hand**. Regenerate with:

```
python scripts/generate-frame-manifest.py
```

(needs Python + Pillow + scipy + numpy). The script detects the windows from
each PNG's alpha channel, so if Chloe adds or re-exports a frame: drop the PNGs
into `public/frames/single|print/`, add the filename pair to the `THEMES`
table at the top of the script, rerun it, commit both.

### Filename traps (verified visually — do not "fix" these)

- Frontend `baseball pic*.png` is actually the **FOOTBALL** art → paired with
  `backend-football-*`. Frontend `lacrosse pic*.png` is the **LACROSSE** art →
  paired with `backend-softball-*`. The names are misnomers on one side each;
  the manifest table encodes the correct pairing.
- Not every theme exists at every count (no animal 2pic, no soccer 2pic
  frontend, no picnic 4pic frontend, no window 2pic backend). The manifest only
  contains complete pairs — 38 variants across 14 themes.
- `trial printing*.png`, `2pixel moved.png`, `circuit2-2.png` etc. are Chloe's
  test files, deliberately excluded.

## 4. State: DONE vs NOT DONE

Done and verified on a laptop (no printer):
- TypeScript + production build clean.
- Compositing geometry verified offline (pixel-identical Python reimplementation
  of both paths rendered against the real manifest and art — photos land in the
  windows, order correct, mirroring correct, art on top, bleed filled).

**NOT done — needs the booth PC + printer:**
1. **Full end-to-end run on the kiosk**: pick each photo count, pick a theme,
   shoot, check the on-screen preview, print.
2. **Physical print check** (the whole point): print at least one custom-frame
   strip and confirm the cut lands on Chloe's seam and the edges come out even.
   If they don't, the fix is in HER artwork, not in code — talk to her, don't
   add margins in the app.
3. **QR scan test** on a printed strip — the QR sits near the outer edge where
   overscan bites hardest.
4. Regression: print one **plain-colour** strip and confirm it is unchanged.
5. Sticker placement on printed custom strips (maps 1:1 from the on-screen
   strip to each half; verify it looks right on paper).

## 5. Running it

- Booth: normal kiosk start (`npm run build` then the usual Start scripts).
  After pulling this branch: `npm install` is NOT needed (no new deps), but
  **rebuild and hard-refresh the kiosk tab (Ctrl+Shift+R)** — print-path code
  is client-side.
- Laptop dev: `npm run dev` + `NEXT_PUBLIC_DEV_CAMERA=1` in `.env.local` to use
  the laptop webcam. **Never set that flag on the kiosk** (it would fight the
  camera-mirror window).
- Printing needs `CARDIFYBOOTH_PRINTER_NAME` (+ optionally
  `CARDIFYBOOTH_STRIP_PRINTER_NAME`) in `.env.local` and the DNP `-Strips`
  queue with 2-inch cut enabled — unchanged from before, see
  `docs/BOOTH_AGENT_PROMPT.md`.

## 6. If a print comes out wrong

- Wrong/shifted cut, eaten edges on a **custom frame** → artwork-level problem:
  measure which edge and by how much, report back so Chloe can adjust the
  backend sheet. Do NOT compensate in code.
- Eaten edges on a **plain strip** → that's the old calibrated path; if it
  regressed, diff `composeForPrint` against `main` — it should be untouched.
- White sliver at a strip edge on a custom frame → `paintFrameBleed` should
  have covered it; check the manifest's `bleed` values for that frame and
  regenerate the manifest.
