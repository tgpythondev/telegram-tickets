// Configuration state
let config = {
    package: null,
    packagePriceMin: 0,
    packagePriceMax: 0,
    shortDescription: '',
    detailedDescription: '',
    language: null,
    hosting: { type: null, extraStorage: 0, extraBandwidth: 0 },
    priority: 'normal',
    priorityCost: 0,
    totalPrice: 0
};

let currentStep = 1;
const totalSteps = 6;

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupOptionRows();
    setupTextareas();
    setupExtraResources();
    setupNavigation();
    updateProgress();
    updateLiveSummary();

    // Sync both submit buttons
    document.getElementById('cfs-order-btn').addEventListener('click', submitOrder);
});

// ── Option rows (packages, languages, hosting, priority) ──
function setupOptionRows() {
    // Package
    document.querySelectorAll('#package-list .cfg-option-row').forEach(row => {
        row.addEventListener('click', () => {
            selectRow('#package-list', row);
            config.package = row.dataset.package;
            config.packagePriceMin = parseInt(row.dataset.priceMin);
            config.packagePriceMax = parseInt(row.dataset.priceMax);
            updatePrice();
        });
    });

    // Language
    document.querySelectorAll('#language-list .cfg-option-row').forEach(row => {
        row.addEventListener('click', () => {
            selectRow('#language-list', row);
            config.language = row.dataset.language;
            updateLiveSummary();
        });
    });

    // Hosting
    document.querySelectorAll('#hosting-list .cfg-option-row').forEach(row => {
        row.addEventListener('click', () => {
            selectRow('#hosting-list', row);
            config.hosting.type = row.dataset.hosting;
            const extras = document.getElementById('extra-resources');
            if (config.hosting.type === 'paid') {
                extras.style.display = 'flex';
            } else {
                extras.style.display = 'none';
                config.hosting.extraStorage = 0;
                config.hosting.extraBandwidth = 0;
                document.getElementById('extra-storage').value = 0;
                document.getElementById('extra-bandwidth').value = 0;
            }
            updatePrice();
        });
    });

    // Priority — pre-select Normal
    const normalRow = document.querySelector('#priority-list .cfg-option-row[data-priority="normal"]');
    if (normalRow) {
        selectRow('#priority-list', normalRow);
    }

    document.querySelectorAll('#priority-list .cfg-option-row').forEach(row => {
        row.addEventListener('click', () => {
            selectRow('#priority-list', row);
            config.priority = row.dataset.priority;
            config.priorityCost = parseInt(row.dataset.cost) || 0;
            updatePrice();
        });
    });
}

function selectRow(listSelector, selectedRow) {
    document.querySelectorAll(`${listSelector} .cfg-option-row`).forEach(r => r.classList.remove('selected'));
    selectedRow.classList.add('selected');
}

// ── Textareas ──────────────────────────────
function setupTextareas() {
    const shortInput = document.getElementById('short-description');
    const detailInput = document.getElementById('detailed-description');

    shortInput.addEventListener('input', e => {
        config.shortDescription = e.target.value;
        document.getElementById('short-counter').textContent = e.target.value.length;
    });

    detailInput.addEventListener('input', e => {
        config.detailedDescription = e.target.value;
        document.getElementById('detailed-counter').textContent = e.target.value.length;
    });
}

// ── Extra resources ────────────────────────
function setupExtraResources() {
    document.getElementById('extra-storage').addEventListener('input', e => {
        config.hosting.extraStorage = parseInt(e.target.value) || 0;
        updatePrice();
    });
    document.getElementById('extra-bandwidth').addEventListener('input', e => {
        config.hosting.extraBandwidth = parseInt(e.target.value) || 0;
        updatePrice();
    });
}

// ── Navigation ─────────────────────────────
function setupNavigation() {
    document.getElementById('btn-next').addEventListener('click', () => {
        if (!validateStep(currentStep)) return;
        if (currentStep < totalSteps) {
            currentStep++;
            showStep(currentStep);
        }
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    });

    document.getElementById('btn-submit').addEventListener('click', submitOrder);
}

function showStep(n) {
    document.querySelectorAll('.cfg-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');

    updateProgress();
    updateNavButtons(n);
    if (n === totalSteps) buildSummaryStep();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
    const pct = ((currentStep - 1) / (totalSteps - 1)) * 100;
    document.getElementById('cfg-progress-fill').style.width = pct + '%';
    document.getElementById('cfg-progress-text').textContent = `Шаг ${currentStep} / ${totalSteps}`;
    document.getElementById('nav-step-label').textContent = `${currentStep} / ${totalSteps}`;
}

function updateNavButtons(n) {
    const backBtn   = document.getElementById('btn-back');
    const nextBtn   = document.getElementById('btn-next');
    const submitBtn = document.getElementById('btn-submit');
    const cfsSend   = document.getElementById('cfs-order-btn');

    backBtn.style.display   = n === 1 ? 'none' : 'inline-flex';
    nextBtn.style.display   = n === totalSteps ? 'none' : 'inline-flex';
    submitBtn.style.display = n === totalSteps ? 'inline-flex' : 'none';

    cfsSend.disabled = n !== totalSteps;
}

// ── Validate ───────────────────────────────
function validateStep(n) {
    switch (n) {
        case 1:
            if (!config.package) { showError('Выберите пакет'); return false; }
            return true;
        case 2:
            if (!config.shortDescription.trim()) { showError('Введите краткое описание'); return false; }
            if (config.shortDescription.length < 5) { showError('Минимум 5 символов'); return false; }
            return true;
        case 3:
            if (!config.language) { showError('Выберите язык программирования'); return false; }
            return true;
        case 4:
            if (!config.hosting.type) { showError('Выберите вариант хостинга'); return false; }
            return true;
        default:
            return true;
    }
}

// ── Price ──────────────────────────────────
function calculatePrice() {
    let base = config.packagePriceMin;
    if (config.hosting.type === 'paid') {
        if (config.package === 'Standard') base = 30;
        base += config.hosting.extraStorage * 3;
        base += config.hosting.extraBandwidth * 1;
    }
    base += config.priorityCost;
    return base;
}

function updatePrice() {
    const price = calculatePrice();
    config.totalPrice = price;
    const str = config.package === 'Custom' ? `от $${price}` : `$${price}`;
    setLive('live-price', str);
    const el = document.getElementById('live-price');
    if (el) el.textContent = str;
    updateLiveSummary();
}

function updateLiveSummary() {
    setLive('live-package',  config.package   || '—',  !!config.package);
    setLive('live-language', config.language  || '—',  !!config.language);

    let hostingStr = '—';
    if (config.hosting.type === 'free')  hostingStr = 'Бесплатный';
    else if (config.hosting.type === 'paid')  hostingStr = 'Платный ($5/мес)';
    else if (config.hosting.type === 'none')  hostingStr = 'Свой сервер';
    setLive('live-hosting', hostingStr, !!config.hosting.type);

    const prNames = { normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' };
    setLive('live-priority', prNames[config.priority] || '—', true);

    const price = calculatePrice();
    const priceStr = config.package === 'Custom' ? `от $${price}` : `$${price}`;

    const livePriceEl = document.getElementById('cfs-price') || document.getElementById('live-price');
    // The summary panel's price element
    const cfsPriceEl = document.querySelector('.cfs-price');
    if (cfsPriceEl) cfsPriceEl.textContent = priceStr;
}

function setLive(id, val, filled) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (filled !== undefined) {
        el.classList.toggle('filled', filled);
    }
}

// ── Build final summary ────────────────────
function buildSummaryStep() {
    document.getElementById('sum-package').textContent  = config.package || '—';
    document.getElementById('sum-short').textContent    = config.shortDescription
        ? config.shortDescription.slice(0, 80) + (config.shortDescription.length > 80 ? '…' : '')
        : '—';
    document.getElementById('sum-language').textContent = config.language || '—';

    let hostingStr = '—';
    if (config.hosting.type === 'free') hostingStr = 'Бесплатный';
    else if (config.hosting.type === 'paid') {
        hostingStr = 'Платный ($5/мес)';
        if (config.hosting.extraStorage > 0) hostingStr += ` +${config.hosting.extraStorage} ГБ`;
        if (config.hosting.extraBandwidth > 0) hostingStr += ` +${config.hosting.extraBandwidth} ГБ трафика`;
    } else if (config.hosting.type === 'none') {
        hostingStr = 'Свой сервер';
    }
    document.getElementById('sum-hosting').textContent = hostingStr;

    const prNames = { normal: 'Обычный', high: 'Высокий (+$10)', urgent: 'Срочный (+$30)' };
    document.getElementById('sum-priority').textContent = prNames[config.priority] || '—';

    const price = calculatePrice();
    document.getElementById('sum-total').textContent = config.package === 'Custom' ? `от $${price}` : `$${price}`;

    // Detailed description spoiler
    const details = document.getElementById('desc-details');
    const detailContent = document.getElementById('sum-detailed');
    if (config.detailedDescription.trim()) {
        details.style.display = '';
        detailContent.textContent = config.detailedDescription;
    } else {
        details.style.display = 'none';
    }
}

// ── Submit order ───────────────────────────
async function submitOrder() {
    try {
        const user = await checkAuth();
        if (!user) {
            showError('Войдите в систему для оформления заказа');
            setTimeout(() => { window.location.href = '/auth.html'; }, 1500);
            return;
        }

        document.getElementById('loading-overlay').classList.add('active');

        const subject = `Заказ бота: ${config.package}`;
        const initialMessage = 'Заказ создан через конфигуратор';

        await API.createTicket(subject, initialMessage, config.priority, config);
        window.location.href = 'tickets.html';
    } catch (err) {
        console.error('Submit order error:', err);
        document.getElementById('loading-overlay').classList.remove('active');
        showError('Ошибка создания заказа: ' + err.message);
    }
}

// Restore from pending order in sessionStorage
window.addEventListener('load', () => {
    const pending = sessionStorage.getItem('pendingOrder');
    if (pending) {
        try {
            config = JSON.parse(pending);
            sessionStorage.removeItem('pendingOrder');
            restoreConfigState();
            currentStep = totalSteps;
            showStep(currentStep);
        } catch (_) {}
    }
});

function restoreConfigState() {
    if (config.package) {
        const row = document.querySelector(`#package-list .cfg-option-row[data-package="${config.package}"]`);
        if (row) { selectRow('#package-list', row); updatePrice(); }
    }
    if (config.shortDescription) {
        const el = document.getElementById('short-description');
        el.value = config.shortDescription;
        document.getElementById('short-counter').textContent = config.shortDescription.length;
    }
    if (config.detailedDescription) {
        const el = document.getElementById('detailed-description');
        el.value = config.detailedDescription;
        document.getElementById('detailed-counter').textContent = config.detailedDescription.length;
    }
    if (config.language) {
        const row = document.querySelector(`#language-list .cfg-option-row[data-language="${config.language}"]`);
        if (row) selectRow('#language-list', row);
    }
    if (config.hosting.type) {
        const row = document.querySelector(`#hosting-list .cfg-option-row[data-hosting="${config.hosting.type}"]`);
        if (row) selectRow('#hosting-list', row);
        if (config.hosting.type === 'paid') {
            document.getElementById('extra-resources').style.display = 'flex';
            document.getElementById('extra-storage').value = config.hosting.extraStorage;
            document.getElementById('extra-bandwidth').value = config.hosting.extraBandwidth;
        }
    }
    if (config.priority) {
        const row = document.querySelector(`#priority-list .cfg-option-row[data-priority="${config.priority}"]`);
        if (row) selectRow('#priority-list', row);
    }
    updatePrice();
}
