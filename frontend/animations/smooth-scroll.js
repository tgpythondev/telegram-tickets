(function () {
    'use strict';

    /**
     * Landing-page smooth wheel scrolling (dynamic, free-position).
     *
     * Replaces the old fixed section snapping (one wheel tick = one full
     * section). The eased motion feel is preserved, but the user can now
     * stop at ANY position: wheel deltas accumulate into a target offset
     * which the page approaches with a smooth lerp animation.
     *
     * - Scrollbar drags, keyboard scrolling and anchor clicks keep working:
     *   any scroll this script did not start is adopted as the new target.
     * - Disabled on touch devices and when prefers-reduced-motion is active.
     */

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isReduced || isTouch) return;

    const EASE = 0.13;           // fraction of the remaining distance per frame (~750ms settle, same feel as the old snap)
    const SPEED = 1.6;           // wheel delta multiplier — one notch ≈ 160px
    const LINE_HEIGHT = 33;      // deltaMode 1 (lines) → px
    const STOP_EPSILON = 0.5;    // px — animation ends below this distance

    let targetY = window.scrollY;
    let currentY = window.scrollY;
    let rafId = null;
    let animating = false;
    let lastSetY = window.scrollY; // last scrollTop WE set — used to detect external scrolls

    function maxScroll() {
        return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function clampTarget() {
        targetY = Math.max(0, Math.min(targetY, maxScroll()));
    }

    // Inline override of the CSS `scroll-behavior: smooth` (style.css) so our
    // per-frame jumps are instant; restored when the animation finishes.
    function setNativeSmooth(enabled) {
        document.documentElement.style.scrollBehavior = enabled ? '' : 'auto';
    }

    function finishAnimation() {
        animating = false;
        rafId = null;
        setNativeSmooth(true);
    }

    function tick() {
        const diff = targetY - currentY;

        if (Math.abs(diff) < STOP_EPSILON) {
            currentY = targetY;
            lastSetY = currentY;
            window.scrollTo({ top: currentY, behavior: 'instant' });
            finishAnimation();
            return;
        }

        currentY += diff * EASE;
        lastSetY = Math.round(currentY);
        window.scrollTo({ top: lastSetY, behavior: 'instant' });
        rafId = window.requestAnimationFrame(tick);
    }

    function startAnimation() {
        if (animating) return;
        animating = true;
        setNativeSmooth(false);
        currentY = window.scrollY;
        clampTarget();
        rafId = window.requestAnimationFrame(tick);
    }

    function onWheel(e) {
        // Let an open modal handle its own scrolling.
        if (e.target.closest && e.target.closest('.modal-overlay.active')) return;

        // Only vertical wheel matters here.
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        e.preventDefault();

        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= LINE_HEIGHT;             // lines
        else if (e.deltaMode === 2) delta *= window.innerHeight; // pages

        // If the page moved externally since our last frame (scrollbar,
        // keyboard, anchor link), continue from where it actually is.
        if (!animating) {
            targetY = window.scrollY;
        }

        targetY += delta * SPEED;
        clampTarget();
        startAnimation();
    }

    function onScroll() {
        if (!animating) {
            // External scroll (keyboard, scrollbar, anchor) — adopt position.
            targetY = window.scrollY;
            currentY = window.scrollY;
            lastSetY = currentY;
            return;
        }

        // Mid-animation: if the page is no longer where we put it, the user
        // grabbed the scrollbar or a native smooth scroll took over — yield.
        if (Math.abs(window.scrollY - lastSetY) > 2) {
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            targetY = window.scrollY;
            currentY = window.scrollY;
            finishAnimation();
        }
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', clampTarget, { passive: true });
})();
