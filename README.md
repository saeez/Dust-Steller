# Stellar Dust — Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [HTML — index.html](#3-html--indexhtml)
4. [CSS — style.css](#4-css--stylecss)
5. [JavaScript — script.js](#5-javascript--scriptjs)
   - 5.1 [Canvas Setup](#51-canvas-setup)
   - 5.2 [State Object](#52-state-object)
   - 5.3 [Mouse Object](#53-mouse-object)
   - 5.4 [Frame Cache (fc)](#54-frame-cache-fc)
   - 5.5 [Theme System](#55-theme-system)
   - 5.6 [Particle Class](#56-particle-class)
   - 5.7 [Object Pool](#57-object-pool)
   - 5.8 [Batch Rendering System](#58-batch-rendering-system)
   - 5.9 [Animation Loop](#59-animation-loop)
   - 5.10 [Constellation Effect](#510-constellation-effect)
   - 5.11 [Event Listeners](#511-event-listeners)
   - 5.12 [UI Binding](#512-ui-binding)
   - 5.13 [Text-to-Particle System](#513-text-to-particle-system)
   - 5.14 [Screenshot System](#514-screenshot-system)
6. [Key Algorithms Explained](#6-key-algorithms-explained)
   - 6.1 [Physics Model](#61-physics-model)
   - 6.2 [Mouse Interaction Modes](#62-mouse-interaction-modes)
   - 6.3 [Stratified Stride Sampling](#63-stratified-stride-sampling)
   - 6.4 [Batch Rendering by Colour Bucket](#64-batch-rendering-by-colour-bucket)
   - 6.5 [Double Physics Sub-stepping](#65-double-physics-sub-stepping)
7. [Performance Design Decisions](#7-performance-design-decisions)
8. [Controls Reference](#8-controls-reference)
9. [Summary](#9-summary)

---

## 1. Project Overview

**Stellar Dust** is a browser-based interactive particle simulator built with vanilla HTML, CSS, and JavaScript using the HTML5 Canvas 2D API. Up to 10,000 particles float across a dark canvas, responding in real time to mouse movement, clicks, and keyboard input.

The project has three core pillars:

- **Physics** — each particle has position, velocity, mass, and a lifetime. Forces (mouse attraction/repulsion/orbit, gravity, spring) are applied every frame.
- **Rendering** — particles are drawn using a batched colour-bucket system that reduces GPU draw calls from one-per-particle down to around 36, allowing smooth framerates at high particle counts.
- **Text Mode** — typing a word causes particles to leave their free-roaming paths and assemble into the shape of the letters using a spring-force system and a stratified pixel-sampling algorithm.

---

## 2. File Structure

```
mouse-interactive/
├── index.html        — page structure and control panel markup
├── style.css         — all visual styling, layout, and animations
├── script.js         — all simulation logic, physics, rendering, and UI binding
└── DOCUMENTATION.md  — this file
```

---

## 3. HTML — index.html

The HTML is intentionally minimal. It contains two top-level elements inside `<body>`:

### `<canvas id="canvas">`
The full-screen drawing surface. Its pixel dimensions are set via JavaScript (`canvas.width = window.innerWidth`), not CSS. CSS makes it `100vw × 100vh` and positions it at `z-index: 1` so it sits behind the control panel.

### `<div id="controls" class="controls-panel">`
A floating glassmorphism panel in the top-right corner. It contains:

| Element | Purpose |
|---|---|
| `#wordInput` | Typing here activates text mode; particles form the word |
| `#btnClearText` | Clears the word input with an explosion animation |
| `#particleCount` range | Slider: 500–10,000 particles |
| Mode buttons (Attract / Repel / Orbit) | Switch how the mouse interacts with particles |
| `#mouseRadius` range | The radius of mouse influence |
| `#mouseForce` range | Strength of mouse force |
| `#gravity` range | Downward (or upward) gravitational pull |
| `#themeSelect` | Colour theme selector |
| Trails toggle | Enable/disable motion blur trails |
| Constellation toggle | Draw lines between nearby particles |
| `#btnPause` | Pause/resume the simulation |
| `#btnReset` | Reset all particles to random positions |
| `#btnScreenshot` | Save a PNG snapshot (keyboard shortcut: S) |

The panel is **collapsible** — clicking the `▼` button in the header slides the body out of view with a CSS transition.

---

## 4. CSS — style.css

### Key layout decisions

**Canvas** is `position: absolute` filling the entire viewport. Because `overflow: hidden` is set on `body`, no scrollbars appear even if particles temporarily move to the edges.

**Controls panel** uses `backdrop-filter: blur(12px)` for the frosted-glass appearance. The panel collapses by animating to `height: 60px` — the body content fades and slides up via `opacity: 0` and `translateY(-20px)`.

**Range sliders** are fully custom-styled. The default `<input type=range>` appearance is removed with `-webkit-appearance: none`, and both the track and thumb are re-drawn using `::-webkit-slider-runnable-track` and `::-webkit-slider-thumb` pseudo-elements.

**Toggle switches** are CSS-only. The actual `<input type=checkbox>` is hidden (`display: none`). A `<span class="toggle-switch">` acts as the visual toggle, and the `::after` pseudo-element is the sliding circle. The `input:checked + .toggle-switch` selector controls the on-state.

**Responsive breakpoint** at `600px` moves the panel to the bottom of the screen as a bottom sheet, making it usable on mobile.

---

## 5. JavaScript — script.js

### 5.1 Canvas Setup

```js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
```

`alpha: false` tells the browser that the canvas never needs a transparent background. This allows the GPU compositor to skip one blending step per frame, which is a small but free performance gain.

`width` and `height` are stored as module-level variables and updated on `window.resize` so every part of the code can read the current dimensions without touching the DOM.

---

### 5.2 State Object

```js
const state = {
    particleCount: 2500,
    mouseMode: 'attract',
    mouseRadius: 150,
    mouseForce: 1.0,
    gravity: 0.0,
    theme: 'rainbow',
    trails: true,
    constellation: false,
    isPaused: false,
    textHueOffset: 0,
    textSize: 1.0
};
```

`state` is the single source of truth for all configurable simulation parameters. Every slider, toggle, and button in the UI writes to this object. The physics and rendering code reads from it (via the frame cache — see §5.4). This separation between *UI → state* and *state → simulation* makes the code easy to reason about.

`textHueOffset` is derived from a hash of the typed word, giving each word a unique dominant colour palette.

---

### 5.3 Mouse Object

```js
const mouse = { x, y, isActive, isDown };
```

`isActive` is set to `true` on `mousemove` and automatically cleared after 2 seconds of inactivity via `setTimeout`. This means particles stop reacting to a stationary cursor after 2 seconds, preventing a permanently frozen field.

`isDown` tracks whether the mouse button is held, enabling the drag-to-stream behaviour.

---

### 5.4 Frame Cache (fc)

```js
const fc = { mx, my, active, down, radiusSq, radius, invRadius, force, gravity, mode };
function refreshFrameCache() { ... }
```

This is the most important performance optimisation in the codebase. Inside the particle update loop, every particle previously needed to read `state.mouseRadius`, `state.mouseForce`, `mouse.x`, etc. — each a property chain lookup, and `state.mouseRadius * state.mouseRadius` was computed anew for every single particle.

With the frame cache:
- All values are computed **once** before the loop begins
- `radiusSq` (radius squared) is pre-computed so no per-particle multiplication is needed
- `invRadius` (1 / radius) is pre-computed so the force falloff uses a multiplication instead of a division inside the hot path
- Every particle reads from a plain local object (`fc.radiusSq`) which V8 can optimise far more aggressively than a chain like `state.mouseRadius * state.mouseRadius`

`refreshFrameCache()` is called **twice** per render frame — once before each physics sub-step — so the mouse position is always current.

---

### 5.5 Theme System

```js
const themes = {
    rainbow: (p) => `hsl(${((p.hue + p.life * 100) + state.textHueOffset) % 360}, 100%, 60%)`,
    fire:    (p) => `hsl(${Math.random() * 40 + 10}, 100%, ${Math.random() * 30 + 40}%)`,
    ice:     (p) => `hsl(${Math.random() * 40 + 180}, 100%, ${Math.random() * 40 + 60}%)`,
    neon:    (p) => `hsl(${Math.random() > 0.5 ? 320 : 160}, 100%, 60%)`,
    monochrome: (p) => `hsl(0, 0%, ${Math.random() * 50 + 50}%)`
};
```

Each theme is a **function that takes a particle and returns an HSL colour string**.

- **Rainbow** — hue shifts over the particle's lifetime (`p.life * 100`) plus a unique base hue (`p.hue`), making each particle cycle through the spectrum at a slightly different offset. This produces the flowing, non-uniform rainbow effect.
- **Fire / Ice** — use `Math.random()` every frame to produce a flickering, noisy appearance within a specific hue range (red-orange for fire, blue-cyan for ice).
- **Neon** — alternates between magenta (320°) and cyan (160°) randomly per frame, creating a cyberpunk blink effect.
- **Monochrome** — pure grey scale with randomised lightness for a star-field feel.

In the batch renderer, colours are **quantised to 10° hue buckets** for batching purposes. The exact per-particle colour from these functions is used only for fading particles (those near the start or end of their lifetime).

---

### 5.6 Particle Class

Each particle is an instance of the `Particle` class with these properties:

| Property | Description |
|---|---|
| `x, y` | Current position |
| `vx, vy` | Current velocity (pixels per physics sub-step) |
| `baseSize, size` | Visual radius in pixels |
| `hue` | Base hue (0–360°), randomised at spawn, constant for lifetime |
| `life` | Frame counter, increments each sub-step |
| `maxLife` | Random lifespan (100–300 frames) |
| `opacity` | 0 → 1 fade-in over 20 frames, 1 → 0 fade-out over last 20 frames |
| `mass` | Random 0.5–1.0, affects gravity response |
| `targetX, targetY` | Assigned letter pixel position (null when free-roaming) |

#### reset(x, y, isBurst)

Reinitialises all properties to random values. Called on spawn, on death, and on Reset button. `isBurst = true` multiplies initial velocity by 10, creating the explosion effect on mousedown.

#### update()

The physics engine for one particle. Runs twice per render frame (two sub-steps). Key steps:

1. **Lifetime & opacity** — increments `life`, computes fade-in/fade-out opacity curve
2. **Text mode** — if a `targetX` is assigned, apply a spring force toward the target (`dx * 0.03`) with high damping (`vx *= 0.88`). Random noise is suppressed in text mode so letters form cleanly. The particle's `life` is reset to 0 each sub-step to prevent death while in text mode.
3. **Free-roaming mode** — applies gravity, then checks if the particle is within `fc.radiusSq` of the mouse. If so, computes distance with `Math.sqrt`, normalises the direction vector, and applies attract/repel/orbit force. Applies friction (`vx *= 0.98`) and adds small random noise.
4. **Position update** — adds velocity to position, then wraps around screen edges (toroidal topology).
5. **Death & respawn** — if `life >= maxLife`, calls `reset()`. If the mouse is held down, respawns at the cursor position to create the streaming effect.

#### draw(ctx) *(legacy, not called in main loop)*

The original per-particle draw method, superseded by `drawParticlesBatched()`. Kept in code for reference. In text mode it only renders particles with a `targetX` target; non-target particles return early, keeping the canvas clean during text display.

---

### 5.7 Object Pool

```js
const MAX_PARTICLES = 10000;
const particles = new Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) particles[i] = new Particle();
```

All 10,000 particles are **allocated once at startup** and reused forever. When a particle "dies" it is not garbage-collected — `reset()` reinitialises it in place. This is called **object pooling** and eliminates GC pauses during the animation.

`state.particleCount` controls how many of these particles are actively updated and drawn each frame. The rest sit idle.

---

### 5.8 Batch Rendering System

This is the most significant rendering optimisation. The naive approach calls `ctx.fill()` once per particle — 2,500 individual GPU draw commands per frame, each with its own flush overhead.

The batch system works in three phases:

#### Phase 1 — Bucket particles by colour

```js
const bucket = Math.floor(hue / 10); // 36 buckets of 10° each
_batchXYR[bucket][offset]   = p.x;
_batchXYR[bucket][offset+1] = p.y;
_batchXYR[bucket][offset+2] = r;
_batchCount[bucket]++;
```

Each particle's hue is quantised to one of 36 colour buckets (one per 10° of the hue wheel). Particles with `opacity < 0.95` (those fading in or out) are placed in a separate `_fadeBuf` float array to be drawn individually, preserving their exact opacity.

All data is written into **pre-allocated `Float32Array` and `Int32Array` buffers** — no objects are created, no garbage is generated.

#### Phase 2 — One path + fill per bucket

```js
ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
ctx.beginPath();
for (let j = 0; j < count; j++) {
    ctx.moveTo(x + r, y);   // move to arc start to prevent connecting lines
    ctx.arc(x, y, r, 0, Math.PI * 2);
}
ctx.fill();
```

Instead of 2,500 `fill()` calls, there are at most 36. All particles in the same colour bucket are accumulated into a single path, then filled in one GPU command. The `ctx.moveTo(x + r, y)` before each `ctx.arc()` is essential — it starts a new sub-path, preventing the renderer from drawing a line from the previous circle's endpoint to the next circle's start.

#### Phase 3 — Fading particles individually

The small number of particles currently fading (typically 40–80) are drawn one at a time with their exact `globalAlpha` value. This preserves the smooth fade-in/fade-out animation.

**Result:** GPU draw calls reduced from ~2,500 to ~36–40 per frame — roughly a 60× reduction in command overhead.

---

### 5.9 Animation Loop

```js
function animate(timestamp) {
    if (!state.isPaused) {
        // 1. Clear / trail
        ctx.fillStyle = state.trails ? 'rgba(5,5,5,0.2)' : '#050505';
        ctx.fillRect(0, 0, width, height);

        // 2. Two physics sub-steps
        refreshFrameCache();
        for (let i = 0; i < pCount; i++) particles[i].update();
        refreshFrameCache();
        for (let i = 0; i < pCount; i++) particles[i].update();

        // 3. Batch draw
        drawParticlesBatched();

        // 4. Optional constellation lines
        if (state.constellation) drawConstellations();
    }
    frameCount++;
    requestAnimationFrame(animate);
}
```

**Trails effect** — instead of clearing the canvas to pure black each frame, a semi-transparent dark rectangle (`rgba(5, 5, 5, 0.2)`) is painted over everything. Old particle positions fade to black over roughly 5 frames, creating the motion trail. Disabling trails paints a solid fill, giving crisp single-frame positions.

**Two sub-steps** — the physics loop runs twice before a single draw. This doubles the effective physics rate without increasing the render workload. Mouse position is re-sampled between sub-steps (`refreshFrameCache()` is called again), so particles respond to cursor position at twice the rate the screen refreshes. This is what makes the simulation feel snappy and reactive.

**`requestAnimationFrame`** — the browser calls `animate` at the display's native refresh rate (typically 60 Hz, 120 Hz on ProMotion displays). The simulation automatically runs faster on higher-refresh-rate screens.

---

### 5.10 Constellation Effect

```js
function drawConstellations() {
    const checkCount = Math.min(state.particleCount, 800);
    const maxDistSq = 4000; // ~63px
    for (let i = 0; i < checkCount; i++) {
        for (let j = i + 1; j < checkCount; j++) {
            if (distSq < maxDistSq) {
                ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
                ctx.stroke();
            }
        }
    }
}
```

When enabled, thin white lines are drawn between particles that are within ~63 pixels of each other, creating a network or "constellation" appearance.

The naive implementation is O(N²) — every particle checks every other particle. To avoid performance collapse at high particle counts, only the first 800 particles are checked, giving a maximum of 800×799/2 = 319,600 pair checks. Line opacity fades with distance using `(1 - distSq / maxDistSq)`.

---

### 5.11 Event Listeners

| Event | Behaviour |
|---|---|
| `mousemove` | Updates `mouse.x/y`, sets `isActive = true`, starts 2s inactivity timer |
| `mousedown` | Sets `isDown = true`, triggers burst explosion at cursor |
| `mouseup` | Clears `isDown` |
| `mouseleave` | Clears both `isActive` and `isDown` |
| `resize` | Updates `width`/`height` and resizes the canvas |
| `keydown` `1` / `2` / `3` | Switch mouse mode to Attract / Repel / Orbit |
| `keydown` `G` | Toggle gravity on/off |
| `keydown` `S` | Trigger the Snap (screenshot) button |

**Burst on click** — `mousedown` loops through all active particles and applies an outward impulse (`vx += dx * 0.1`) to any particle within 141px (radius = √20000) of the cursor. Particle `life` is reset to 0 to ensure they are fully opaque for the explosion.

---

### 5.12 UI Binding

```js
function bindUI(id, stateKey, isNumber = false) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(`${id}Value`);
    el.addEventListener('input', (e) => {
        state[stateKey] = isNumber ? parseFloat(e.target.value) : e.target.value;
        if (valEl) valEl.innerText = ...;
    });
}
```

`bindUI` is a small helper that wires a range slider to a `state` property and optionally updates a sibling `<span>` displaying the current value. It is called four times for particle count, mouse radius, force strength, and gravity. All other controls (theme select, toggles, mode buttons) are wired individually.

---

### 5.13 Text-to-Particle System

This is the most algorithmically complex part of the project. It converts typed text into particle target positions.

#### Step 1 — hashString(str)

```js
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++)
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return hash;
}
```

A simple djb2-style hash that converts a word to an integer. The result is used to derive a unique `textHueOffset` for each word — so "hello" always produces the same colour palette, giving the text mode a consistent feel per word.

#### Step 2 — sampleTextTargets(text)

1. Creates an **offscreen canvas** of the same size as the main canvas (never displayed).
2. Computes `fontSize` based on text length, canvas dimensions, and a particle budget cap: `sqrt(particleCount / charCount) * 10`. This prevents the font from being so large that the particle density becomes too sparse to read.
3. Renders the text in bold white on the offscreen canvas, with **word wrapping** — long sentences break onto multiple lines when they would exceed 92% of the canvas width.
4. Calls `getImageData()` to access the raw RGBA pixel data.
5. Scans every second pixel (skip=2) and collects coordinates of any pixel with alpha > 80 into a flat `allTargets` array stored as `[x0, y0, x1, y1, ...]` pairs.
6. Applies **stratified stride sampling** to select exactly `budget = particleCount × 0.95` target points with guaranteed spatial coverage of all letter strokes (see §6.3).

#### Step 3 — assignTextTargets(selected)

Assigns each sampled pixel coordinate to a particle: `particles[i].targetX = selected[i*2]`. Particles beyond the budget have their targets set to `null` and remain free-roaming (but are hidden during text mode rendering).

A small random jitter of ±0.75px is added to each target so particles don't perfectly stack on top of each other.

#### Step 4 — Spring physics (inside update())

Once a particle has a `targetX`/`targetY`, it enters spring mode:
- A spring force `dx * 0.03` pulls it toward the target each sub-step
- Heavy damping `vx *= 0.88` prevents oscillation
- Random noise is suppressed so the letter shape holds still
- The particle's lifetime is frozen (`life = 0` each sub-step) so it never expires

Mouse interaction in text mode is **repulsive**: if the cursor is within `mouseRadius`, a force pushes the particle away, letting the user "brush" through letters. When the cursor leaves, the spring pulls the particle back.

#### Clearing text — btnClearText

When the clear (×) button is clicked or Reset is pressed, text particles receive an outward velocity impulse toward the screen centre and their `maxLife` is set near their current `life`, causing them to fade and die within ~30 frames. This creates the "particles scatter and vanish" exit animation.

---

### 5.14 Screenshot System

```js
document.getElementById('btnScreenshot').addEventListener('click', async () => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({ suggestedName: 'stellar-dust.png', ... });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    } else {
        fallbackDownload(blob);
    }
});
```

Uses the **File System Access API** (`showSaveFilePicker`) when available — this opens the operating system's native "Save As" dialog, allowing the user to choose the filename and destination folder. On browsers that don't support this API (Firefox, Safari), `fallbackDownload()` creates a temporary `<a>` element with the `download` attribute and programmatically clicks it, triggering a direct download to the default downloads folder.

Keyboard shortcut: `S` (only fires when the word input field is not focused).

---

## 6. Key Algorithms Explained

### 6.1 Physics Model

Each particle follows Newtonian mechanics with explicit Euler integration:

```
velocity += force
position += velocity
velocity *= friction
```

This is the simplest possible integration method. It is not perfectly energy-conserving but is fast and stable enough for a visual simulation. The friction term (0.98) acts as artificial damping — without it, particles would accelerate indefinitely.

Force from the mouse decays linearly with distance:

```
force = (1 - distance / radius) × mouseForce
```

At the edge of the influence radius, `force = 0`. At the centre, `force = mouseForce`. This gives a smooth, natural falloff.

---

### 6.2 Mouse Interaction Modes

All three modes use the same force magnitude calculation. The difference is the direction the force is applied:

**Attract** — force is applied along the normalised vector from particle to mouse `(nx, ny)`. Particles accelerate toward the cursor.

**Repel** — force is applied in the opposite direction `(-nx, -ny)`. Particles flee from the cursor.

**Orbit** — force uses the **perpendicular** vector `(-ny, nx)`, which is 90° rotated from the toward-mouse direction. A small inward component `(nx * 0.2, ny * 0.2)` prevents particles from escaping. The result is circular orbiting motion around the cursor.

---

### 6.3 Stratified Stride Sampling

When the typed text produces more candidate pixels than the particle budget allows, a naive random subsample would leave some strokes under-covered while others are dense. Thin parts of letters (like the stem of a lowercase 'l' or the crossbar of a 't') could vanish entirely by chance.

Stratified sampling solves this by dividing the sorted candidate list into exactly `budget` equal-sized strata, then picking one random point from each stratum:

```
stride = totalPixels / budget
for i in 0..budget:
    lo = floor(i * stride)
    hi = floor((i + 1) * stride)
    pick = random point between lo and hi
```

Because the candidate pixels are collected in raster order (left-to-right, top-to-bottom), adjacent indices correspond to spatially nearby pixels. Dividing into equal strata therefore guarantees proportional coverage of every spatial region — every stroke, curve, and corner of every letter gets a representative sample of particles regardless of how many total pixels that stroke contains.

---

### 6.4 Batch Rendering by Colour Bucket

The Canvas 2D API's `ctx.fill()` command causes the browser to flush the current drawing path to the GPU. This is an expensive operation — typically 100–300 microseconds of overhead regardless of how many shapes are in the path. Drawing 2,500 particles individually therefore spends 250–750 ms per second just on GPU flush overhead.

The solution is to group particles by colour and draw each group in a single path:

1. Quantise each particle's hue to a 10° bucket (0–9° → bucket 0, 10–19° → bucket 1, etc.) — 36 buckets total.
2. Write `(x, y, radius)` into a pre-allocated `Float32Array` for that bucket.
3. After all particles are bucketed, iterate the 36 buckets: set `fillStyle` once, call `beginPath()`, draw all circles in the bucket, call `fill()` once.

Result: 36 `fill()` calls instead of 2,500. The visual difference is imperceptible — hues within the same 10° bucket look nearly identical to the eye.

The buffers (`_batchXYR`, `_fadeBuf`) are allocated once at startup and reused each frame with `_batchCount.fill(0)` to reset, avoiding all garbage collection pressure.

---

### 6.5 Double Physics Sub-stepping

The animation loop runs at the display's refresh rate (typically 60 FPS). Mouse responsiveness is limited by how often the physics are updated — at 60 FPS, a particle only "feels" the cursor once every 16.7 ms.

By running the physics update loop **twice per render frame**, the effective physics rate doubles to 120 Hz. The mouse position is re-read between sub-steps (`refreshFrameCache()` is called again), so particles respond to the cursor at 120 Hz even though the screen only refreshes at 60 Hz.

This technique is called **physics sub-stepping**. It improves responsiveness and also improves numerical stability (smaller effective timestep means the spring and orbit physics are more accurate).

---

## 7. Performance Design Decisions

| Decision | Reason |
|---|---|
| Object pooling (pre-allocate all particles) | Avoids garbage collection pauses during animation |
| Frame cache (`fc` object) | Eliminates per-particle property chain lookups and pre-computes `radiusSq`, `invRadius` |
| Pre-allocated `Float32Array` batch buffers | No heap allocation per frame; typed arrays are faster for numeric data than object arrays |
| Colour bucket batching (36 buckets) | Reduces GPU draw calls from N to 36, removing the dominant CPU–GPU synchronisation bottleneck |
| `ctx.getContext('2d', { alpha: false })` | Removes alpha compositing overhead on the base canvas |
| No `shadowBlur` | `shadowBlur` forces per-particle GPU compositing, was the #1 FPS killer before removal |
| Two physics sub-steps | Doubles mouse responsiveness at zero extra rendering cost |
| Constellation check capped at 800 particles | Keeps O(N²) line-drawing from destroying performance at high particle counts |
| `skip=2` pixel scan in text mode | Reduces `getImageData` loop from `W×H` to `W/2 × H/2` iterations (4× faster) |

---

## 8. Controls Reference

| Control | Input | Keyboard |
|---|---|---|
| Mouse attract | Move mouse | — |
| Switch to Attract mode | Button or | `1` |
| Switch to Repel mode | Button or | `2` |
| Switch to Orbit mode | Button or | `3` |
| Toggle gravity | Gravity slider | `G` |
| Click burst | Click anywhere | — |
| Drag stream | Hold + drag | — |
| Type a word | Word input field | — |
| Clear word | × button | — |
| Snap screenshot | Snap button | `S` |
| Pause / Resume | Pause button | — |
| Reset | Reset button | — |
| Collapse panel | ▼ button | — |

---

## 9. Summary

Stellar Dust is a full-screen interactive particle simulation that runs entirely in the browser using the HTML5 Canvas 2D API with no external libraries or frameworks. It simulates up to 10,000 particles with per-particle physics — including mouse attraction, repulsion, orbital motion, configurable gravity, and a spring-based text assembly system.

The project's most technically interesting aspects are its rendering architecture (colour-bucket batching reduces GPU draw calls by ~60×), its physics design (a frame cache and double sub-stepping make the simulation feel immediate and responsive), and its text-to-particle system (stratified stride sampling guarantees even spatial coverage of letter strokes regardless of font size or particle budget).

At its core, Stellar Dust is a demonstration that high-performance, visually rich interactive graphics are achievable in plain JavaScript — no WebGL, no game engine, no build tools required.
