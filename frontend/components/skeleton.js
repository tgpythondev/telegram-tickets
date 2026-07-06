function createSkeletonTickets(count = 3) {
    const container = document.createElement('div');
    container.className = 'skeleton-tickets';

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'skeleton-ticket-card';
        
        // Создаём элементы через DOM API для безопасности
        const skeleton1 = document.createElement('div');
        skeleton1.className = 'skeleton';
        
        const skeleton2 = document.createElement('div');
        skeleton2.className = 'skeleton';
        
        const skeleton3 = document.createElement('div');
        skeleton3.className = 'skeleton';
        
        card.appendChild(skeleton1);
        card.appendChild(skeleton2);
        card.appendChild(skeleton3);
        container.appendChild(card);
    }

    return container;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSkeletonTickets };
}
