# 遗物详情参考构图 QA

- Source visual truth: `C:\Users\A\AppData\Local\Temp\codex-clipboard-3a753122-995d-463f-a92e-ff01dc443696.png`
- Implementation screenshot: `C:\Users\A\AppData\Local\Temp\relic-detail-reference-final.png`
- Combined comparison: `C:\Users\A\AppData\Local\Temp\relic-detail-reference-comparison.png`
- Viewport: 1280 x 720 CSS px, desktop, device density managed by the in-app browser
- Source pixels: 899 x 613
- Implementation pixels: 1280 x 720
- Comparison normalization: implementation scaled to 613 px height beside the unchanged 899 x 613 source
- State: relic detail, `溺梦晶核`, entrance animation settled

## Full-view comparison evidence

The source parchment occupies about 57% of the frame width and 77% of its height. The implementation uses the same Lux3D parchment at about 57% projected width and 77% projected height. The spherical relic occupies about 45% of the overall parchment width and 55% of its height in both images. The relic remains centered inside the parchment opening and in front of the parchment surface.

The implementation retains its product-owned HUD and archive rail. The right information panel overlaps the canvas by design and is not part of the supplied 3D composition reference; the requested relic-parchment-camera relationship remains visible and matches the source.

Focused-region comparison was not required because the parchment frame, both scroll posts, relic silhouette, depth separation, and margins are readable in the normalized full-view comparison.

## Required fidelity surfaces

- Fonts and typography: not represented in the source visual; existing product typography was intentionally preserved.
- Spacing and layout rhythm: parchment and relic scale, center alignment, and outer black margins match the reference range.
- Colors and visual tokens: existing Lux3D parchment, teal relic emission, and near-black background were preserved.
- Image quality and asset fidelity: both parchment and relic remain real Lux3D GLB assets; no raster placeholder or code-drawn substitute was introduced.
- Copy and content: not represented in the source visual; existing relic story and controls were intentionally preserved.

## Comparison history

1. Earlier implementation: detail entry reused the studio camera at about 19.43 scene units, leaving the parchment and relic tiny and unreadable. This was a P1 composition mismatch.
2. Fix: added a dedicated detail target and a 4.8-unit initial camera distance while retaining the 2.75-unit user zoom limit.
3. Post-fix evidence: the normalized side-by-side comparison matches the source proportions. Wide, spherical, and tall discovered relics remain within the parchment frame; drag rotation, wheel zoom, and return-to-studio were exercised in the browser.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested relic-parchment-camera composition.

## Follow-up polish

The right detail panel intentionally covers part of the canvas at this viewport. It was not moved because the user asked only to match the 3D subject distance and scale.

final result: passed
