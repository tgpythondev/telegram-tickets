function createSkeletonTickets(count = 3) {
    const container = document.createElement('div');
    container.className = 'skeleton-tickets';

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'skeleton-ticket-card';
        card.innerHTML = `
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
        `;
        container.appendChild(card);
    }

    return container;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSkeletonTickets };
}
