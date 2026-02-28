import './nav-hero';
import './toast';
import './grid';
import './review';
import './globe';
import './shortcuts';
import './accessibility';
import { createRafScrollHandler } from './performance';
import './performance';
import './responsive';
import './pages';
import './reservation';
import './integration';

// ─── Cinematic scroll engine (video scrubbing) ───────────────────────────────
// Two MP4 videos (seq1.mp4 / seq2.mp4) replace the old 389-frame JPEG canvas.
// video.currentTime is driven by scroll position — no preload of hundreds of
// images needed, works identically on localhost and Vercel.

interface ScrollPhase {
    start: number;
    end: number;
}

// ─── Scroll budget ────────────────────────────────────────────────────────────

const VH: number = window.innerHeight;

const PHASE_SEQ1: ScrollPhase = { start: 0, end: VH * 5 };
const PHASE_BLUR: ScrollPhase = { start: VH * 5, end: VH * 7 };
const PHASE_SEQ2: ScrollPhase = { start: VH * 7, end: VH * 12 };

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const spacer = document.getElementById('cinematic-spacer') as HTMLDivElement;
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

// ─── Create video elements ────────────────────────────────────────────────────

function makeVideo(src: string): HTMLVideoElement {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    // Keep paused — we control playback via currentTime
    v.pause();
    Object.assign(v.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        pointerEvents: 'none',
        zIndex: '0',
        display: 'none',
    });
    document.body.insertBefore(v, document.body.firstChild);
    return v;
}

const vid1 = makeVideo('seq1.mp4');
const vid2 = makeVideo('seq2.mp4');

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

// ─── Reveal / restore helpers ─────────────────────────────────────────────────

function revealMainApp(): void {
    skipBtn.style.display = 'none';
    vid1.style.display = 'none';
    vid2.style.display = 'none';
    seq1Overlay.style.display = 'none';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    spacer.style.display = 'none';
    setTimeout((): void => {
        mainApp.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, 200);
}

function restoreCinematic(): void {
    introComplete = false;
    vid1.style.display = 'block';
    vid2.style.display = 'none';
    seq1Overlay.style.display = 'flex';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    skipBtn.style.display = 'block';
    spacer.style.display = 'block';
    mainApp.style.display = 'none';
    scrollIndicator.style.opacity = '1';
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    onScroll();
}

// ─── spacer height ────────────────────────────────────────────────────────────

spacer.style.height = `${PHASE_SEQ2.end + VH}px`;

// ─── Scroll handler ───────────────────────────────────────────────────────────

let introComplete = false;

function onScroll(): void {
    if (introComplete) return;
    const scrollY = window.scrollY;

    // Phase 1 — Sequence 1
    if (scrollY < PHASE_BLUR.start) {
        vid2.style.display = 'none';
        vid1.style.display = 'block';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';
        seq2Overlay.style.display = 'none';
        seq1Overlay.style.display = 'flex';

        const p = phaseProgress(scrollY, PHASE_SEQ1);
        if (vid1.duration) {
            vid1.currentTime = p * vid1.duration;
        }
        setOpacity(wordmark, p > 0.35 ? 1 : 0);
        setOpacity(tagline, p > 0.65 ? 1 : 0);
        scrollIndicator.style.opacity = p > 0.05 ? '0' : '1';
    }

    // Phase 2 — Blur interlude
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

    // Phase 3 — Sequence 2
    else {
        vid1.style.display = 'none';
        vid2.style.display = 'block';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';
        seq1Overlay.style.display = 'none';
        seq2Overlay.style.display = 'flex';

        const p = phaseProgress(scrollY, PHASE_SEQ2);
        if (vid2.duration) {
            vid2.currentTime = p * vid2.duration;
        }
        setOpacity(discoverText, p > 0.30 ? 1 : 0);
        setOpacity(citiesText, p > 0.65 ? 1 : 0);
        setOpacity(exploreBtn, p > 0.88 ? 1 : 0);
        exploreBtn.style.pointerEvents = p > 0.88 ? 'all' : 'none';

        if (p >= 1) {
            introComplete = true;
            revealMainApp();
        }
    }
}

window.addEventListener('scroll', createRafScrollHandler(onScroll), { passive: true });

// ─── Skip / Explore buttons ───────────────────────────────────────────────────

skipBtn.addEventListener('click', (): void => {
    introComplete = true;
    skipBtn.style.display = 'none';
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
});

exploreBtn.addEventListener('click', (): void => {
    introComplete = true;
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:explore-now'));
});

// ─── Nav logo — replay cinematic ─────────────────────────────────────────────

const navLogo = document.querySelector<HTMLAnchorElement>('.nav-logo');
navLogo?.addEventListener('click', (e: MouseEvent): void => {
    e.preventDefault();
    restoreCinematic();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Hide progress bar after both videos have enough data to play

let readyCount = 0;
function onVideoReady(): void {
    readyCount++;
    if (readyCount >= 2) {
        preloadFill.style.width = '100%';
        setTimeout((): void => {
            preloadBar.style.opacity = '0';
            setTimeout((): void => { preloadBar.style.display = 'none'; }, 400);
        }, 200);

        // If both videos failed (0 duration), skip intro
        if (!vid1.duration && !vid2.duration) {
            introComplete = true;
            revealMainApp();
            window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
            return;
        }

        scrollIndicator.style.opacity = '1';
        vid1.style.display = 'block';
        onScroll(); // draw first frame
    }
}

// Show incremental progress while videos buffer
vid1.addEventListener('progress', (): void => {
    preloadFill.style.width = '40%';
});
vid2.addEventListener('progress', (): void => {
    const cur = parseFloat(preloadFill.style.width || '0');
    preloadFill.style.width = `${Math.max(cur, 70)}%`;
});

vid1.addEventListener('canplaythrough', onVideoReady, { once: true });
vid2.addEventListener('canplaythrough', onVideoReady, { once: true });

// Fallback: if canplaythrough doesn't fire within 5 s, start anyway
setTimeout((): void => {
    if (readyCount < 2) {
        readyCount = 2;
        onVideoReady();
    }
}, 5000);

// Start loading
vid1.load();
vid2.load();
