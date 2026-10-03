# Viewport/menu verification

The stage remains 960×600 (16:10), containing the same 960×480 playfield and
120px storefront band. Phaser FIT/CENTER_BOTH remains authoritative; Night
Shift's host is now block layout, avoiding CSS grid centering Phaser margins
again. Other prototypes keep their original layout.

Menu/Fullscreen overlay the unused center of the top edge on roomy desktop
windows. Narrow/coarse/short windows retain a compact safe utility rail, and
store/bench contextual controls reserve their natural wrapped height. The
room is never cropped or stretched. A 1920×1080 ordinary run naturally leaves
96px on each side. No new touch gameplay or portrait re-layout is claimed.

RunMenu handles focus, native controls, pause ownership, settings handoff,
backdrop capture, fullscreen state/error/availability and cleanup. Existing
canvas and contextual controls are retained. Title content, combat, loot and
other HUD systems are unchanged.

Verification commands:
- npm test -- --maxWorkers=1
- npm run typecheck
- npm run build
- npx vitest run --config diagnostics/weapon-visuals/vitest.config.ts
- npx playwright test tests/browser/viewport-layout.spec.ts --list

The eight browser cases require a permitted browser/server environment. They
cover resized stage bounds/centering at DPR1/2, focus and pause restoration,
click-through protection, settings within fullscreen, repeated exit, coarse
pointer targets, and contextual store/bench rails at320/390/844px.

layout-schematic.py uses Pillow to render labelled offline geometry diagrams.
The1280×720 before example uses the existing inspected capture's112px strip;
other before toolbar heights are illustrative. No Phaser runtime is rendered.

check-offline-layout.mjs is a separate optional, network-free diagnostic using
real DOM/CSS with a synthetic stage and explicit FIT/CENTER_BOTH geometry.
It does not run game code. In this cloud environment Chromium launch failed
because its local socket operation is denied; its checks did NOT pass. Do not
retry with security bypass flags. No live browser QA is claimed.
