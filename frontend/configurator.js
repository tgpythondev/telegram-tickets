// Configuration state
let config = {
    package: null,
    packagePriceMin: 0,
    packagePriceMax: 0,
    shortDescription: '',
    detailedDescription: '',
    language: null,
    hosting: {
        type: null,
        extraStorage: 0,
        extraBandwidth: 0
    },
    priority: 'normal',
    priorityCost: 0,
    totalPrice: 0
};

let currentStep = 1;
const totalSteps = 7;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    updatePrice();
});

// Initialize event listeners
function initializeEventListeners() {
    // Package selection
    document.querySelectorAll('.package-card').forEach(card => {
        card.addEventListener('click', () => selectPackage(card));
    });

    // Language selection
    document.querySelectorAll('.language-card').forEach(card => {
        card.addEventListener('click', () => selectLanguage(card));
    });

    // Hosting selection
    document.querySelectorAll('.hosting-card').forEach(card => {
        card.addEventListener('click', () => selectHosting(card));
    });

    // Priority selection
    document.querySelectorAll('.priority-card').forEach(card => {
        card.addEventListener('click', () => selectPriority(card));
    });

    // Description fields
    const shortDesc = document.getElementById('short-description');
    const detailedDesc = document.getElementById('detailed-description');

    shortDesc.addEventListener('input', (e) => {
        config.shortDescription = e.target.value;
        document.getElementById('short-counter').textContent = e.target.value.length;
    });

    detailedDesc.addEventListener('input', (e) => {
        config.detailedDescription = e.target.value;
        document.getElementById('detailed-counter').textContent = e.target.value.length;
    });

    // Extra resources
    document.getElementById('extra-storage').addEventListener('input', (e) => {
        config.hosting.extraStorage = parseInt(e.target.value) || 0;
        updatePrice();
    });

    document.getElementById('extra-bandwidth').addEventListener('input', (e) => {
        config.hosting.extraBandwidth = parseInt(e.target.value) || 0;
        updatePrice();
    });

    // Navigation buttons
    document.getElementById('btn-back').addEventListener('click', () => previousStep());
    document.getElementById('btn-next').addEventListener('click', () => nextStep());
    document.getElementById('btn-submit').addEventListener('click', () => submitOrder());
}

// Package selection
function selectPackage(card) {
    document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    config.package = card.dataset.package;
    config.packagePriceMin = parseInt(card.dataset.priceMin);
    config.packagePriceMax = parseInt(card.dataset.priceMax);

    updatePrice();
}

// Language selection
function selectLanguage(card) {
    document.querySelectorAll('.language-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    config.language = card.dataset.language;
}

// Hosting selection
function selectHosting(card) {
    document.querySelectorAll('.hosting-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    config.hosting.type = card.dataset.hosting;

    // Show extra resources only for paid hosting
    const extraResources = document.getElementById('extra-resources');
    if (config.hosting.type === 'paid') {
        extraResources.style.display = 'block';
    } else {
        extraResources.style.display = 'none';
        config.hosting.extraStorage = 0;
        config.hosting.extraBandwidth = 0;
        document.getElementById('extra-storage').value = 0;
        document.getElementById('extra-bandwidth').value = 0;
    }

    updatePrice();
}

// Priority selection
function selectPriority(card) {
    document.querySelectorAll('.priority-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    config.priority = card.dataset.priority;
    config.priorityCost = parseInt(card.dataset.cost);

    updatePrice();
}

// Calculate total price
function calculatePrice() {
    let basePrice = config.packagePriceMin;

    // Hosting costs
    if (config.hosting.type === 'paid') {
        // For Standard package, paid hosting increases base price
        if (config.package === 'Standard') {
            basePrice = 30;
        }
        // Extra resources
        basePrice += config.hosting.extraStorage * 3;
        basePrice += config.hosting.extraBandwidth * 1;
    }

    // Priority cost
    basePrice += config.priorityCost;

    return basePrice;
}

// Update price display
function updatePrice() {
    const price = calculatePrice();
    config.totalPrice = price;

    const priceValue = document.getElementById('price-value');

    if (config.package === 'Custom') {
        priceValue.textContent = `от $${price}`;
    } else {
        priceValue.textContent = `$${price}`;
    }
}

// Validate current step
function validateStep(step) {
    switch(step) {
        case 1:
            if (!config.package) {
                alert('Пожалуйста, выберите пакет');
                return false;
            }
            return true;

        case 2:
            if (!config.shortDescription.trim()) {
                alert('Пожалуйста, введите краткое описание');
                return false;
            }
            if (config.shortDescription.length < 10) {
                alert('Краткое описание должно содержать минимум 10 символов');
                return false;
            }
            return true;

        case 3:
            if (!config.detailedDescription.trim()) {
                alert('Пожалуйста, введите подробное описание');
                return false;
            }
            if (config.detailedDescription.length < 50) {
                alert('Подробное описание должно содержать минимум 50 символов');
                return false;
            }
            return true;

        case 4:
            if (!config.language) {
                alert('Пожалуйста, выберите язык программирования');
                return false;
            }
            return true;

        case 5:
            if (!config.hosting.type) {
                alert('Пожалуйста, выберите вариант хостинга');
                return false;
            }
            return true;

        case 6:
            // Priority has default value
            return true;

        default:
            return true;
    }
}

// Next step
function nextStep() {
    if (!validateStep(currentStep)) {
        return;
    }

    if (currentStep < totalSteps) {
        currentStep++;
        showStep(currentStep);
    }
}

// Previous step
function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
    }
}

// Show specific step
function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));

    // Show current step
    document.getElementById(`step-${step}`).classList.add('active');

    // Update progress
    updateProgress(step);

    // Update buttons
    updateButtons(step);

    // Update summary if on last step
    if (step === 7) {
        updateSummary();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Update progress indicator
function updateProgress(step) {
    // Update step indicators
    document.querySelectorAll('.progress-step').forEach((el, index) => {
        const stepNum = index + 1;
        el.classList.remove('active', 'completed');

        if (stepNum === step) {
            el.classList.add('active');
        } else if (stepNum < step) {
            el.classList.add('completed');
        }
    });

    // Update progress line
    const progressLine = document.getElementById('progress-line');
    const percentage = ((step - 1) / (totalSteps - 1)) * 100;
    progressLine.style.width = `${percentage}%`;

    // Update progress text
    const stepNames = [
        'Выбор пакета',
        'Краткое описание',
        'Подробное описание',
        'Язык программирования',
        'Хостинг',
        'Приоритет',
        'Подтверждение'
    ];

    document.getElementById('progress-text').textContent = `Шаг ${step} из ${totalSteps}: ${stepNames[step - 1]}`;
}

// Update navigation buttons
function updateButtons(step) {
    const btnBack = document.getElementById('btn-back');
    const btnNext = document.getElementById('btn-next');
    const btnSubmit = document.getElementById('btn-submit');

    // Back button
    if (step === 1) {
        btnBack.style.display = 'none';
    } else {
        btnBack.style.display = 'inline-block';
    }

    // Next/Submit buttons
    if (step === totalSteps) {
        btnNext.style.display = 'none';
        btnSubmit.style.display = 'inline-block';
    } else {
        btnNext.style.display = 'inline-block';
        btnSubmit.style.display = 'none';
    }
}

// Update summary
function updateSummary() {
    document.getElementById('summary-package').textContent = config.package;
    document.getElementById('summary-short').textContent = config.shortDescription.substring(0, 50) + (config.shortDescription.length > 50 ? '...' : '');
    document.getElementById('summary-language').textContent = config.language;

    // Hosting
    let hostingText = '';
    if (config.hosting.type === 'free') {
        hostingText = 'Бесплатный (входит в пакет)';
    } else if (config.hosting.type === 'paid') {
        hostingText = 'Платный ($5/мес)';
        if (config.hosting.extraStorage > 0) {
            hostingText += ` + ${config.hosting.extraStorage} ГБ места`;
        }
        if (config.hosting.extraBandwidth > 0) {
            hostingText += ` + ${config.hosting.extraBandwidth} ГБ трафика`;
        }
    } else {
        hostingText = 'Без хостинга';
    }
    document.getElementById('summary-hosting').textContent = hostingText;

    // Priority
    const priorityNames = {
        'normal': 'Нормальный',
        'high': 'Высокий (+$10)',
        'urgent': 'Срочный (+$30)'
    };
    document.getElementById('summary-priority').textContent = priorityNames[config.priority];

    // Total price
    document.getElementById('summary-total').textContent = config.package === 'Custom'
        ? `от $${config.totalPrice}`
        : `$${config.totalPrice}`;
}

// Submit order
async function submitOrder() {
    try {
        // Check authentication
        const user = await checkAuth();
        if (!user) {
            // Не сохраняем конфигурацию в sessionStorage (XSS уязвимость)
            // Вместо этого просто перенаправляем на авторизацию
            alert('Пожалуйста, войдите в систему для оформления заказа');
            window.location.href = '/auth.html?redirect=configurator';
            return;
        }

        // Show loading
        document.getElementById('loading-overlay').classList.add('active');

        // Prepare ticket data
        const subject = `Заказ бота: ${config.package}`;
        const initialMessage = 'Automatically generated from configurator'; // Will be replaced by backend

        // Create ticket with order config
        await API.createTicket(subject, initialMessage, config.priority, config);

        // Redirect to tickets page
        window.location.href = 'tickets.html';

    } catch (error) {
        console.error('Submit order error:', error);
        document.getElementById('loading-overlay').classList.remove('active');
        alert('Ошибка при создании заказа: ' + error.message);
    }
}

// Check if there's a pending order from sessionStorage
window.addEventListener('load', () => {
    const pendingOrder = sessionStorage.getItem('pendingOrder');
    if (pendingOrder) {
        config = JSON.parse(pendingOrder);
        sessionStorage.removeItem('pendingOrder');

        // Restore UI state
        restoreConfigState();

        // Go to last step (confirmation)
        currentStep = 7;
        showStep(currentStep);

        alert('Теперь вы можете подтвердить ваш заказ');
    }
});

// Restore config state to UI
function restoreConfigState() {
    // Select package
    if (config.package) {
        const packageCard = document.querySelector(`.package-card[data-package="${config.package}"]`);
        if (packageCard) selectPackage(packageCard);
    }

    // Set descriptions
    if (config.shortDescription) {
        document.getElementById('short-description').value = config.shortDescription;
        document.getElementById('short-counter').textContent = config.shortDescription.length;
    }

    if (config.detailedDescription) {
        document.getElementById('detailed-description').value = config.detailedDescription;
        document.getElementById('detailed-counter').textContent = config.detailedDescription.length;
    }

    // Select language
    if (config.language) {
        const languageCard = document.querySelector(`.language-card[data-language="${config.language}"]`);
        if (languageCard) selectLanguage(languageCard);
    }

    // Select hosting
    if (config.hosting.type) {
        const hostingCard = document.querySelector(`.hosting-card[data-hosting="${config.hosting.type}"]`);
        if (hostingCard) selectHosting(hostingCard);

        if (config.hosting.extraStorage > 0) {
            document.getElementById('extra-storage').value = config.hosting.extraStorage;
        }
        if (config.hosting.extraBandwidth > 0) {
            document.getElementById('extra-bandwidth').value = config.hosting.extraBandwidth;
        }
    }

    // Select priority
    if (config.priority) {
        const priorityCard = document.querySelector(`.priority-card[data-priority="${config.priority}"]`);
        if (priorityCard) selectPriority(priorityCard);
    }

    updatePrice();
}
