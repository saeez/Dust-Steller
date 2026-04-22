/**
 * Stellar Dust - Interactive Particle Simulator
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency on base canvas

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// --- State Management ---
const state = {
    particleCount: 2500,
    mouseMode: 'attract', // attract, repel, orbit
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

const mouse = {
    x: width / 2,
    y: height / 2,
    isActive: false,
    isDown: false
};

// Frame cache — populated once per sub-step, read by every particle
const fc = {
    mx: 0, my: 0,
    active: false, down: false,
    radiusSq: 0, radius: 0, invRadius: 0, force: 0,
    gravity: 0, mode: 'attract'
};
function refreshFrameCache() {
    fc.mx       = mouse.x;
    fc.my       = mouse.y;
    fc.active   = mouse.isActive;
    fc.down     = mouse.isDown;
    fc.radius   = state.mouseRadius;
    fc.radiusSq = state.mouseRadius * state.mouseRadius;
    fc.invRadius= 1 / state.mouseRadius;
    fc.force    = state.mouseForce;
    fc.gravity  = state.gravity;
    fc.mode     = state.mouseMode;
}

// --- Theme Configurations ---
const themes = {
    rainbow: (p) => `hsl(${((p.hue + p.life * 100) + state.textHueOffset) % 360}, 100%, 60%)`,
    fire: (p) => `hsl(${((Math.random() * 40 + 10) + state.textHueOffset) % 360}, 100%, ${Math.random() * 30 + 40}%)`,
    ice: (p) => `hsl(${((Math.random() * 40 + 180) + state.textHueOffset) % 360}, 100%, ${Math.random() * 40 + 60}%)`,
    neon: (p) => `hsl(${((Math.random() > 0.5 ? 320 : 160) + state.textHueOffset) % 360}, 100%, 60%)`,
    monochrome: (p) => `hsl(${state.textHueOffset}, ${(state.mouseMode === 'text') ? '50%' : '0%'}, ${Math.random() * 50 + 50}%)`
};

// --- Particle Engine ---
class Particle {
    constructor() {
        this.reset();
    }

    reset(x = Math.random() * width, y = Math.random() * height, isBurst = false) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        
        if (isBurst) {
            this.vx *= 10;
            this.vy *= 10;
        }
        
        this.baseSize = Math.random() * 2 + 0.5;
        this.size = this.baseSize;
        this.hue = Math.random() * 360;
        
        this.life = 0;
        this.maxLife = Math.random() * 200 + 100; // frames
        this.opacity = 0;
        this.mass = Math.random() * 0.5 + 0.5;
        this.targetX = null;
        this.targetY = null;
    }

    update() {
        this.life++;
        if (this.life < 20) {
            this.opacity = this.life / 20;
        } else if (this.life > this.maxLife - 20) {
            this.opacity = (this.maxLife - this.life) / 20;
        } else {
            this.opacity = 1;
        }

        if (fc.mode === 'text') {
            if (this.targetX !== null) {
                const dx = this.targetX - this.x;
                const dy = this.targetY - this.y;
                this.vx += dx * 0.03;
                this.vy += dy * 0.03;
                if (fc.active) {
                    const mdx = fc.mx - this.x;
                    const mdy = fc.my - this.y;
                    if (mdx * mdx + mdy * mdy < fc.radiusSq) {
                        this.vx -= mdx * 0.04;
                        this.vy -= mdy * 0.04;
                    }
                }
                this.vx *= 0.88;
                this.vy *= 0.88;
                this.life = 0;
                this.opacity = 1;
            }
        } else {
            this.vy += fc.gravity * this.mass;

            if (fc.active || fc.down) {
                const dx = fc.mx - this.x;
                const dy = fc.my - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < fc.radiusSq && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const invDist = 1 / dist;
                    const nx = dx * invDist;
                    const ny = dy * invDist;
                    const force = (1 - dist * fc.invRadius) * fc.force;
                    if (fc.mode === 'attract') {
                        this.vx += nx * force;
                        this.vy += ny * force;
                    } else if (fc.mode === 'repel') {
                        this.vx -= nx * force;
                        this.vy -= ny * force;
                    } else if (fc.mode === 'orbit') {
                        this.vx += (-ny + nx * 0.2) * force;
                        this.vy += ( nx + ny * 0.2) * force;
                    }
                }
            }

            this.vx *= 0.98;
            this.vy *= 0.98;
            this.vx += (Math.random() - 0.5) * 0.1;
            this.vy += (Math.random() - 0.5) * 0.1;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;

        if (this.life >= this.maxLife) {
            if (fc.down) {
                this.reset(fc.mx + (Math.random() - 0.5) * 20, fc.my + (Math.random() - 0.5) * 20);
            } else {
                this.reset();
            }
        }
    }

    draw(ctx) {
        const inTextMode = state.mouseMode === 'text';
        const isTextParticle = inTextMode && this.targetX !== null;

        // In text mode, only render particles that have a letter target
        if (inTextMode && !isTextParticle) return;

        const drawSize = isTextParticle ? 2 : this.size;
        const alpha = isTextParticle ? this.opacity * 0.9 : this.opacity;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = themes[state.theme](this);
        ctx.beginPath();
        ctx.arc(this.x, this.y, drawSize, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Object Pooling ---
const MAX_PARTICLES = 10000;
const particles = new Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
    particles[i] = new Particle();
}

// --- Batch Rendering Buffers (pre-allocated, reused every frame to avoid GC) ---
const NUM_BATCHES = 36;                          // one 10° hue bucket each
const _batchXYR = Array.from({ length: NUM_BATCHES },
    () => new Float32Array(MAX_PARTICLES * 3));   // x, y, r per particle
const _batchCount = new Int32Array(NUM_BATCHES);

const _fadeBuf = new Float32Array(MAX_PARTICLES * 5); // x, y, r, alpha, hue
let _fadeCount = 0;

function drawParticlesBatched() {
    _batchCount.fill(0);
    _fadeCount = 0;

    const isTextMode = state.mouseMode === 'text';
    const theme = state.theme;
    const hueOff = state.textHueOffset;

    // --- Phase 1: bucket particles by colour ---
    for (let i = 0; i < state.particleCount; i++) {
        const p = particles[i];
        const isTextP = isTextMode && p.targetX !== null;
        if (isTextMode && !isTextP) continue;

        const r     = isTextP ? 2 : p.size;
        const alpha = isTextP ? p.opacity * 0.9 : p.opacity;

        let hue;
        switch (theme) {
            case 'rainbow': hue = ((p.hue + p.life * 100) + hueOff) % 360; break;
            case 'fire':    hue = (Math.random() * 40 + 10  + hueOff) % 360; break;
            case 'ice':     hue = (Math.random() * 40 + 180 + hueOff) % 360; break;
            case 'neon':    hue = ((Math.random() > 0.5 ? 320 : 160) + hueOff) % 360; break;
            default:        hue = hueOff; break;
        }

        if (alpha < 0.95) {
            // Fading particle — draw individually to preserve opacity
            const o = _fadeCount * 5;
            _fadeBuf[o]     = p.x;
            _fadeBuf[o + 1] = p.y;
            _fadeBuf[o + 2] = r;
            _fadeBuf[o + 3] = alpha;
            _fadeBuf[o + 4] = hue;
            _fadeCount++;
        } else {
            const bucket = Math.floor(((hue % 360) + 360) % 360 / 10);
            const o = _batchCount[bucket] * 3;
            const buf = _batchXYR[bucket];
            buf[o]     = p.x;
            buf[o + 1] = p.y;
            buf[o + 2] = r;
            _batchCount[bucket]++;
        }
    }

    // --- Phase 2: one path + fill per colour bucket ---
    ctx.globalAlpha = 0.9;
    for (let b = 0; b < NUM_BATCHES; b++) {
        const count = _batchCount[b];
        if (count === 0) continue;

        const hue = b * 10 + 5;
        switch (theme) {
            case 'fire':       ctx.fillStyle = `hsl(${hue},100%,55%)`; break;
            case 'ice':        ctx.fillStyle = `hsl(${hue},100%,80%)`; break;
            case 'monochrome': ctx.fillStyle = `hsl(${hueOff},0%,75%)`; break;
            default:           ctx.fillStyle = `hsl(${hue},100%,60%)`; break;
        }

        const buf = _batchXYR[b];
        ctx.beginPath();
        for (let j = 0; j < count; j++) {
            const x = buf[j * 3];
            const y = buf[j * 3 + 1];
            const r = buf[j * 3 + 2];
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    // --- Phase 3: fading particles individually ---
    for (let f = 0; f < _fadeCount; f++) {
        const o     = f * 5;
        const x     = _fadeBuf[o];
        const y     = _fadeBuf[o + 1];
        const r     = _fadeBuf[o + 2];
        const alpha = _fadeBuf[o + 3];
        const hue   = _fadeBuf[o + 4];

        ctx.globalAlpha = alpha;
        switch (theme) {
            case 'fire':       ctx.fillStyle = `hsl(${hue|0},100%,55%)`; break;
            case 'ice':        ctx.fillStyle = `hsl(${hue|0},100%,80%)`; break;
            case 'monochrome': ctx.fillStyle = `hsl(${hueOff},0%,75%)`;  break;
            default:           ctx.fillStyle = `hsl(${hue|0},100%,60%)`; break;
        }
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1.0;
}

// --- Frame Rate Calculation ---
let lastTime = 0;
let frameCount = 0;
let lastFpsTime = 0;
const fpsDisplay = document.getElementById('fpsDisplay');

// --- Main Animation Loop ---
function animate(timestamp) {
    if (!state.isPaused) {
        // Trails Effect
        if (state.trails) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(5, 5, 5, 0.2)'; // Dark fade
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, width, height);
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;

        // 2 physics sub-steps per render frame — doubles mouse responsiveness
        // without changing visual frame rate
        refreshFrameCache();
        const pCount = state.particleCount;
        for (let i = 0; i < pCount; i++) particles[i].update();
        refreshFrameCache();
        for (let i = 0; i < pCount; i++) particles[i].update();

        // Draw — batched by colour bucket (~36 GPU flushes vs 2500)
        drawParticlesBatched();

        // Constellation Effect
        if (state.constellation) {
            drawConstellations();
        }
    }

    // FPS Counter
    frameCount++;
    if (timestamp - lastFpsTime >= 1000) {
        fpsDisplay.innerText = `${frameCount} FPS`;
        frameCount = 0;
        lastFpsTime = timestamp;
    }

    requestAnimationFrame(animate);
}

// Optmized Constellation rendering (checking only a subset of particles to maintain performance)
function drawConstellations() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 0.5;
    
    // We only check a fraction of particles to avoid O(N^2) lag
    const checkCount = Math.min(state.particleCount, 800); 
    const maxDistSq = 4000; // ~63px distance

    for (let i = 0; i < checkCount; i++) {
        for (let j = i + 1; j < checkCount; j++) {
            const p1 = particles[i];
            const p2 = particles[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < maxDistSq) {
                const opacity = (1 - distSq / maxDistSq) * 0.5 * p1.opacity * p2.opacity;
                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }
}

// --- Event Listeners ---
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

// Mouse Tracking
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.isActive = true;
    
    // Clear timeout to hide interaction when mouse stops
    clearTimeout(mouse.timeout);
    mouse.timeout = setTimeout(() => {
        if (!mouse.isDown) mouse.isActive = false;
    }, 2000);
});

window.addEventListener('mousedown', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.isDown = true;
    mouse.isActive = true;

    // Burst effect on click
    for (let i = 0; i < state.particleCount; i++) {
        const p = particles[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        if (dx*dx + dy*dy < 20000) { // within burst radius
            p.vx += dx * 0.1;
            p.vy += dy * 0.1;
            // Instantly wake them up
            p.life = 0; 
            p.opacity = 1;
        }
    }
});

window.addEventListener('mouseup', () => {
    mouse.isDown = false;
});

window.addEventListener('mouseleave', () => {
    mouse.isActive = false;
    mouse.isDown = false;
});

// Keyboard Controls
window.addEventListener('keydown', (e) => {
    if (e.key === '1') setMode('attract');
    if (e.key === '2') setMode('repel');
    if (e.key === '3') setMode('orbit');
    if (e.key.toLowerCase() === 'g') {
        const gravSlider = document.getElementById('gravity');
        if (state.gravity === 0) {
            state.gravity = 0.2;
            gravSlider.value = 0.2;
        } else {
            state.gravity = 0;
            gravSlider.value = 0;
        }
        document.getElementById('gravityValue').innerText = state.gravity.toFixed(2);
    }
    if (e.key.toLowerCase() === 's' && !e.target.matches('input, textarea')) {
        document.getElementById('btnScreenshot').click();
    }
});

// --- UI Binding ---
function bindUI(id, stateKey, isNumber = false) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(`${id}Value`);
    el.addEventListener('input', (e) => {
        const val = isNumber ? parseFloat(e.target.value) : e.target.value;
        state[stateKey] = val;
        if (valEl) valEl.innerText = isNumber ? val.toFixed(val % 1 !== 0 ? 2 : 0) : val;
    });
}

bindUI('particleCount', 'particleCount', true);
bindUI('mouseRadius', 'mouseRadius', true);
bindUI('mouseForce', 'mouseForce', true);
bindUI('gravity', 'gravity', true);

document.getElementById('themeSelect').addEventListener('change', (e) => {
    state.theme = e.target.value;
});

document.getElementById('trailsToggle').addEventListener('change', (e) => {
    state.trails = e.target.checked;
});

document.getElementById('constellationToggle').addEventListener('change', (e) => {
    state.constellation = e.target.checked;
});

// Mode Buttons
const modeBtns = document.querySelectorAll('.mode-btn');
function setMode(mode) {
    state.mouseMode = mode;
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => setMode(e.target.dataset.mode));
});

// Action Buttons
const btnPause = document.getElementById('btnPause');
btnPause.addEventListener('click', () => {
    state.isPaused = !state.isPaused;
    btnPause.innerText = state.isPaused ? 'Resume' : 'Pause';
    btnPause.style.background = state.isPaused ? '#e52e71' : 'rgba(255, 255, 255, 0.1)';
});

// Screenshot — uses File System Access API (save dialog) with download fallback
document.getElementById('btnScreenshot').addEventListener('click', async () => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'stellar-dust.png',
                types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (e) {
            if (e.name !== 'AbortError') fallbackDownload(blob);
        }
    } else {
        fallbackDownload(blob);
    }
});
function fallbackDownload(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stellar-dust.png';
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('btnReset').addEventListener('click', () => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
        particles[i].reset();
    }
    // Reset canvas to clear trails instantly
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);
    
    // Clear text input
    const wordInput = document.getElementById('wordInput');
    if (wordInput) {
        wordInput.value = '';
        updateTextTargets('');
        const btnClearText = document.getElementById('btnClearText');
        if (btnClearText) btnClearText.style.display = 'none';
    }
});

// --- Text-to-Pattern Logic ---
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
}

function sampleTextTargets(text) {
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    offCanvas.width = width;
    offCanvas.height = height;

    // Base size fits text to screen; budget cap keeps letter strokes dense enough
    const charCount = Math.max(text.replace(/\s/g, '').length, 1);
    const budgetCap = Math.sqrt(state.particleCount / charCount) * 10;
    const baseFontSize = Math.min(
        width / Math.max(text.length * 0.55, 1),
        height * 0.45,
        budgetCap
    );
    const fontSize = Math.max(16, baseFontSize * state.textSize);

    offCtx.fillStyle = 'white';
    offCtx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';

    // Word wrap: break into lines that fit within 92% of canvas width
    const maxLineW = width * 0.92;
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (offCtx.measureText(test).width > maxLineW && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);

    const lineHeight = fontSize * 1.25;
    const totalH = (lines.length - 1) * lineHeight;
    const startY = (height - totalH) / 2;
    lines.forEach((line, i) => offCtx.fillText(line, width / 2, startY + i * lineHeight));

    // Scan at skip=2 for speed; collect all text pixels in raster order
    const imgData = offCtx.getImageData(0, 0, width, height).data;
    const allTargets = [];
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            if (imgData[(y * width + x) * 4 + 3] > 80) {
                allTargets.push(x, y); // store as flat pairs — faster than objects
            }
        }
    }

    // Stratified stride sampling: divide allTargets into budget equal strata,
    // pick one random point per stratum → guarantees every stroke segment is covered
    const budget = Math.min(allTargets.length / 2, Math.floor(state.particleCount * 0.95));
    const selected = [];
    if (allTargets.length / 2 <= budget) {
        // Fewer pixels than budget — use all of them
        for (let i = 0; i < allTargets.length; i += 2) selected.push(allTargets[i], allTargets[i + 1]);
    } else {
        const stride = (allTargets.length / 2) / budget;
        for (let i = 0; i < budget; i++) {
            const lo = Math.floor(i * stride) * 2;
            const hi = Math.floor((i + 1) * stride) * 2;
            const idx = lo + Math.floor(Math.random() * ((hi - lo) / 2)) * 2;
            selected.push(allTargets[idx], allTargets[idx + 1]);
        }
    }
    return selected; // flat [x0, y0, x1, y1, ...]
}

function assignTextTargets(selected) {
    const count = selected.length / 2;
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (i < count) {
            particles[i].targetX = selected[i * 2]     + (Math.random() - 0.5) * 1.5;
            particles[i].targetY = selected[i * 2 + 1] + (Math.random() - 0.5) * 1.5;
        } else {
            particles[i].targetX = null;
            particles[i].targetY = null;
        }
    }
}

function updateTextTargets(text) {
    if (!text) {
        if (state.mouseMode === 'text') setMode('attract');
        state.textHueOffset = 0;
        return;
    }

    setMode('text');

    const hash = hashString(text);
    state.textHueOffset = Math.abs(hash % 360);

    document.fonts.ready.then(() => {
        const tempTargets = sampleTextTargets(text);
        assignTextTargets(tempTargets);
    });
}

const wordInput = document.getElementById('wordInput');
const btnClearText = document.getElementById('btnClearText');

if (wordInput) {
    wordInput.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        updateTextTargets(text);
        
        if (btnClearText) {
            btnClearText.style.display = text.length > 0 ? 'block' : 'none';
        }
        
        // Scatter particles slightly for a dynamic transition
        for (let i = 0; i < state.particleCount; i++) {
            particles[i].vx += (Math.random()-0.5) * 30;
            particles[i].vy += (Math.random()-0.5) * 30;
        }
    });
}

if (btnClearText) {
    btnClearText.addEventListener('click', () => {
        // "Vanish in far space" animation
        for (let i = 0; i < state.particleCount; i++) {
            if (particles[i].targetX !== null) {
                const dx = width / 2 - particles[i].x;
                const dy = height / 2 - particles[i].y;
                
                // Blast towards center
                particles[i].vx = (dx * 0.05) + (Math.random()-0.5) * 20;
                particles[i].vy = (dy * 0.05) + (Math.random()-0.5) * 20;
                
                // Shrink lifespan so they fade quickly
                particles[i].life = Math.max(0, particles[i].maxLife - 30);
                
                // Clear targets
                particles[i].targetX = null;
                particles[i].targetY = null;
            }
        }
        
        // Reset state
        if (wordInput) wordInput.value = '';
        btnClearText.style.display = 'none';
        if (state.mouseMode === 'text') setMode('attract');
        state.textHueOffset = 0;
    });
}

// Collapsible Menu
const btnCollapse = document.getElementById('btnCollapse');
const controlsPanel = document.getElementById('controls');
if (btnCollapse && controlsPanel) {
    btnCollapse.addEventListener('click', () => {
        controlsPanel.classList.toggle('collapsed');
    });
}

// --- Start Simulation ---
// Initialize canvas background
ctx.fillStyle = '#050505';
ctx.fillRect(0, 0, width, height);

requestAnimationFrame(animate);
