// ── Config state (backend-compatible) ──────
let config = {
    platform: null,           // 'telegram' | 'discord' | 'both'
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
    promoOptions: null,
    promoDiscountPct: 10
};

let currentStep = 0;
const totalSteps = 5;       // 0..4

const tr = () => (typeof t === 'function' ? t : k => k);

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupPlatformStep();
    setupPackageStep();
    setupDetailsStep();
    setupTextareas();
    setupPromoSidebar();
    setupNavigation();
    applyDefaults();
    showStep(0);
    updatePrice();

    document.getElementById('cfs-order-btn').addEventListener('click', submitOrder);
    document.getElementById('btn-final-submit').addEventListener('click', submitOrder);

    window.addEventListener('langchange', () => {
        updatePackageDescriptions();
        updateLiveSummary();
        updatePrice();
    });
});

// Defaults: language=Python, hosting=free, priority=normal — less friction
function applyDefaults() {
    config.language = 'Python';
    const pySeg = document.querySelector('#language-list .cfg-seg[data-language="Python"]');
    if (pySeg) pySeg.classList.add('selected');

    config.hosting.type = 'free';
    const freeRow = document.querySelector('#hosting-list .cfg-option-row[data-hosting="free"]');
    if (freeRow) freeRow.classList.add('selected');
}

// ── Platform step ──────────────────────────
function setupPlatformStep() {
    document.querySelectorAll('#platform-list .cfg-platform-card').forEach(card => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        const choose = () => {
            selectRow('#platform-list', card);
            config.platform = card.dataset.platform;
            updatePackageDescriptions();
            updateLiveSummary();
            refreshNextButton();
        };
        card.addEventListener('click', choose);
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
        });
    });
}

function updatePackageDescriptions() {
    const isDiscord = config.platform === 'discord' || config.platform === 'both';
    const f = tr();
    const descMap = isDiscord ? {
        'Mini':     f('cfg_dc_mini_desc'),
        'Mini+':    f('cfg_dc_miniplus_desc'),
        'Standard': f('cfg_dc_std_desc'),
        'Max':      f('cfg_dc_max_desc'),
        'Custom':   f('cfg_dc_custom_desc'),
    } : {
        'Mini':     f('cfg_mini_desc'),
        'Mini+':    f('cfg_miniplus_desc'),
        'Standard': f('cfg_std_desc'),
        'Max':      f('cfg_max_desc'),
        'Custom':   f('cfg_custom_desc'),
    };

    document.querySelectorAll('#package-list .cfg-package-card').forEach(card => {
        const descEl = card.querySelector('.cfg-package-desc');
        if (descEl && descMap[card.dataset.package]) descEl.textContent = descMap[card.dataset.package];
    });
}

// ── Package step ───────────────────────────
function setupPackageStep() {
    document.querySelectorAll('#package-list .cfg-package-card').forEach(card => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        const choose = () => {
            selectRow('#package-list', card);
            config.package = card.dataset.package;
            config.packagePriceMin = parseInt(card.dataset.priceMin);
            config.packagePriceMax = parseInt(card.dataset.priceMax);

            // free_mini benefit only valid with Mini — fall back to percent
            if (config.chosenBenefit === 'free_mini' && config.package !== 'Mini') {
                config.chosenBenefit = 'percent_10';
                const freeMiniRow = document.getElementById('benefit-free-mini');
                const pct10Row    = document.getElementById('benefit-percent-10');
                if (freeMiniRow) freeMiniRow.classList.remove('selected');
                if (pct10Row)    pct10Row.classList.add('selected');
            }

            if (config.chosenBenefit === 'free_mini') lockHostingToNone();
            else unlockHosting();

            updatePrice();
            refreshNextButton();
        };
        card.addEventListener('click', choose);
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
        });
    });
}

// ── Details step (language / hosting / priority) ──
function setupDetailsStep() {
    // Language
    document.querySelectorAll('#language-list .cfg-seg').forEach(seg => {
        makeAccessible(seg);
        seg.addEventListener('click', () => {
            selectRow('#language-list', seg);
            config.language = seg.dataset.language;
            updateLiveSummary();
            refreshNextButton();
        });
    });

    // Hosting
    document.querySelectorAll('#hosting-list .cfg-option-row').forEach(row => {
        makeAccessible(row);
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
            refreshNextButton();
        });
    });

    // Priority
    document.querySelectorAll('#priority-list .cfg-seg').forEach(seg => {
        makeAccessible(seg);
        seg.addEventListener('click', () => {
            selectRow('#priority-list', seg);
            config.priority = seg.dataset.priority;
            config.priorityCost = parseInt(seg.dataset.cost) || 0;
            updatePrice();
        });
    });

    // Extra resources
    document.getElementById('extra-storage').addEventListener('input', e => {
        config.hosting.extraStorage = parseInt(e.target.value) || 0;
        updatePrice();
    });
    document.getElementById('extra-bandwidth').addEventListener('input', e => {
        config.hosting.extraBandwidth = parseInt(e.target.value) || 0;
        updatePrice();
    });
}

function makeAccessible(el) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!el.classList.contains('cfg-option-disabled')) el.click();
        }
    });
}

function lockHostingToNone() {
    document.querySelectorAll('#hosting-list .cfg-option-row').forEach(row => {
        if (row.dataset.hosting !== 'none') row.classList.add('cfg-option-disabled');
    });
    const noneRow = document.querySelector('#hosting-list .cfg-option-row[data-hosting="none"]');
    if (noneRow && !noneRow.classList.contains('selected')) {
        selectRow('#hosting-list', noneRow);
        config.hosting.type = 'none';
        document.getElementById('extra-resources').style.display = 'none';
    }
    let banner = document.getElementById('hosting-locked-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'hosting-locked-banner';
        banner.className = 'cfg-promo-hosting-notice';
        banner.textContent = tr()('cfg_promo_hosting_locked');
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
    const rowClass = listSelector === '#language-list' || listSelector === '#priority-list'
        ? '.cfg-seg' : '.cfg-option-row, .cfg-platform-card, .cfg-package-card';
    document.querySelectorAll(`${listSelector} ${rowClass}`).forEach(r => r.classList.remove('selected'));
    selectedRow.classList.add('selected');
}

// ── Textareas ──────────────────────────────
function setupTextareas() {
    const shortInput  = document.getElementById('short-description');
    const detailInput = document.getElementById('detailed-description');

    shortInput.addEventListener('input', e => {
        config.shortDescription = e.target.value;
        document.getElementById('short-counter').textContent = e.target.value.length;
        refreshNextButton();
    });

    detailInput.addEventListener('input', e => {
        config.detailedDescription = e.target.value;
        document.getElementById('detailed-counter').textContent = e.target.value.length;
    });
}

// ── Promo sidebar ──────────────────────────
function setupPromoSidebar() {
    const toggle = document.getElementById('promo-toggle');
    const body   = document.getElementById('promo-body');

    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        body.style.display = expanded ? 'none' : '';
    });

    const applyBtn  = document.getElementById('promo-apply-btn');
    const codeInput = document.getElementById('promo-code-input');

    applyBtn.addEventListener('click', applyPromoCode);
    codeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); applyPromoCode(); }
    });

    document.getElementById('promo-clear-btn').addEventListener('click', clearPromo);

    [document.getElementById('benefit-free-mini'), document.getElementById('benefit-percent-10')].forEach(row => {
        if (!row) return;
        makeAccessible(row);
        row.addEventListener('click', () => selectBenefit(row.dataset.benefit));
    });
}

async function applyPromoCode() {
    const f        = tr();
    const input    = document.getElementById('promo-code-input');
    const applyBtn = document.getElementById('promo-apply-btn');
    const code     = input.value.trim();

    if (!code) { showPromoStatus('error', f('cfg_promo_err_empty')); return; }

    applyBtn.disabled = true;
    applyBtn.textContent = f('cfg_promo_checking');

    try {
        const result = await API.validatePromo(code);

        if (!result || !result.valid) {
            const reasonKey = {
                promo_not_found:     'cfg_promo_err_not_found',
                promo_inactive:      'cfg_promo_err_inactive',
                promo_limit_reached: 'cfg_promo_err_limit',
                promo_already_used:  'cfg_promo_err_used',
                too_many_requests:   'cfg_promo_err_rate'
            }[result?.reason] || 'cfg_promo_err_invalid';

            showPromoStatus('error', f(reasonKey));
            hideBenefits();
            return;
        }

        config.promoCode    = result.code;
        config.promoOptions = result.options;

        const pctOption = result.options.find(o => o.type === 'percent_10');
        if (pctOption) config.promoDiscountPct = pctOption.discountPercent || 10;

        showPromoStatus('ok', f('cfg_promo_valid') + ' ' + result.code);
        showBenefits(result.options);
        document.getElementById('promo-clear-btn').style.display = '';

    } catch (err) {
        showPromoStatus('error', f('cfg_promo_err_server'));
        hideBenefits();
    } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = f('cfg_promo_apply');
    }
}

function showBenefits(options) {
    const benefitsEl  = document.getElementById('promo-benefits');
    const freeMiniRow = document.getElementById('benefit-free-mini');
    const hasFreeMini = options.some(o => o.type === 'free_mini');
    freeMiniRow.style.display = hasFreeMini ? '' : 'none';

    [freeMiniRow, document.getElementById('benefit-percent-10')].forEach(r => r && r.classList.remove('selected'));
    config.chosenBenefit = null;
    benefitsEl.style.display = '';
}

function hideBenefits() {
    document.getElementById('promo-benefits').style.display = 'none';
    config.chosenBenefit = null;
}

function selectBenefit(benefit) {
    config.chosenBenefit = benefit;

    [document.getElementById('benefit-free-mini'), document.getElementById('benefit-percent-10')]
        .forEach(r => r && r.classList.remove('selected'));

    const selected = document.querySelector(`.cfg-benefit-row[data-benefit="${benefit}"]`);
    if (selected) selected.classList.add('selected');

    if (benefit === 'free_mini') {
        // Force Mini package + own server hosting
        config.package = 'Mini';
        config.packagePriceMin = 3;
        config.packagePriceMax = 5;
        const miniCard = document.querySelector('#package-list .cfg-package-card[data-package="Mini"]');
        if (miniCard) selectRow('#package-list', miniCard);
        lockHostingToNone();
    } else {
        unlockHosting();
    }

    updatePrice();
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
    document.getElementById('promo-clear-btn').style.display = 'none';
    hideBenefits();
    unlockHosting();
    updatePrice();
}

// ── Navigation ─────────────────────────────
function setupNavigation() {
    document.getElementById('btn-next').addEventListener('click', () => {
        if (!validateStep(currentStep)) return;
        if (currentStep < totalSteps - 1) showStep(currentStep + 1);
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        if (currentStep > 0) showStep(currentStep - 1);
    });

    // Stepper jump
    document.querySelectorAll('#cfg-stepper .cfg-stepper-item').forEach(item => {
        item.addEventListener('click', () => {
            const target = parseInt(item.dataset.goto);
            if (target <= currentStep) { showStep(target); return; }
            // Validate all steps in between
            for (let i = currentStep; i < target; i++) {
                if (!validateStep(i)) { showStep(i); return; }
            }
            showStep(target);
        });
    });

    // Edit links on confirm step
    document.querySelectorAll('.csb-edit').forEach(btn => {
        btn.addEventListener('click', () => showStep(parseInt(btn.dataset.goto)));
    });
}

function showStep(n) {
    currentStep = n;
    document.querySelectorAll('.cfg-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');

    updateStepper();
    updateNavButtons(n);
    refreshNextButton();
    if (n === totalSteps - 1) buildSummaryStep();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Highlight «Next» when the current step is already valid
function refreshNextButton() {
    const nextBtn = document.getElementById('btn-next');
    if (!nextBtn || nextBtn.style.display === 'none') return;
    nextBtn.classList.toggle('is-ready', validateStep(currentStep, true));
}

function stepDone(i) {
    switch (i) {
        case 0: return !!config.platform;
        case 1: return !!config.package;
        case 2: return config.shortDescription.trim().length >= 5;
        case 3: return !!config.language && !!config.hosting.type;
        default: return false;
    }
}

function updateStepper() {
    document.querySelectorAll('#cfg-stepper .cfg-stepper-item').forEach(item => {
        const idx = parseInt(item.dataset.goto);
        item.classList.toggle('active', idx === currentStep);
        item.classList.toggle('done', idx < currentStep && stepDone(idx));
    });
}

function updateNavButtons(n) {
    const backBtn = document.getElementById('btn-back');
    const nextBtn = document.getElementById('btn-next');
    const cfsSend = document.getElementById('cfs-order-btn');

    backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
    nextBtn.style.display    = n === totalSteps - 1 ? 'none' : 'inline-flex';
    document.getElementById('nav-step-label').textContent = `${n + 1} / ${totalSteps}`;

    cfsSend.disabled = n !== totalSteps - 1;
}

function validateStep(n, silent) {
    const f = tr();
    const fail = msg => { if (!silent) showError(msg); return false; };

    switch (n) {
        case 0:
            return config.platform ? true : fail(f('cfg_err_platform'));
        case 1:
            return config.package ? true : fail(f('cfg_err_package'));
        case 2:
            if (!config.shortDescription.trim()) return fail(f('cfg_err_short'));
            if (config.shortDescription.trim().length < 5) return fail(f('cfg_err_min5'));
            return true;
        case 3:
            if (!config.language) return fail(f('cfg_err_lang'));
            if (!config.hosting.type) return fail(f('cfg_err_hosting'));
            if (config.chosenBenefit === 'free_mini' && config.hosting.type !== 'none') {
                return fail(f('cfg_promo_err_hosting'));
            }
            return true;
        default:
            return true;
    }
}

// ── Price ──────────────────────────────────
function calculatePrice() {
    const basePackage = config.packagePriceMin || 0;
    let hostingCost = 0;
    let extrasCost = 0;

    if (config.hosting.type === 'paid') {
        hostingCost = 5;
        extrasCost = config.hosting.extraStorage * 3 + config.hosting.extraBandwidth * 1;
    }

    const priorityCost = config.priorityCost || 0;
    const discountable = basePackage + hostingCost;

    if (config.chosenBenefit === 'free_mini' && config.package === 'Mini') {
        return extrasCost + priorityCost;
    }

    let total = discountable;
    if (config.chosenBenefit === 'percent_10') {
        const pct = config.promoDiscountPct || 10;
        total = Math.round(discountable * (1 - pct / 100) * 100) / 100;
    }

    return total + extrasCost + priorityCost;
}

function updatePrice() {
    const price = calculatePrice();
    config.totalPrice = price;
    const str = config.package === 'Custom' ? `${tr()('cfg_from')} $${price}` : `$${price}`;
    const el = document.getElementById('live-price');
    if (el) el.textContent = str;
    updateLiveSummary();
}

// ── Live summary sidebar ───────────────────
function updateLiveSummary() {
    const f = tr();

    const platformNames = {
        telegram: f('cfg_platform_tg_name'),
        discord:  f('cfg_platform_dc_name'),
        both:     f('cfg_platform_both_name'),
    };
    setLive('live-platform', config.platform ? platformNames[config.platform] : '—', !!config.platform);
    setLive('live-package',  config.package || '—', !!config.package);
    setLive('live-language', config.language || '—', !!config.language);

    let hostingStr = '—';
    if (config.hosting.type === 'free') hostingStr = f('cfg_hosting_free');
    else if (config.hosting.type === 'paid') hostingStr = f('cfg_hosting_paid');
    else if (config.hosting.type === 'none') hostingStr = f('cfg_hosting_none');
    setLive('live-hosting', hostingStr, !!config.hosting.type);

    const prNames = {
        normal: f('cfg_prio_normal_live'),
        high:   f('cfg_prio_high_live'),
        urgent: f('cfg_prio_urgent_live')
    };
    setLive('live-priority', prNames[config.priority] || '—', true);

    const livePromoRow = document.getElementById('live-promo-row');
    const livePromo    = document.getElementById('live-promo');
    if (config.promoCode && config.chosenBenefit) {
        const benefitLabel = config.chosenBenefit === 'free_mini'
            ? f('cfg_promo_free_mini_name') : f('cfg_promo_pct_name');
        livePromo.textContent = `${config.promoCode} (${benefitLabel})`;
        livePromoRow.style.display = '';
    } else {
        livePromoRow.style.display = 'none';
    }
}

function setLive(id, val, filled) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (filled !== undefined) el.classList.toggle('filled', filled);
}

// ── Confirm step summary ───────────────────
function buildSummaryStep() {
    const f = tr();

    const platformNames = {
        telegram: f('cfg_platform_tg_name'),
        discord:  f('cfg_platform_dc_name'),
        both:     f('cfg_platform_both_name'),
    };
    setText('sum-platform', config.platform ? platformNames[config.platform] : '—');
    setText('sum-package',  config.package || '—');
    setText('sum-short',    config.shortDescription
        ? config.shortDescription.slice(0, 80) + (config.shortDescription.length > 80 ? '…' : '') : '—');
    setText('sum-language', config.language || '—');

    let hostingStr = '—';
    if (config.hosting.type === 'free') hostingStr = f('cfg_hosting_free');
    else if (config.hosting.type === 'paid') {
        hostingStr = f('cfg_hosting_paid');
        if (config.hosting.extraStorage > 0)  hostingStr += ' ' + f('cfg_hosting_extra_storage', { n: config.hosting.extraStorage });
        if (config.hosting.extraBandwidth > 0) hostingStr += ' ' + f('cfg_hosting_extra_bw', { n: config.hosting.extraBandwidth });
    } else if (config.hosting.type === 'none') hostingStr = f('cfg_hosting_none');
    setText('sum-hosting', hostingStr);

    const prNames = { normal: f('cfg_prio_normal'), high: f('cfg_prio_high'), urgent: f('cfg_prio_urgent') };
    setText('sum-priority', prNames[config.priority] || '—');

    const price = calculatePrice();
    setText('sum-total', config.package === 'Custom' ? `${f('cfg_from')} $${price}` : `$${price}`);

    const sumPromoRow = document.getElementById('sum-promo-row');
    if (config.promoCode && config.chosenBenefit) {
        const benefitLabel = config.chosenBenefit === 'free_mini'
            ? f('cfg_promo_free_mini_name') : f('cfg_promo_pct_name');
        setText('sum-promo', `${config.promoCode} (${benefitLabel})`);
        sumPromoRow.style.display = '';
    } else {
        sumPromoRow.style.display = 'none';
    }

    const details = document.getElementById('desc-details');
    if (config.detailedDescription.trim()) {
        details.style.display = '';
        setText('sum-detailed', config.detailedDescription);
    } else {
        details.style.display = 'none';
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Submit order ───────────────────────────
async function submitOrder() {
    const f = tr();
    try {
        const user = await checkAuth();
        if (!user) {
            showError(f('cfg_err_login'));
            sessionStorage.setItem('pendingOrder', JSON.stringify(config));
            setTimeout(() => { window.location.href = '/auth.html?returnTo=configurator.html'; }, 1500);
            return;
        }

        document.getElementById('loading-overlay').classList.add('active');

        const subject = f('cfg_order_subject', { pkg: config.package }) +
            (config.platform ? ` [${config.platform}]` : '');
        const initialMessage = f('cfg_order_msg');

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

        window.location.href = 'account.html?tab=orders';
    } catch (err) {
        console.error('Submit order error:', err);
        document.getElementById('loading-overlay').classList.remove('active');
        showError(f('cfg_err_create') + err.message);
    }
}

// ── Restore pending order after login ──────
window.addEventListener('load', () => {
    const pending = sessionStorage.getItem('pendingOrder');
    if (pending) {
        try {
            config = JSON.parse(pending);
            sessionStorage.removeItem('pendingOrder');
            restoreConfigState();
            showStep(totalSteps - 1);
        } catch (_) {}
    }
});

function restoreConfigState() {
    if (config.platform) {
        const card = document.querySelector(`#platform-list .cfg-platform-card[data-platform="${config.platform}"]`);
        if (card) selectRow('#platform-list', card);
        updatePackageDescriptions();
    }
    if (config.package) {
        const card = document.querySelector(`#package-list .cfg-package-card[data-package="${config.package}"]`);
        if (card) selectRow('#package-list', card);
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
        const seg = document.querySelector(`#language-list .cfg-seg[data-language="${config.language}"]`);
        if (seg) selectRow('#language-list', seg);
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
        const seg = document.querySelector(`#priority-list .cfg-seg[data-priority="${config.priority}"]`);
        if (seg) selectRow('#priority-list', seg);
    }
    if (config.promoCode) {
        document.getElementById('promo-code-input').value = config.promoCode;
    }
    if (config.chosenBenefit === 'free_mini') {
        lockHostingToNone();
    }
    updatePrice();
}
