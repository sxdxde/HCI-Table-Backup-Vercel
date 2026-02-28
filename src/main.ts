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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrollPhase {
    start: number;
    end: number;
}

interface CinematicConfig {
    seq1Dir: string;
    seq2Dir: string;
    seq1Total: number;
    seq2Total: number;
    filenameFn: (dir: string, i: number) => string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
// Inspected actual files: ezgif-frame-001.jpg … (3-digit, 1-indexed)
// sequence-1 → 164 frames   sequence-2 → 225 frames

const CONFIG: CinematicConfig = {
    seq1Dir: 'sequence-1/',
    seq2Dir: 'sequence-2/',
    seq1Total: 164,
    seq2Total: 225,
    // Files are 1-indexed with 3-digit zero-padding: ezgif-frame-001.jpg
    filenameFn: (dir: string, i: number): string =>
        `${dir}ezgif-frame-${String(i + 1).padStart(3, '0')}.jpg`,
};

// ─── Scroll budget ────────────────────────────────────────────────────────────

const VH: number = window.innerHeight;

const PHASE_SEQ1: ScrollPhase = { start: 0, end: VH * 5 };
const PHASE_BLUR: ScrollPhase = { start: VH * 5, end: VH * 7 };
const PHASE_SEQ2: ScrollPhase = { start: VH * 7, end: VH * 12 };

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const spacer = document.getElementById('cinematic-spacer') as HTMLDivElement;
const canvas = document.getElementById('cinematic-canvas') as HTMLCanvasElement;
const preloadFill = document.getElementById('preload-fill') as HTMLDivElement;
const preloadBar = document.getElementById('preload-bar') as HTMLDivElement;
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

const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;

// ─── Frame stores ─────────────────────────────────────────────────────────────

const seq1Frames: HTMLImageElement[] = [];
const seq2Frames: HTMLImageElement[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function phaseProgress(scrollY: number, phase: ScrollPhase): number {
    return clamp((scrollY - phase.start) / (phase.end - phase.start), 0, 1);
}

function setOpacity(el: HTMLElement, opacity: number): void {
    el.style.opacity = String(opacity);
}

function revealMainApp(): void {
    // Hide the skip button immediately — don't show it in main app
    skipBtn.style.display = 'none';
    canvas.style.transition = 'opacity 800ms ease';
    canvas.style.opacity = '0';
    seq1Overlay.style.display = 'none';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    setTimeout((): void => {
        canvas.style.display = 'none';
        spacer.style.display = 'none';
        mainApp.style.display = 'block';
        // Scroll to top so user lands at hero search, not footer
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, 820);
}

// Restore cinematic so the logo click can replay the intro
function restoreCinematic(): void {
    introComplete = false;
    // Re-show cinematic layer
    canvas.style.transition = '';
    canvas.style.opacity = '1';
    canvas.style.display = 'block';
    spacer.style.display = 'block';
    seq1Overlay.style.display = 'flex';
    seq2Overlay.style.display = 'none';
    blurInterlude.style.opacity = '0';
    blurInterlude.style.pointerEvents = 'none';
    // Show skip button again for the cinematic
    skipBtn.style.display = 'block';
    // Hide main app while cinematic plays
    mainApp.style.display = 'none';
    // Reset scroll indicator
    scrollIndicator.style.opacity = '1';
    // Jump to top instantly then re-render first frame
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    onScroll();
}

// ─── Canvas sizing ────────────────────────────────────────────────────────────

function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
spacer.style.height = `${PHASE_SEQ2.end + VH}px`;

// ─── Preload ──────────────────────────────────────────────────────────────────

function loadFrames(
    dir: string,
    total: number,
    store: HTMLImageElement[],
    filenameFn: (dir: string, i: number) => string,
    onProgress: (loaded: number, total: number) => void,
): Promise<void> {
    return new Promise<void>((resolve): void => {
        if (total === 0) { resolve(); return; }
        let loaded = 0;
        for (let i = 0; i < total; i++) {
            const img = new Image();
            img.src = filenameFn(dir, i);
            img.onload = img.onerror = (): void => {
                loaded++;
                onProgress(loaded, total);
                if (loaded === total) resolve();
            };
            store.push(img);
        }
    });
}

async function preload(): Promise<void> {
    const totalFrames: number = CONFIG.seq1Total + CONFIG.seq2Total;
    let globalLoaded = 0;
    let successCount = 0;

    const onProgress = (_loaded: number, _total: number): void => {
        globalLoaded++;
        const pct: number = totalFrames > 0
            ? (globalLoaded / totalFrames) * 100
            : 100;
        preloadFill.style.width = `${pct}%`;
    };

    // Track successes so we can detect when frames don't exist
    function loadFramesTracked(
        dir: string, total: number, store: HTMLImageElement[],
        filenameFn: (d: string, i: number) => string,
        onProg: (l: number, t: number) => void,
    ): Promise<void> {
        return new Promise<void>((resolve): void => {
            if (total === 0) { resolve(); return; }
            let loaded = 0;
            for (let i = 0; i < total; i++) {
                const img = new Image();
                img.src = filenameFn(dir, i);
                img.onload = (): void => { successCount++; loaded++; onProg(loaded, total); if (loaded === total) resolve(); };
                img.onerror = (): void => { loaded++; onProg(loaded, total); if (loaded === total) resolve(); };
                store.push(img);
            }
        });
    }

    await Promise.all([
        loadFramesTracked(CONFIG.seq1Dir, CONFIG.seq1Total, seq1Frames, CONFIG.filenameFn, onProgress),
        loadFramesTracked(CONFIG.seq2Dir, CONFIG.seq2Total, seq2Frames, CONFIG.filenameFn, onProgress),
    ]);

    preloadBar.style.opacity = '0';
    setTimeout((): void => { preloadBar.style.display = 'none'; }, 400);

    // ── Auto-skip if no frame images exist (missing public/ assets) ──────────
    if (successCount === 0) {
        introComplete = true;
        revealMainApp();
        window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
        return;
    }

    // Show scroll indicator once frames are ready so CSS transition fires
    scrollIndicator.style.opacity = '1';

    window.addEventListener('scroll', createRafScrollHandler(onScroll), { passive: true });
    onScroll(); // draw first frame immediately
}

// ─── Scroll handler ───────────────────────────────────────────────────────────

let introComplete = false;

function onScroll(): void {
    if (introComplete) return;
    const scrollY: number = window.scrollY;

    // ── Phase 1: Sequence 1 ──────────────────────────────────────────────────
    if (scrollY < PHASE_BLUR.start) {
        seq2Overlay.style.display = 'none';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';

        const p: number = phaseProgress(scrollY, PHASE_SEQ1);
        const frameIdx: number = Math.min(
            Math.floor(p * (CONFIG.seq1Total - 1)),
            CONFIG.seq1Total - 1,
        );
        if (seq1Frames[frameIdx]?.complete && seq1Frames[frameIdx].naturalWidth > 0) {
            ctx.drawImage(seq1Frames[frameIdx], 0, 0, canvas.width, canvas.height);
        }
        seq1Overlay.style.display = 'flex';
        setOpacity(wordmark, p > 0.35 ? 1 : 0);
        setOpacity(tagline, p > 0.65 ? 1 : 0);
        // Hide scroll indicator once user scrolls more than a tiny bit
        scrollIndicator.style.opacity = p > 0.05 ? '0' : '1';
    }

    // ── Phase 2: Blur interlude ──────────────────────────────────────────────
    else if (scrollY < PHASE_SEQ2.start) {
        seq1Overlay.style.display = 'none';
        seq2Overlay.style.display = 'none';

        const p: number = phaseProgress(scrollY, PHASE_BLUR);
        const interludeOpacity: number = p < 0.5 ? p * 2 : (1 - p) * 2;

        blurInterlude.style.opacity = String(interludeOpacity);
        blurInterlude.style.pointerEvents = p > 0.1 ? 'auto' : 'none';
        blurQuote.style.opacity = p > 0.3 && p < 0.7 ? '1' : '0';
        blurQuote.style.transform = p > 0.3 ? 'translateY(0)' : 'translateY(16px)';
    }

    // ── Phase 3: Sequence 2 ──────────────────────────────────────────────────
    else {
        seq1Overlay.style.display = 'none';
        blurInterlude.style.opacity = '0';
        blurInterlude.style.pointerEvents = 'none';

        const p: number = phaseProgress(scrollY, PHASE_SEQ2);
        const frameIdx: number = Math.min(
            Math.floor(p * (CONFIG.seq2Total - 1)),
            CONFIG.seq2Total - 1,
        );
        if (seq2Frames[frameIdx]?.complete && seq2Frames[frameIdx].naturalWidth > 0) {
            ctx.drawImage(seq2Frames[frameIdx], 0, 0, canvas.width, canvas.height);
        }
        seq2Overlay.style.display = 'flex';
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

// ─── Skip button ──────────────────────────────────────────────────────────────

skipBtn.addEventListener('click', (): void => {
    introComplete = true;
    skipBtn.style.display = 'none'; // hide immediately on click
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:skip-intro'));
});

// ─── Explore Now button ───────────────────────────────────────────────────────

exploreBtn.addEventListener('click', (): void => {
    introComplete = true;
    revealMainApp();
    window.dispatchEvent(new CustomEvent('tabla:explore-now'));
});

// ─── Nav logo — replay cinematic ───────────────────────────────────────────

const navLogo = document.querySelector<HTMLAnchorElement>('.nav-logo');
navLogo?.addEventListener('click', (e: MouseEvent): void => {
    e.preventDefault();
    restoreCinematic();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

preload();
