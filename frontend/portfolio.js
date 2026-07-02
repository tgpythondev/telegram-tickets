// Portfolio module - IIFE for clean scope
(function() {
    'use strict';

    // Shared escapeHtml helper (consistent with project)
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Mock data for portfolio categories
    var mockData = {
        basic: [
            {
                id: 'b1',
                title: 'Бот для опросов',
                description: 'Сбор мнений пользователей',
                price: '5 000 ₽',
                term: '3 дня',
                videoUrl: 'https://example.com/video/b1',
                features: ['Опросы с вариантами ответов', 'Анализ результатов', 'Экспорт данных']
            },
            {
                id: 'b2',
                title: 'Чат-бот поддержки',
                description: 'Ответы на частые вопросы',
                price: '7 500 ₽',
                term: '5 дней',
                videoUrl: 'https://example.com/video/b2',
                features: ['База знаний', 'Переадресация оператору', 'Статистика запросов']
            }
        ],
        starter: [
            {
                id: 's1',
                title: 'Магазин через Telegram',
                description: 'Каталог товаров с корзиной',
                price: '15 000 ₽',
                term: '1 неделя',
                videoUrl: 'https://example.com/video/s1',
                features: ['Каталог с категориями', 'Корзина и заказы', 'Уведомления о статусе']
            },
            {
                id: 's2',
                title: 'Бот для записи',
                description: 'Онлайн-запись на услуги',
                price: '12 000 ₽',
                term: '5 дней',
                videoUrl: 'https://example.com/video/s2',
                features: ['Расписание', 'Напоминания', 'Буфер времени']
            },
            {
                id: 's3',
                title: 'Онлайн-консультант',
                description: 'Анкетирование и предложение',
                price: '18 000 ₽',
                term: '1 неделя',
                videoUrl: 'https://example.com/video/s3',
                features: ['Конструктор анкет', 'Формирование предложения', 'Переход к покупке']
            }
        ],
        professional: [
            {
                id: 'p1',
                title: 'CRM-бот для продаж',
                description: 'Управление воронкой продаж',
                price: '35 000 ₽',
                term: '2 недели',
                videoUrl: 'https://example.com/video/p1',
                features: ['Воронка продаж', 'Этапы сделки', 'Аналитика и отчёты']
            },
            {
                id: 'p2',
                title: 'Бот с интеграцией',
                description: 'Подключение к вашему API',
                price: '28 000 ₽',
                term: '10 дней',
                videoUrl: 'https://example.com/video/p2',
                features: ['API интеграция', 'Синхронизация данных', 'Ошибка в логи']
            },
            {
                id: 'p3',
                title: 'Платёжный бот',
                description: 'Приём оплаты через Telegram',
                price: '45 000 ₽',
                term: '2 недели',
                videoUrl: 'https://example.com/video/p3',
                features: ['Триггерные платежи', 'Абонентская плата', 'Возвраты']
            }
        ],
        enterprise: [
            {
                id: 'e1',
                title: 'Корпоративная система',
                description: 'Внутренний коммуникационный хаб',
                price: '150 000 ₽',
                term: '1 месяц',
                videoUrl: 'https://example.com/video/e1',
                features: ['Ролевая модель', 'Документооборот', 'Аудит действий']
            },
            {
                id: 'e2',
                title: 'Мульти-channel агрегатор',
                description: 'Управление всеми каналами',
                price: '200 000 ₽',
                term: '1.5 месяца',
                videoUrl: 'https://example.com/video/e2',
                features: ['Единая панель', 'Рассылки', 'Аналитика по каналам']
            }
        ],
        custom: [
            {
                id: 'c1',
                title: 'Геймификация',
                description: 'Игровая механика в боте',
                price: 'от 100 000 ₽',
                term: '2 недели',
                videoUrl: 'https://example.com/video/c1',
                features: ['Очки и уровни', 'Таблицы лидеров', 'События и задания']
            },
            {
                id: 'c2',
                title: 'AI ассистент',
                description: 'Интеграция с LLM для уникальных решений',
                price: 'от 200 000 ₽',
                term: '3 недели',
                videoUrl: 'https://example.com/video/c2',
                features: ['Нейросеть в диалоге', 'Генерация контента', 'Адаптивность']
            }
        ]
    };

    // Get category data
    function getCategoryData(category) {
        return mockData[category] || [];
    }

    // Create card element using DOM API (no innerHTML)
    function createCardItem(item) {
        var card = document.createElement('div');
        card.className = 'portfolio-card liquid-border';
        card.setAttribute('data-id', item.id);
        card.setAttribute('data-category', item.category);

        // Header
        var header = document.createElement('div');
        header.className = 'card-header';

        var title = document.createElement('h3');
        title.className = 'card-title';
        title.textContent = item.title;

        var tag = document.createElement('span');
        tag.className = 'card-tag';
        tag.textContent = item.category;

        header.appendChild(title);
        header.appendChild(tag);

        // Description
        var description = document.createElement('p');
        description.className = 'card-description';
        description.textContent = item.description;

        // Meta
        var meta = document.createElement('div');
        meta.className = 'card-meta';

        // Price
        var priceItem = document.createElement('div');
        priceItem.className = 'meta-item';

        var priceLabel = document.createElement('span');
        priceLabel.className = 'meta-label';
        priceLabel.textContent = 'Цена';

        var priceValue = document.createElement('span');
        priceValue.className = 'meta-value';
        priceValue.textContent = item.price;

        priceItem.appendChild(priceLabel);
        priceItem.appendChild(priceValue);

        // Term
        var termItem = document.createElement('div');
        termItem.className = 'meta-item';

        var termLabel = document.createElement('span');
        termLabel.className = 'meta-label';
        termLabel.textContent = 'Срок';

        var termValue = document.createElement('span');
        termValue.className = 'meta-value';
        termValue.textContent = item.term;

        termItem.appendChild(termLabel);
        termItem.appendChild(termValue);

        meta.appendChild(priceItem);
        meta.appendChild(termItem);

        card.appendChild(header);
        card.appendChild(description);
        card.appendChild(meta);

        return card;
    }

    // Render cards for a category using DOM API
    function renderCards(category) {
        var contentArea = document.getElementById('content-area');
        if (!contentArea) return;

        var data = getCategoryData(category);

        if (!data || data.length === 0) {
            contentArea.textContent = '';
            var emptyState = document.createElement('div');
            emptyState.className = 'no-data';
            emptyState.textContent = 'Нет данных для выбранной категории';
            contentArea.appendChild(emptyState);
            return;
        }

        // Clear and create grid container
        contentArea.textContent = '';
        var grid = document.createElement('div');
        grid.className = 'portfolio-grid';

        // Add items
        data.forEach(function(item) {
            var card = createCardItem({
                id: item.id,
                title: item.title,
                description: item.description,
                price: item.price,
                term: item.term,
                category: category
            });
            grid.appendChild(card);
        });

        contentArea.appendChild(grid);

        // Add click handlers to cards
        document.querySelectorAll('.portfolio-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var id = card.getAttribute('data-id');
                var cat = card.getAttribute('data-category');
                openCardModal(id, cat);
            });
        });
    }

    // Create modal video placeholder using DOM API
    function createVideoPlaceholder() {
        var placeholder = document.createElement('div');
        placeholder.className = 'video-placeholder';

        var icon = document.createElement('div');
        icon.className = 'video-icon';

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50');
        circle.setAttribute('cy', '50');
        circle.setAttribute('r', '45');
        circle.setAttribute('stroke', 'currentColor');
        circle.setAttribute('stroke-width', '2');
        circle.setAttribute('fill', 'none');

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 40 35 L 65 50 L 40 65 Z');
        path.setAttribute('fill', 'currentColor');

        svg.appendChild(circle);
        svg.appendChild(path);
        icon.appendChild(svg);

        var label = document.createElement('span');
        label.className = 'video-label';
        label.textContent = 'Демонстрация работы';

        placeholder.appendChild(icon);
        placeholder.appendChild(label);

        return placeholder;
    }

    // Create modal info section using DOM API
    function createModalInfo(data) {
        var info = document.createElement('div');
        info.className = 'modal-info';

        // Title
        var title = document.createElement('h2');
        title.className = 'modal-title';
        title.textContent = data.title;

        // Meta
        var meta = document.createElement('div');
        meta.className = 'info-meta';

        // Price
        var priceItem = document.createElement('div');
        priceItem.className = 'info-item';

        var priceLabel = document.createElement('span');
        priceLabel.className = 'info-label';
        priceLabel.textContent = 'Цена';

        var priceValue = document.createElement('span');
        priceValue.className = 'info-value';
        priceValue.textContent = data.price;

        priceItem.appendChild(priceLabel);
        priceItem.appendChild(priceValue);

        // Term
        var termItem = document.createElement('div');
        termItem.className = 'info-item';

        var termLabel = document.createElement('span');
        termLabel.className = 'info-label';
        termLabel.textContent = 'Срок выполнения';

        var termValue = document.createElement('span');
        termValue.className = 'info-value';
        termValue.textContent = data.term;

        termItem.appendChild(termLabel);
        termItem.appendChild(termValue);

        meta.appendChild(priceItem);
        meta.appendChild(termItem);

        // Features
        var features = document.createElement('div');
        features.className = 'info-features';

        var featuresTitle = document.createElement('h4');
        featuresTitle.textContent = 'Возможности';

        var featuresList = document.createElement('ul');
        data.features.forEach(function(feature) {
            var li = document.createElement('li');
            li.textContent = feature;
            featuresList.appendChild(li);
        });

        features.appendChild(featuresTitle);
        features.appendChild(featuresList);

        // Description
        var desc = document.createElement('div');
        desc.className = 'info-description';

        var descTitle = document.createElement('h4');
        descTitle.textContent = 'Описание';

        var descText = document.createElement('p');
        descText.textContent = data.description;

        desc.appendChild(descTitle);
        desc.appendChild(descText);

        info.appendChild(title);
        info.appendChild(meta);
        info.appendChild(features);
        info.appendChild(desc);

        return info;
    }

    // Open modal with card details using DOM API
    function openCardModal(id, category) {
        var data = getCategoryData(category).find(function(item) {
            return item.id === id;
        });

        if (!data) return;

        // Create modal container
        var modal = document.createElement('div');
        modal.className = 'portfolio-modal';
        modal.style.display = 'block';
        modal.style.opacity = '1';

        // Modal content
        var content = document.createElement('div');
        content.className = 'modal-content';

        // Close button
        var closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '×';

        // Layout
        var layout = document.createElement('div');
        layout.className = 'modal-layout';

        // Video section
        var videoSection = document.createElement('div');
        videoSection.className = 'modal-video';

        var placeholder = createVideoPlaceholder();
        videoSection.appendChild(placeholder);

        // Video player (with src attribute if available)
        var videoPlayer = document.createElement('video');
        videoPlayer.setAttribute('controls', '');
        videoPlayer.className = 'video-player';

        if (data.videoUrl) {
            videoPlayer.setAttribute('src', data.videoUrl);
        }

        // Only append if there's a URL (otherwise just show placeholder)
        if (data.videoUrl) {
            videoSection.appendChild(videoPlayer);
        }

        // Info section
        var infoSection = createModalInfo(data);

        layout.appendChild(videoSection);
        layout.appendChild(infoSection);

        content.appendChild(closeBtn);
        content.appendChild(layout);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close handlers
        function closeModal() {
            modal.style.opacity = '0';
            setTimeout(function() {
                modal.remove();
            }, 300);
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });
    }

    // Initialize
    function init() {
        // Plan menu click handlers
        var planItems = document.querySelectorAll('.plan-item');
        planItems.forEach(function(item) {
            item.addEventListener('click', function() {
                // Update active class
                planItems.forEach(function(i) { i.classList.remove('active'); });
                item.classList.add('active');

                // Render cards for selected plan
                var plan = item.getAttribute('data-plan');
                renderCards(plan);
            });
        });

        // Initial render for basic plan
        renderCards('basic');
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
