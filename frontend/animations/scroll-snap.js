(function () {
    'use strict';

    /**
     * Landing-page wheel-driven section snapping.
     *
     * - On desktop with a fine pointer, a deliberate wheel movement scrolls the
     *   page to the next/previous snap section with a smooth animation.
     * - CSS scroll-snap already provides a soft landing; this script prevents
     *   fast/jagged multi-section jumps by normalising wheel input.
     * - Disabled on touch devices and when prefers-reduced-motion is active.
     */

    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    if (isReduced || isTouch) return;

    const SNAP_SELECTOR = '.snap-section';
    const SCROLL_DURATION = 750; // ms, should match the CSS/JS easing feel
    const WHEEL_THRESHOLD = 45;  // minimum deltaY to trigger a snap

    let sections = [];
    let isSnapping = false;
    let snapTimer = null;
    let accumulatedDelta = 0;
    let lastWheelTime = 0;

    function refreshSections() {
        sections = Array.from(document.querySelectorAll(SNAP_SELECTOR))
            .map(el => {
                const style = window.getComputedStyle(el);
                const marginTop = parseFloat(style.marginTop) || 0;
                return {
                    el,
                    top: el.offsetTop - marginTop
                };
            })
            .sort((a, b) => a.top - b.top);
    }

    function getCurrentIndex() {
        const scrollTop = window.scrollY;
        let nearest = 0;
        let minDiff = Infinity;

        sections.forEach((section, index) => {
            const diff = Math.abs(section.top - scrollTop);
            if (diff < minDiff) {
                minDiff = diff;
                nearest = index;
            }
        });

        return nearest;
    }

    function snapTo(index) {
        if (!sections.length) return;

        index = Math.max(0, Math.min(index, sections.length - 1));
        const target = sections[index];

        isSnapping = true;
        accumulatedDelta = 0;

        // Disable native scroll snapping while JS drives the animation,
        // otherwise the browser may fight the smooth-scroll target.
        document.documentElement.style.scrollSnapType = 'none';

        window.scrollTo({
            top: target.top,
            behavior: 'smooth'
        });

        if (snapTimer) clearTimeout(snapTimer);
        snapTimer = window.setTimeout(() => {
            isSnapping = false;
            document.documentElement.style.scrollSnapType = '';
        }, SCROLL_DURATION + 50);
    }

    function onWheel(e) {
        // Respect any active in-page smooth anchor scroll from script.js.
        if (isSnapping) {
            e.preventDefault();
            return;
        }

        // Only vertical wheel matters here.
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

        const now = performance.now();
        const timeDelta = now - lastWheelTime;
        lastWheelTime = now;

        // Reset accumulation if the user paused between wheel events.
        if (timeDelta > 250) {
            accumulatedDelta = 0;
        }

        accumulatedDelta += e.deltaY;

        // Ignore small/trackpad drift.
        if (Math.abs(accumulatedDelta) < WHEEL_THRESHOLD) return;

        e.preventDefault();

        const direction = accumulatedDelta > 0 ? 1 : -1;
        const current = getCurrentIndex();
        snapTo(current + direction);

        accumulatedDelta = 0;
    }

    function onKeyDown(e) {
        if (isSnapping) return;

        const current = getCurrentIndex();
        let next = null;

        switch (e.key) {
            case 'PageDown':
            case 'ArrowDown':
            case ' ': // Space scrolls down unless focused on a form control
                if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
                    return;
                }
                next = current + 1;
                break;
            case 'PageUp':
            case 'ArrowUp':
                next = current - 1;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = sections.length - 1;
                break;
            default:
                return;
        }

        if (next !== null) {
            e.preventDefault();
            snapTo(next);
        }
    }

    refreshSections();
    window.addEventListener('resize', refreshSections, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    // If the URL contains an anchor, refresh positions once fonts/layout settle.
    window.addEventListener('load', refreshSections, { once: true });
})();
