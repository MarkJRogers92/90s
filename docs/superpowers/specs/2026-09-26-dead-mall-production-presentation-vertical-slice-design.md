# DEAD MALL Production Presentation Vertical Slice Design

## Goal and boundary

Replace the graybox look in one representative playable room with a polished,
original production-art presentation that proves what DEAD MALL should look and
feel like. The slice must make the opening mall read as a bright, busy,
neon-heavy 1993 regional mall before horror gradually empties it.

The design keeps the existing Phaser browser runtime and the authoritative
renderer-independent TypeScript simulation. It does not rebuild the project in
Godot or Three.js, change combat rules, add M6 depth systems, expand the item
catalog, alter save semantics, or produce the full game's art catalog.

The slice is successful when one opening concourse looks intentionally finished,
remains readable during real combat, and provides reusable rules and assets for
a later room-by-room production pass. Expanding those rules through the rest of
the mall is a separate approval gate.

## Creative target

The presentation combines three reference goals without copying their protected
characters, locations, branding, or assets:

- room-based combat clarity and immediate silhouettes associated with
  *The Binding of Isaac*;
- the bright after-hours retail tension associated with *Chopping Mall*; and
- the recognizable store variety and improvised-mall sense of place associated
  with *Dead Rising*.

The result must feel like a specific 1990s mall rather than a generic dungeon
with retail labels. The opening palette is cream terrazzo, aqua, purple, coral,
yellow, dark storefront glass, and restrained neon glow. Geometric signs,
arcade and food-court graphics, fountains, planters, benches, directories,
shutters, and window displays provide the period identity.

The mall begins relatively bright and occupied. It is not abandoned or heavily
decayed at the start. Horror grows through contrast: people leave, public noise
drops out, cheerful signs illuminate empty corridors, gates close, announcements
cut off, and service areas become more prominent. The palette retains color and
neon throughout; later rooms do not become a uniformly gray or black dungeon.

## Selected presentation approach

The slice uses a hybrid overhead presentation:

- gameplay positions, collision, attacks, doors, and interactive bounds remain
  in the existing top-down world coordinates;
- floors remain close to overhead so movement and aim are easy to judge;
- north-facing walls rise into shallow three-quarter storefront façades with
  visible windows, signs, shutters, displays, and service doors;
- selected props gain height and cast simple shadows; and
- foreground architecture fades or becomes transparent before it can hide the
  player or an active combat telegraph.

This is not full isometric movement. Diagonal projection must not change the
player's collision path, pointer targeting, projectile geometry, doorway rules,
or deterministic results. The existing presentation branch's centralized
camera/projection seam is the starting point, but its current work-in-progress
mapping is not itself acceptance of the final visual transform.

The existing 960 by 480 simulation rooms and 640 by 360 logical Phaser canvas
remain the initial technical baseline. The camera may crop and follow more
closely so the player sees a detailed mall section instead of the entire empty
playfield at once. Any final camera scale must still provide enough look-ahead
for projectiles, boss tells, exits, and interaction prompts.

## Layered scene composition

Every converted room uses the same ordered presentation layers:

1. floor tiles and large material regions;
2. floor decals, dirt, reflections, and directional markings;
3. fixed walls and storefront façades;
4. low props and interactive fixtures;
5. characters, enemies, carriers, and projectiles;
6. tall foreground props and occluding architecture;
7. lighting, particles, combat telegraphs, and other effects; and
8. contextual prompts and compact HUD elements.

Depth ordering derives from stable world position and an explicit layer class,
not from creation order. Interactive art uses the authoritative simulation
bounds and a documented visual anchor. A large sprite may extend above its
collision rectangle, but its visible footprint must not imply a different
walkable or blocked region.

The first room is an authored opening concourse. It includes:

- two distinct fictional storefront façades;
- bright terrazzo flooring and decorative inlays;
- a fountain, planters, benches, a mall directory, trash cans, sale signs,
  shutters, and window displays;
- one transition toward a quieter back-of-house or combat area;
- readable locations for the player, one enemy, and combat telegraphs; and
- four to six lightweight civilian figures during the calm opening state.

The room is authored to demonstrate reusable kit pieces. It is not a one-off
painted backdrop that cannot be recombined in later rooms.

## Pixel-art direction

The game uses clean, higher-detail pixel art rather than smooth illustrated art
or crude low-resolution placeholders. The visual target is polished late-SNES
or arcade-era craft with modern readability:

- character silhouettes remain legible at normal game scale;
- characters target approximately 32 by 48 source pixels unless a visual test
  proves a nearby size reads better;
- contours use deliberate steps and consistent one-pixel dark outlines;
- shading uses controlled clusters rather than airbrushed gradients;
- wear is restrained and purposeful, especially in the bright opening room;
- sprites scale with nearest-neighbor sampling and land on whole display pixels;
  and
- the shared DEAD MALL palette is extended only through a reviewed palette
  change, not asset-by-asset improvisation.

The Janitor receives idle, four-direction walk, mop attack, and hit feedback.
The first converted enemy receives the minimum equivalent animation needed to
communicate movement, wind-up, attack, damage, and death. Frame counts stay
economical; strong poses and timing matter more than excessive animation.

Storefronts and environment pieces may use larger source canvases than
characters. Their modular seams, perspective, baseline, glass highlights, and
sign placement must align across combinations.

## Ambient civilians

Four to six civilians make the opening feel occupied without creating a crowd
simulation. They can appear as shoppers, a clerk, a security employee, or a
maintenance worker. Their calm actions are short authored loops such as window
shopping, carrying bags, sitting near the fountain, closing a store, or talking
in pairs.

Civilians are decorative and non-blocking. They cannot be attacked, damaged,
escorted, saved, looted, or used to obstruct enemies. They do not enter the
checkpoint and cannot alter combat outcomes.

Their presentation reacts to authoritative room state. When danger begins,
they notice it, panic, and leave through authored storefront or exit paths.
Phaser may own these cosmetic animation timelines because they have no gameplay
effect; the trigger must be derived from authoritative state rather than an
independent hidden gameplay rule. Restart, room transition, and shutdown dispose
every civilian view and timeline so repeated runs cannot duplicate them. Pause
and blur freeze cosmetic timelines until the authoritative run resumes.

The vertical slice does not add schedules, dialogue trees, reputation,
civilian casualties, escort missions, or persistent NPC identities.

## HUD and interaction presentation

The mall and action dominate the screen. The existing large information panel
is not the production layout for the converted slice.

- Health, cash, and Security Heat use compact corner displays.
- The room objective appears on entry and then minimizes.
- Interaction prompts sit near their relevant person, product, fixture, or
  doorway while remaining outside critical combat silhouettes.
- Inventory detail, provenance, traces, and transaction history move to a pause
  or inspection surface instead of occupying the playfield continuously.
- Store names appear primarily on their façades rather than as large floating
  labels.
- Buying, stealing, and fusion use focused panels styled after price tags,
  receipts, mall directories, and point-of-sale displays.
- Boss warnings, enemy shots, status marks, attack arcs, and area telegraphs
  retain priority over decorative light and background detail.

The information hierarchy is mall first, action second, and detailed records on
demand. The slice must remain usable at 1440 by 900 and 800 by 600 without
horizontal overflow or unreachable controls.

## Lighting, sound, and horror progression

Lighting supports the pixel art instead of blurring it. The opening concourse
uses broad skylight or fluorescent fill, localized neon color, small glass and
floor reflections, and simple grounded shadows. Bloom, color overlays, screen
shake, and particles are bounded so they do not erase silhouettes or obscure
telegraphs.

The slice demonstrates one controlled transition:

1. bright public concourse, four to six civilians, fountain and retail ambience;
2. a restrained warning such as a cut-off announcement, gate movement, or sign
   flicker;
3. civilians noticing danger and leaving;
4. the first combat lock with the same mall colors but reduced ambient activity;
   and
5. a quieter post-fight room that feels wrong because it is empty, not because
   it has been recolored into darkness.

The existing synthesized Night Shift sound layer remains functional. This slice
may add presentation cues only when they support the approved transition and do
not introduce runtime asset requests. A larger music, voice, or recorded-sound
production pass is separate work.

## Asset production and approval pipeline

All runtime art is local and source-preserving. The pipeline is:

1. define or update the reference sheet and shared palette;
2. create a native Aseprite study or, after separate paid-generation approval,
   request a bounded PixelLab candidate;
3. clean or redraw the candidate in Aseprite so outline, perspective, palette,
   alignment, and animation match the project;
4. present the finished candidate for visual approval outside the game;
5. validate dimensions, transparency, palette, frame alignment, and sharp
   scaling;
6. preserve the editable `.aseprite` source, export an approved PNG sheet, and
   record provenance;
7. register the runtime file through one central asset manifest; and
8. preload and render it through Phaser with the documented origin and fallback.

Raw PixelLab output never enters the game unchanged. This design does not
authorize any new paid PixelLab generation. Each paid batch remains a separate
approval, and one approved candidate does not authorize the rest of the asset
catalog.

The existing approved Bench Warrant proof, clean-line security-console study,
and DEAD MALL palette are style references. Assets remain outside the game until
their visual approval and validation pass.

## Runtime architecture

The simulation remains authoritative. The presentation layer consumes snapshots
and maps authoritative world positions into screen positions. It does not own
damage, movement, collision, economy, purchases, theft, fusion, checkpoints,
room transitions, or terminal outcomes.

Presentation responsibilities are separated into small units:

- projection maps world, camera, canvas, and pointer coordinates in both
  directions where input requires it;
- environment composition chooses the authored visual kit for the room and
  creates its fixed layers;
- entity views select sprite, animation, depth, shadow, and status treatment for
  each authoritative entity;
- ambience views run disposable civilian and background timelines triggered by
  authoritative state;
- occlusion decides when a tall foreground element fades; and
- the HUD projects authoritative state into compact primary information and
  optional detail surfaces.

Pointer aiming must invert the same projection used for rendering. Browser
tests and the development debug bridge must request projected screen targets
through the shared conversion rather than reimplementing scale arithmetic.

New runtime assets live under organized `public/assets` subdirectories and are
referenced through one typed manifest. A missing or invalid optional texture
falls back to a conspicuous development placeholder or the preserved vector
renderer; it does not crash the run or silently create an invisible interactive
object. Required production-slice assets fail the slice's validation and build
gate before release.

Production play performs no external requests. PixelLab and Aseprite are authoring
tools only and never become runtime dependencies.

## Performance and accessibility constraints

- Preserve the current 60 Hz deterministic simulation cadence.
- Keep static environment layers batched or cached where practical.
- Bound dynamic lights, particles, civilian timelines, and simultaneous filters.
- Avoid per-frame texture creation and unbounded display-object accumulation.
- Keep nearest-neighbor scaling, stable pixel rounding, and seam-free camera
  movement.
- Never encode hostile projectile ownership, danger, or interactability by color
  alone; silhouette, motion, outline, or icon treatment must also distinguish it.
- Provide reduced screen shake and retain the existing mute control.
- Pause and blur clear input and freeze presentation timelines. Restart, room
  transition, and shutdown clear input and dispose them without changing
  authoritative state unexpectedly.

## Failure handling and invariants

- A visual asset failure cannot alter collision or make an authoritative entity
  disappear without a fallback marker.
- World-to-screen and screen-to-world mappings remain finite and round-trip
  within a documented tolerance across supported viewport sizes.
- Foreground fade can reveal occluded content but cannot affect collision or
  input acceptance.
- Civilian views remain non-blocking and cannot modify save or combat state.
- A rejected purchase, theft, or fusion remains rejected regardless of its new
  presentation.
- Existing M1-M5 routes keep their gameplay behavior and deterministic outcomes.
- Production runtime contains no authoring credentials, provenance secrets,
  development fixtures, or network calls.
- Restarting ten times still produces one canvas, one HUD, one room view set, and
  one ambience set.

## Acceptance and verification

Implementation follows red-green TDD for new coordinate and lifecycle behavior.
The vertical slice requires:

- unit coverage for projection round-trips, bounds, pixel rounding, depth rules,
  occlusion decisions, and asset-manifest validation;
- focused lifecycle coverage proving civilian and effect timelines freeze on
  pause and blur and are disposed on restart, transition, and shutdown;
- existing simulation tests remaining unchanged and green unless a confirmed
  presentation-independent defect is found separately;
- browser coverage using real keyboard and pointer input for movement, aiming,
  attack, interaction, pause, restart, and the civilian-to-combat transition;
- browser assertions for one canvas, the compact HUD, reachable interaction
  panels, no horizontal overflow, no page or console errors, and no external
  requests;
- visual inspection at 1440 by 900 and 800 by 600;
- an actual combat-readability review covering player silhouette, one enemy,
  hostile and friendly shots, melee arc, status marks, door locks, and boss-scale
  telegraphs where present; and
- direct user approval of the playable opening concourse before any broad asset
  rollout.

Use targeted tests while iterating. Once the slice is stable, run typecheck,
relevant unit and integration coverage, targeted Chromium coverage, the broader
browser regression suite, the production build, the production fixture/debug
scan, and direct production inspection. WebKit, Safari, Windows, and physical
device coverage remain explicitly unclaimed unless separately authorized and
run.

## First deliverable

The first deliverable is one playable opening-concourse vertical slice with:

- the approved hybrid overhead camera and three-quarter façades;
- a reusable 1993 mall environment kit;
- two finished fictional storefronts;
- the fountain and core concourse prop set;
- a finished Janitor and one finished enemy;
- four civilian appearances using shared animation where practical;
- the compact HUD and contextual prompt treatment;
- controlled neon light, shadow, reflection, and combat effects; and
- a playable calm-to-evacuation-to-combat transition.

The deliverable includes editable source art, exports, manifest entries,
validation evidence, representative screenshots, and an honest playtest note.
It does not claim that the rest of the mall has production art.

## Explicitly deferred

This design does not include:

- an engine migration, full 3D, or true isometric movement;
- production conversion of every M1-M5 room;
- a complete store, prop, civilian, enemy, boss, or animation catalog;
- new combat rules, items, economy, saves, meta-progression, or M6 depth work;
- interactive dialogue, schedules, civilian combat, casualties, escorts, or
  persistent civilian identities;
- paid PixelLab generation without separate approval;
- recorded music, licensed audio, voice acting, or external runtime assets;
- publication, deployment, release, merge, push, or branch cleanup; or
- a claim of platform support that has not been tested.
