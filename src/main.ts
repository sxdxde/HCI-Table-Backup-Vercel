import './nav-hero';
import './toast';
import './grid';
import './review';
import './globe';
import './shortcuts';
import './accessibility';
import './performance';
import './responsive';
import './pages';
import './reservation';
import './integration';

// ─── Smooth cinematic scroll engine ─────────────────────────────────────────
//
// Architecture:
//  • Two hidden <video> elements (decode sources only, never shown directly)
//  • One full-screen <canvas> that shows the current decoded frame
//  • Per-video seek queue: never stacks seeks — always jumps to the LATEST
//    target so fast scrolling skips ahead cleanly
//  • rAF loop lerps rawScrollY → smoothScrollY for natural easing
//  • Videos re-encoded with -g 1 (every frame is a keyframe) → seeks are
//    instant: no GOP walk-back, no stutter
// ─────────────────────────────────────────────────────────────────────────────

interface ScrollPhase { start: number; end: number; }

// ─── Scroll budget ────────────────────────────────────────────────────────────

const VH = window.innerHeight;
const PHASE_SEQ1: ScrollPhase = { start: 0, end: VH * 5 };
const PHASE_BLUR: ScrollPhase = { start: VH * 5, end: VH * 7 };
const PHASE_SEQ2: ScrollPhase = { start: VH * 7, end: VH * 12 };

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const spacer = document.getElementById('cinematic-spacer') as HTMLDivElement;
const canvas = document.getElementById('cinematic-canvas') as HTMLCanvasElement;
const preloadBar = document.getElementById('preload-bar') as HTMLDivElement;
const preloadFill = document.getElementById('preload-fill') as HTMLDivElement;
const skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;
const blurInterlude = document.getElementById('blur-interlude') as HTMLDivElement;
const blurQuote = blurInterlude.querySelector('blockquote') as HTMLQuoteElement;
const seq1Overlay = document.getElementById('seq1-overlay') as HTMLDivElement;
const wordmark = seq1Overlay.querySelector('.wordmark') as HTMLSpanElement;
const tagline = seq1Overlay.querySelector('.tagline') as HTMLParagraphElement;
const seq2Overlay = document.getElementById('seq2-overlay') as HTMLDivElement;
const discoverText = seq2Overlay.querySelector('.seq2-discover') as HTMLParagraphElement;
const citiesText = seq2Overlay.querySelector('.seq2-cities') as HTMLParagraphElement;
const exploreBtn = document.getElementById('explore-btn') as HTMLButtonElement;
const mainApp = document.getElementById('main-app') as HTMLDivElement;
const scrollIndicator = seq1Overlay.querySelector<HTMLDivElement>('.scroll-indicator')!;

const ctx = canvas.getContext('2d', { alpha: false })!;

// ─── Canvas sizing ────────────────────────────────────────────────────────────

function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas, { passive: true });
spacer.style.height = `${PHASE_SEQ2.end + VH}px`;

// ─── Hidden video elements (decode sources) ───────────────────────────────────

function makeDecodeVideo(src: string): HTMLVideoElement {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    // Hidden off-screen — we draw to canvas ourselves
    Object.assign(v.style, {
        position: 'fixed', top: '-9999px', left: '-9999px',
        width: '1px', height: '1px', opacity: '0', pointerEvents: 'none',
    });
    document.body.appendChild(v);
    return v;
}

const vid1 = makeDecodeVideo('seq1.mp4');
const vid2 = makeDecodeVideo('seq2.mp4');

// ─── Per-video seek queue ─────────────────────────────────────────────────────
// Rule: only one seek in flight per video.  If a new target arrives while
// seeking, remember it.  On 'seeked', draw the frame then process any pending.

let seeking1 = false;
let pending1: number | null = null;
let seeking2 = false;
let pending2: number | null = null;

function seekVid1(time: number): void {
    if (seeking1) { pending1 = time; return; }
    seeking1 = true;
    vid1.currentTime = time;
}

function seekVid2(time: number): void {
    if (seeking2) { pending2 = time; return; }
    seeking2 = true;
    vid2.currentTime = time;
}

vid1.addEventListener('seeked', (): void => {
    seeking1 = false;
    if (activeSeq === 1) ctx.drawImage(vid1, 0, 0, canvas.width, canvas.height);
    if (pending1 !== null) { const t = pending1; pending1 = null; seekVid1(t); }
});

vid2.addEventListener('seeked', (): void => {
    seeking2 = false;
    if (activeSeq === 2) ctx.drawImage(vid2, 0, 0, canvas.width, canvas.height);
    if (pending2 !== null) { const t = pending2; pending2 = null; seekVid2(t); }
});

// ─── State ────────────────────────────────────────────────────────────────────

let activeSeq = 1;           // which video is the current source
let introComplete = false;
let rawScrollY = 0;
let smoothScrollY = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
}
function phaseProgress(scrollY: number, phase: ScrollPhase): number {
    return clamp((scrollY - phase.start) / (phase.end - phase.start), 0, 1);
}
function setOpacity(el: HTMLElement, opacity: number): void {
    el.style.opacity = String(opacity);
}

// ─── Reveal / restore ─────────────────────────────────────────────────────────

function revealMainApp(): void {
    skipBtn.style.display = 'none';
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 600ms ease';
    seq1Overlay.style.display = 'none';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    setTimeout((): void => {
        canvas.style.display = 'none';
        spacer.style.display = 'none';
        mainApp.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, 620);
}

function restoreCinematic(): void {
    introComplete = false;
    rawScrollY = 0;
    smoothScrollY = 0;
    canvas.style.transition = '';
    canvas.style.opacity = '1';
    canvas.style.display = 'block';
    spacer.style.display = 'block';
    seq1Overlay.style.display = 'flex';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    skipBtn.style.display = 'block';
    mainApp.style.display = 'none';
    scrollIndicator.style.opacity = '1';
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

// ─── Per-frame scroll logic ───────────────────────────────────────────────────
// Called every rAF with the current smoothScrollY value.

function applyScroll(scrollY: number): void {
    if (introComplete) return;

    // ── Phase 1: Sequence 1 ────────────────────────────────────────────────────
    if (scrollY < PHASE_BLUR.start) {
        activeSeq = 1;
        const p = phaseProgress(scrollY, PHASE_SEQ1);
        if (vid1.readyState >= 2 && vid1.duration) {
            seekVid1(p * vid1.duration);
        }

        seq2Overlay.style.display = 'none';
        seq1Overlay.style.display = 'flex';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';

        setOpacity(wordmark, p > 0.35 ? 1 : 0);
        setOpacity(tagline, p > 0.65 ? 1 : 0);
        scrollIndicator.style.opacity = p > 0.05 ? '0' : '1';
    }

    // ── Phase 2: Blur interlude ────────────────────────────────────────────────
    else if (scrollY < PHASE_SEQ2.start) {
        seq1Overlay.style.display = 'none';
        seq2Overlay.style.display = 'none';

        const p = phaseProgress(scrollY, PHASE_BLUR);
        const op = p < 0.5 ? p * 2 : (1 - p) * 2;
        blurInterlude.style.opacity = String(op);
        blurInterlude.style.pointerEvents = p > 0.1 ? 'auto' : 'none';
        blurQuote.style.opacity = p > 0.3 && p < 0.7 ? '1' : '0';
        blurQuote.style.transform = p > 0.3 ? 'translateY(0)' : 'translateY(16px)';
    }

    // ── Phase 3: Sequence 2 ────────────────────────────────────────────────────
    else {
        activeSeq = 2;
        const p = phaseProgress(scrollY, PHASE_SEQ2);
        if (vid2.readyState >= 2 && vid2.duration) {
            seekVid2(p * vid2.duration);
        }

        seq1Overlay.style.display = 'none';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';
        seq2Overlay.style.display = 'flex';

        setOpacity(discoverText, p > 0.30 ? 1 : 0);
        setOpacity(citiesText, p > 0.65 ? 1 : 0);
        setOpacity(exploreBtn, p > 0.88 ? 1 : 0);
        exploreBtn.style.pointerEvents = p > 0.88 ? 'all' : 'none';

        // Use RAW scroll for the exit trigger so it fires at the right time
        if (rawScrollY >= PHASE_SEQ2.end) {
            introComplete = true;
            revealMainApp();
        }
    }
}

// ─── rAF loop ─────────────────────────────────────────────────────────────────
// Lerp factor: 0.10 = silky / very smooth.  Increase toward 0.25 to feel snappier.
const LERP = 0.10;

function rafLoop(): void {
    if (!introComplete) {
        // Lerp rawScrollY → smoothScrollY for eased video time
        smoothScrollY += (rawScrollY - smoothScrollY) * LERP;

        applyScroll(smoothScrollY);
    }
    requestAnimationFrame(rafLoop);
}

// Capture raw scroll — lightweight, no work done here
window.addEventListener('scroll', (): void => {
    rawScrollY = window.scrollY;
}, { passive: true });

// ─── Skip / Explore buttons ───────────────────────────────────────────────────

skipBtn.addEventListener('click', (): void => {
    introComplete = true;
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
});

exploreBtn.addEventListener('click', (): void => {
    introComplete = true;
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:explore-now'));
});

// ─── Nav logo — replay cinematic ─────────────────────────────────────────────

document.querySelector<HTMLAnchorElement>('.nav-logo')
    ?.addEventListener('click', (e: MouseEvent): void => {
        e.preventDefault();
        restoreCinematic();
    });

// ─── Boot — wait for both videos ready ───────────────────────────────────────

let readyCount = 0;

function onVideoReady(): void {
    readyCount++;
    if (readyCount < 2) return;

    // Animate fill to 100% then hide bar
    preloadFill.style.width = '100%';
    setTimeout((): void => {
        preloadBar.style.opacity = '0';
        setTimeout((): void => { preloadBar.style.display = 'none'; }, 400);
    }, 200);

    // If neither video decoded, skip straight to app
    if (!vid1.duration && !vid2.duration) {
        introComplete = true;
        revealMainApp();
        window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
        return;
    }

    // Draw first frame immediately
    activeSeq = 1;
    seekVid1(0);
    scrollIndicator.style.opacity = '1';

    // Start rAF loop
    requestAnimationFrame(rafLoop);
}

// Show incremental loading progress
vid1.addEventListener('progress', (): void => { preloadFill.style.width = '40%'; });
vid2.addEventListener('progress', (): void => {
    const cur = parseFloat(preloadFill.style.width || '0');
    preloadFill.style.width = `${Math.max(cur, 70)}%`;
});

// Fire when enough data is buffered to play through
vid1.addEventListener('canplaythrough', onVideoReady, { once: true });
vid2.addEventListener('canplaythrough', onVideoReady, { once: true });

// Safety fallback: start anyway after 4 s even if canplaythrough didn't fire
setTimeout((): void => {
    if (readyCount < 2) { readyCount = 2; onVideoReady(); }
}, 4000);

vid1.load();
vid2.load();
