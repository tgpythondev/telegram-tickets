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
    totalPrice: 0,
    // Promo
    promoCode: null,
    chosenBenefit: null,   // 'free_mini' | 'percent_10' | null
    promoOptions: null,    // array returned by server after validation
    promoDiscountPct: 10   // default, overridden by server response
};

let currentStep = 0;     // starts at promo step
const totalSteps = 7;    // 0…6 (step 0 = promo, steps 1-6 = original)

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupPromoStep();
    setupOptionRows();
    setupTextareas();
    setupExtraResources();
    setupNavigation();
    updateProgress();
    updateLiveSummary();

    // Sync both submit buttons
    document.getElementById('cfs-order-btn').addEventListener('click', submitOrder);
});

// ── Promo step (step 0) ────────────────────
function setupPromoStep() {
    const applyBtn  = document.getElementById('promo-apply-btn');
    const skipBtn   = document.getElementById('promo-skip-btn');
    const codeInput = document.getElementById('promo-code-input');

    applyBtn.addEventListener('click', applyPromoCode);
    skipBtn.addEventListener('click', () => {
        clearPromo();
        advanceFromPromoStep();
    });

    codeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') applyPromoCode();
    });
}

async function applyPromoCode() {
    const input   = document.getElementById('promo-code-input');
    const applyBtn = document.getElementById('promo-apply-btn');
    const code    = input.value.trim();

    if (!code) {
        showPromoStatus('error', typeof t === 'function' ? t('cfg_promo_err_empty') : 'Wprowadź kod');
        return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = typeof t === 'function' ? t('cfg_promo_checking') : '…';

    try {
        const result = await API.validatePromo(code);

        if (!result || !result.valid) {
            const reasonKey = {
                promo_not_found:    'cfg_promo_err_not_found',
                promo_inactive:     'cfg_promo_err_inactive',
                promo_limit_reached:'cfg_promo_err_limit',
                promo_already_used: 'cfg_promo_err_used',
                too_many_requests:  'cfg_promo_err_rate'
            }[result?.reason] || 'cfg_promo_err_invalid';

            showPromoStatus('error', typeof t === 'function' ? t(reasonKey) : result?.reason || 'Nieprawidłowy kod');
            hideBenefits();
            return;
        }

        // Valid code — store and show benefit options
        config.promoCode    = result.code;
        config.promoOptions = result.options;

        // Get discount percent from server response
        const pctOption = result.options.find(o => o.type === 'percent_10');
        if (pctOption) config.promoDiscountPct = pctOption.discountPercent || 10;

        showPromoStatus('ok', (typeof t === 'function' ? t('cfg_promo_valid') : '✅ Kod aktywny:') + ' ' + result.code);
        showBenefits(result.options);

    } catch (err) {
        showPromoStatus('error', typeof t === 'function' ? t('cfg_promo_err_server') : 'Błąd serwera');
        hideBenefits();
    } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = typeof t === 'function' ? t('cfg_promo_apply') : 'Zastosuj';
    }
}

function showBenefits(options) {
    const benefitsEl   = document.getElementById('promo-benefits');
    const freeMiniRow  = document.getElementById('benefit-free-mini');
    const pct10Row     = document.getElementById('benefit-percent-10');

    // Show or hide free_mini option depending on server response
    const hasFreeMini = options.some(o => o.type === 'free_mini');
    freeMiniRow.style.display = hasFreeMini ? '' : 'none';

    // Reset selection
    [freeMiniRow, pct10Row].forEach(r => r.classList.remove('selected'));
    config.chosenBenefit = null;

    // Attach click handlers (once — remove old ones by cloning)
    const newFreeMini = freeMiniRow.cloneNode(true);
    const newPct10    = pct10Row.cloneNode(true);
    freeMiniRow.parentNode.replaceChild(newFreeMini, freeMiniRow);
    pct10Row.parentNode.replaceChild(newPct10, pct10Row);

    newFreeMini.addEventListener('click', () => selectBenefit('free_mini'));
    newPct10.addEventListener('click',    () => selectBenefit('percent_10'));

    benefitsEl.style.display = '';
}

function hideBenefits() {
    document.getElementById('promo-benefits').style.display = 'none';
    config.chosenBenefit = null;
}

function selectBenefit(benefit) {
    config.chosenBenefit = benefit;

    const freeMiniRow = document.getElementById('benefit-free-mini');
    const pct10Row    = document.getElementById('benefit-percent-10');
    [freeMiniRow, pct10Row].forEach(r => r && r.classList.remove('selected'));

    const selected = document.querySelector(`#benefit-list [data-benefit="${benefit}"]`);
    if (selected) selected.classList.add('selected');

    // If free_mini selected, auto-lock hosting to 'none' when user reaches that step
    if (benefit === 'free_mini') {
        config.package = 'Mini';
        config.packagePriceMin = 3;
        config.packagePriceMax = 5;
        // Pre-select Mini in package list (it may not be visible yet)
        const miniRow = document.querySelector('#package-list .cfg-option-row[data-package="Mini"]');
        if (miniRow) selectRow('#package-list', miniRow);
    }

    updatePrice();
    advanceFromPromoStep();
}

function showPromoStatus(type, message) {
    const el = document.getElementById('promo-status');
    el.style.display = '';
    el.className = `cfg-promo-status cfg-promo-status--${type}`;
    el.textContent = message;
}

function clearPromo() {
    config.promoCode     = null;
    config.chosenBenefit = null;
    config.promoOptions  = null;
    document.getElementById('promo-code-input').value = '';
    document.getElementById('promo-status').style.display = 'none';
    hideBenefits();
    updatePrice();
}

function advanceFromPromoStep() {
    currentStep = 1;
    showStep(1);
}

// ── Option rows (packages, languages, hosting, priority) ──
function setupOptionRows() {
    // Package
    document.querySelectorAll('#package-list .cfg-option-row').forEach(row => {
        row.addEventListener('click', () => {
            selectRow('#package-list', row);
            config.package = row.dataset.package;
            config.packagePriceMin = parseInt(row.dataset.priceMin);
            config.packagePriceMax = parseInt(row.dataset.priceMax);

            // If promo was free_mini but user changed package away from Mini —
            // drop the free_mini benefit, keep percent_10 if available
            if (config.chosenBenefit === 'free_mini' && config.package !== 'Mini') {
                config.chosenBenefit = 'percent_10';
                // Re-highlight percent_10 in benefit list
                const freeMiniRow = document.getElementById('benefit-free-mini');
                const pct10Row    = document.getElementById('benefit-percent-10');
                if (freeMiniRow) freeMiniRow.classList.remove('selected');
                if (pct10Row)    pct10Row.classList.add('selected');
            }

            // free_mini only valid for Mini — lock hosting to 'none'
            if (config.chosenBenefit === 'free_mini') {
                lockHostingToNone();
            } else {
                unlockHosting();
            }

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
            if (row.classList.contains('cfg-option-disabled')) return;
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

function lockHostingToNone() {
    document.querySelectorAll('#hosting-list .cfg-option-row').forEach(row => {
        if (row.dataset.hosting !== 'none') {
            row.classList.add('cfg-option-disabled');
        }
    });
    // Auto-select 'none'
    const noneRow = document.querySelector('#hosting-list .cfg-option-row[data-hosting="none"]');
    if (noneRow && !noneRow.classList.contains('selected')) {
        selectRow('#hosting-list', noneRow);
        config.hosting.type = 'none';
        document.getElementById('extra-resources').style.display = 'none';
    }
    // Show info banner
    let banner = document.getElementById('hosting-locked-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'hosting-locked-banner';
        banner.className = 'cfg-promo-hosting-notice';
        banner.setAttribute('data-i18n', 'cfg_promo_hosting_locked');
        banner.textContent = typeof t === 'function' ? t('cfg_promo_hosting_locked') : '🎁 Darmowy Mini-bot wymaga własnego serwera. Hosting płatny/bezpłatny niedostępny.';
        const hostingList = document.getElementById('hosting-list');
        hostingList.parentNode.insertBefore(banner, hostingList);
    }
    banner.style.display = '';
}

function unlockHosting() {
    document.querySelectorAll('#hosting-list .cfg-option-row').forEach(row => {
        row.classList.remove('cfg-option-disabled');
    });
    const banner = document.getElementById('hosting-locked-banner');
    if (banner) banner.style.display = 'none';
}

function selectRow(listSelector, selectedRow) {
    document.querySelectorAll(`${listSelector} .cfg-option-row`).forEach(r => r.classList.remove('selected'));
    selectedRow.classList.add('selected');
}

// ── Textareas ──────────────────────────────
function setupTextareas() {
    const shortInput  = document.getElementById('short-description');
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
        if (currentStep < totalSteps - 1) {
            currentStep++;
            showStep(currentStep);
        }
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        if (currentStep > 0) {
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
    if (n === totalSteps - 1) buildSummaryStep();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
    const displayStep  = currentStep; // 0-based internally, show 0 as "Promo"
    const displayTotal = totalSteps - 1; // steps 1..6 visible to user
    const pct = currentStep === 0 ? 0 : ((currentStep - 1) / (totalSteps - 2)) * 100;
    document.getElementById('cfg-progress-fill').style.width = pct + '%';

    let stepText;
    if (currentStep === 0) {
        stepText = typeof t === 'function' ? t('cfg_step0_label') : 'Kod promocyjny';
    } else {
        stepText = typeof t === 'function'
            ? t('cfg_step_label', { step: currentStep, total: totalSteps - 1 })
            : (`Krok ${currentStep} / ${totalSteps - 1}`);
    }
    document.getElementById('cfg-progress-text').textContent = stepText;
    document.getElementById('nav-step-label').textContent = currentStep === 0
        ? (typeof t === 'function' ? t('cfg_step0_nav') : 'Promo')
        : `${currentStep} / ${totalSteps - 1}`;
}

function updateNavButtons(n) {
    const backBtn   = document.getElementById('btn-back');
    const nextBtn   = document.getElementById('btn-next');
    const submitBtn = document.getElementById('btn-submit');
    const cfsSend   = document.getElementById('cfs-order-btn');
    const lastStep  = totalSteps - 1;

    backBtn.style.display   = n === 0 ? 'none' : 'inline-flex';
    nextBtn.style.display   = n === lastStep ? 'none' : (n === 0 ? 'none' : 'inline-flex');
    submitBtn.style.display = n === lastStep ? 'inline-flex' : 'none';

    cfsSend.disabled = n !== lastStep;
}

// ── Validate ───────────────────────────────
function validateStep(n) {
    var e;
    switch (n) {
        case 0:
            // Promo step — must have chosen a benefit if a promo code was validated
            if (config.promoCode && !config.chosenBenefit) {
                e = typeof t === 'function' ? t('cfg_promo_err_choose') : 'Wybierz swój bonus promocyjny';
                showError(e);
                return false;
            }
            return true;
        case 1:
            if (!config.package) { e = typeof t === 'function' ? t('cfg_err_package') : 'Wybierz pakiet'; showError(e); return false; }
            return true;
        case 2:
            if (!config.shortDescription.trim()) { e = typeof t === 'function' ? t('cfg_err_short') : 'Wpisz krótki opis'; showError(e); return false; }
            if (config.shortDescription.length < 5) { e = typeof t === 'function' ? t('cfg_err_min5') : 'Minimum 5 znaków'; showError(e); return false; }
            return true;
        case 3:
            if (!config.language) { e = typeof t === 'function' ? t('cfg_err_lang') : 'Wybierz język programowania'; showError(e); return false; }
            return true;
        case 4:
            if (!config.hosting.type) { e = typeof t === 'function' ? t('cfg_err_hosting') : 'Wybierz opcję hostingu'; showError(e); return false; }
            // Double-check: free_mini cannot have paid/free hosting
            if (config.chosenBenefit === 'free_mini' && config.hosting.type !== 'none') {
                e = typeof t === 'function' ? t('cfg_promo_err_hosting') : 'Przy darmowym bocie Mini wymagany własny serwer';
                showError(e);
                return false;
            }
            return true;
        default:
            return true;
    }
}

// ── Price ──────────────────────────────────
function calculatePrice() {
    // Базовая цена пакета — всегда от minimum
    const basePackage = config.packagePriceMin || 0;
    let hostingCost = 0;
    let extrasCost = 0;

    if (config.hosting.type === 'paid') {
        hostingCost = 5; // $5/mo paid hosting
        extrasCost = config.hosting.extraStorage * 3 + config.hosting.extraBandwidth * 1;
    }

    const priorityCost = config.priorityCost || 0;

    // Скидка применяется ТОЛЬКО к базе пакета + хостинг (без extras и priority)
    const discountable = basePackage + hostingCost;

    if (config.chosenBenefit === 'free_mini' && config.package === 'Mini') {
        // Mini бесплатно — только extras + priority
        return extrasCost + priorityCost;
    }

    let total = discountable;
    if (config.chosenBenefit === 'percent_10') {
        const pct = config.promoDiscountPct || 10;
        total = Math.round(discountable * (1 - pct / 100) * 100) / 100;
    }

    total += extrasCost + priorityCost;
    return total;
}

function updatePrice() {
    const price = calculatePrice();
    config.totalPrice = price;
    const str = config.package === 'Custom' ? `от $${price}` : `$${price}`;
    const el = document.getElementById('live-price');
    if (el) el.textContent = str;
    updateLiveSummary();
}

function updateLiveSummary() {
    setLive('live-package',  config.package   || '—', !!config.package);
    setLive('live-language', config.language  || '—', !!config.language);

    var tr = (typeof t === 'function') ? t : function(k) { return k; };
    let hostingStr = '—';
    if (config.hosting.type === 'free')  hostingStr = tr('cfg_hosting_free');
    else if (config.hosting.type === 'paid')  hostingStr = tr('cfg_hosting_paid');
    else if (config.hosting.type === 'none')  hostingStr = tr('cfg_hosting_none');
    setLive('live-hosting', hostingStr, !!config.hosting.type);

    const prLiveNames = {
        normal: tr('cfg_prio_normal_live'),
        high:   tr('cfg_prio_high_live'),
        urgent: tr('cfg_prio_urgent_live')
    };
    setLive('live-priority', prLiveNames[config.priority] || '—', true);

    // Promo row in live panel
    const livePromoRow = document.getElementById('live-promo-row');
    const livePromo    = document.getElementById('live-promo');
    if (config.promoCode && config.chosenBenefit) {
        const benefitLabel = config.chosenBenefit === 'free_mini'
            ? tr('cfg_promo_free_mini_name')
            : tr('cfg_promo_pct_name');
        if (livePromo)    livePromo.textContent    = `${config.promoCode} (${benefitLabel})`;
        if (livePromoRow) livePromoRow.style.display = '';
    } else {
        if (livePromoRow) livePromoRow.style.display = 'none';
    }

    const price = calculatePrice();
    const priceStr = config.package === 'Custom' ? `от $${price}` : `$${price}`;
    const cfsPriceEl = document.querySelector('.cfs-price');
    if (cfsPriceEl) cfsPriceEl.textContent = priceStr;
}

function setLive(id, val, filled) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (filled !== undefined) el.classList.toggle('filled', filled);
}

// ── Build final summary ────────────────────
function buildSummaryStep() {
    var tr = (typeof t === 'function') ? t : function(k) { return k; };
    document.getElementById('sum-package').textContent  = config.package || '—';
    document.getElementById('sum-short').textContent    = config.shortDescription
        ? config.shortDescription.slice(0, 80) + (config.shortDescription.length > 80 ? '…' : '')
        : '—';
    document.getElementById('sum-language').textContent = config.language || '—';

    let hostingStr = '—';
    if (config.hosting.type === 'free') hostingStr = tr('cfg_hosting_free');
    else if (config.hosting.type === 'paid') {
        hostingStr = tr('cfg_hosting_paid');
        if (config.hosting.extraStorage > 0) hostingStr += ' ' + tr('cfg_hosting_extra_storage', { n: config.hosting.extraStorage });
        if (config.hosting.extraBandwidth > 0) hostingStr += ' ' + tr('cfg_hosting_extra_bw', { n: config.hosting.extraBandwidth });
    } else if (config.hosting.type === 'none') {
        hostingStr = tr('cfg_hosting_none');
    }
    document.getElementById('sum-hosting').textContent = hostingStr;

    const prNames = {
        normal: tr('cfg_prio_normal'),
        high:   tr('cfg_prio_high'),
        urgent: tr('cfg_prio_urgent')
    };
    document.getElementById('sum-priority').textContent = prNames[config.priority] || '—';

    const price = calculatePrice();
    document.getElementById('sum-total').textContent = config.package === 'Custom' ? `от $${price}` : `$${price}`;

    // Promo row in summary
    const sumPromoRow = document.getElementById('sum-promo-row');
    const sumPromo    = document.getElementById('sum-promo');
    if (config.promoCode && config.chosenBenefit) {
        const benefitLabel = config.chosenBenefit === 'free_mini'
            ? tr('cfg_promo_free_mini_name')
            : tr('cfg_promo_pct_name');
        if (sumPromo)    sumPromo.textContent    = `${config.promoCode} (${benefitLabel})`;
        if (sumPromoRow) sumPromoRow.style.display = '';
    } else {
        if (sumPromoRow) sumPromoRow.style.display = 'none';
    }

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
    var tr = (typeof t === 'function') ? t : function(k) { return k; };
    try {
        const user = await checkAuth();
        if (!user) {
            showError(tr('cfg_err_login'));
            sessionStorage.setItem('pendingOrder', JSON.stringify(config));
            setTimeout(() => { window.location.href = '/auth.html?returnTo=configurator.html'; }, 1500);
            return;
        }

        document.getElementById('loading-overlay').classList.add('active');

        const subject = tr('cfg_order_subject', { pkg: config.package });
        const initialMessage = tr('cfg_order_msg');

        // Pass promo fields both inside orderConfig and at top level
        // so the backend picks them up regardless of path
        const orderConfigToSend = {
            ...config,
            promoCode:     config.promoCode     || null,
            chosenBenefit: config.chosenBenefit || null
        };

        await API.createTicket(
            subject,
            initialMessage,
            config.priority,
            orderConfigToSend,
            config.promoCode     || null,
            config.chosenBenefit || null
        );

        window.location.href = 'tickets.html';
    } catch (err) {
        console.error('Submit order error:', err);
        document.getElementById('loading-overlay').classList.remove('active');
        showError(tr('cfg_err_create') + err.message);
    }
}

// ── Restore from pending order in sessionStorage ───────────────────────────
window.addEventListener('load', () => {
    const pending = sessionStorage.getItem('pendingOrder');
    if (pending) {
        try {
            config = JSON.parse(pending);
            sessionStorage.removeItem('pendingOrder');
            restoreConfigState();
            currentStep = totalSteps - 1;
            showStep(currentStep);
        } catch (_) {}
    }
});

function restoreConfigState() {
    if (config.package) {
        const row = document.querySelector(`#package-list .cfg-option-row[data-package="${config.package}"]`);
        if (row) selectRow('#package-list', row);
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

    // Restore promo if present
    if (config.promoCode) {
        document.getElementById('promo-code-input').value = config.promoCode;
    }
    if (config.chosenBenefit === 'free_mini') {
        lockHostingToNone();
    }

    updatePrice();
}
