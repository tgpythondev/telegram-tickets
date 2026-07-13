document.querySelectorAll('.liquid-border').forEach(el => {
    let rafId = null;

    el.addEventListener('mousemove', (e) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const angle = Math.atan2(y - rect.height / 2, x - rect.width / 2) * (180 / Math.PI);
            el.style.setProperty('--cursor-angle', `${angle}deg`);
            rafId = null;
        });
    });
});
