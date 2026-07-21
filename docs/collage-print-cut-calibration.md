# Collage strip print — inner/outer border calibration

_Investigation + fix, 2026-07-21. Touches `src/components/PhotoCollage.tsx` (`composeForPrint`)._

## Symptom

Printed photo-collage strips (the 2×6 pairs cut from one 4×6 sheet on the DNP
DS-RX1) came out with the photos running straight to the **inner** edge — the one
created by the centre cut — with **no coloured border there**. The **outer** edges
had a full, correct frame. On screen the strip looked perfect (even border all
round). Reprinting and relaunching didn't change it.

## How the print is built

- `renderStrip` always draws a **600×1800** strip canvas (a 2×6 at ~290 px/in),
  regardless of 2/3/4 shots — the slot count only repacks the middle photo band
  (`slotPhotoHeight`). Footer, frame and dimensions are constant.
- `composeForPrint` places **two copies** of that strip onto a **1200×1800** (4×6)
  sheet and posts it to `/api/collage/print`, which prints via
  `scripts/print-card.ps1` in `DoubleStrip4x6` mode to the `DS-RX1-Strips` queue
  (the queue whose per-user DevMode has the 2-inch cut enabled).

## Investigation (what was measured, not assumed)

1. **The composed file was already correct.** Pixel-sampling the actual
   most-recent print PNG showed a continuous pink band down the centre and a
   pink top margin. So the app/compositing was never the bug. An earlier
   "edge-to-edge" version had also already been replaced.

2. **The print path preserves it.** Replaying the PowerShell cover-scale against
   the real driver geometry: paper `PR (4x6)` = 413×615 (hundredths in), portrait,
   `PageBounds` 413×615. The 1200×1800 image maps **full-width, centred, no
   horizontal crop**; image x=600 lands exactly on the page centre.

3. **Direct-print isolation.** Printing the verified banded PNG *straight to the
   cut queue*, bypassing the browser/app entirely, reproduced the symptom
   exactly → the app is not involved; it's the physical print/cut.

4. **Ruler calibration sheet.** Printed a sheet with the two strips pushed far
   apart and a numbered ruler across the centre, plus a 1px **red line at x=600**.
   Result: **the red line comes out split across *both* strips' inner edges.**

## Findings

- **The cut lands on the exact horizontal centre (image x=600) with an
  essentially zero-width kerf.** It does not trim a wide sliver; the blade just
  shaves a hair off each strip's inner edge. The earlier "no inner border" was
  because that border was too thin and sat right under the blade.
- **The two placement margins act _swapped_ relative to the printed result** —
  raising the inner-side gap fattened the *outer* printed border and vice-versa.
  Empirically, the inner and outer borders come out **equal when
  `OUTER_MARGIN ≈ INNER_MARGIN + ~22px`**. (Root cause of the swap wasn't chased
  further once the empirical relationship was solid and stable.)
- **Layout-independent.** Because the fix operates on the finished 600×1800 strip,
  not on the photos inside it, the same calibration is correct for 2, 3 and 4
  shots — no per-layout tuning.

## The fix

In `composeForPrint`, each strip is scaled **uniformly** (no distortion — photos
keep their proportions and sharpness) and placed with independent, tunable
margins inside its 600-px half of the sheet, background filling every edge:

```
OUTER_MARGIN = 40   // pink outside each strip (outer, uncut edge)
INNER_MARGIN = 18   // pink between the strip and the centre cut
```

Calibrated by eye over a few direct prints: 42/18 was a touch inner-heavy, 40/18
matched. Both are labelled as **the knobs** in code — raise/lower together for
overall frame thickness; widen the `OUTER − INNER` gap if the inner border drifts
thinner than the outer on a given machine.

## Deploy gotcha (cost real time here)

`Start-CardifyBooth.ps1` only builds when `.next` is **missing** — editing source
and relaunching does **not** recompile. To ship a code change:

1. Stop node (`taskkill /F /IM node.exe`) — Windows locks `.next` during a build.
2. `npm run build` (or run the booth with `-Dev` for hot reload).
3. **Hard-refresh the kiosk tab (Ctrl+Shift+R)** — an already-open tab keeps the
   old JS even after the server restarts.

## Related

- Cut queue / DevMode wiring: `DS-RX1` = `CUT_STANDARD`, `DS-RX1-Strips` =
  `CUT_2INCH` (per-user, on the ICL account). The collage job must go to
  `DS-RX1-Strips` or the sheet prints uncut.
