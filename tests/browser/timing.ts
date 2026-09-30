/**
 * How long a spec waits for the game canvas to appear after a launch.
 *
 * Playwright's 5 s default is enough on an idle machine, but a cold Phaser
 * start (textures, audio, the first scene) under a parallel browser run can
 * take longer; the gate then fails on start-up time, not behaviour. Waiting
 * longer only delays a genuine failure: a missing or duplicated canvas still
 * fails the count.
 */
export const CANVAS_START_MS = 20_000;
