const db = require('../models/db');
const promoDb = require('../models/promoDb');
const sse = require('../utils/sse');

// ── Price calculation (server-side, mirrors frontend logic) ───────────────────

const PACKAGE_PRICES = {
    'Mini':     { min: 3,  max: 5  },
    'Mini+':    { min: 5,  max: 10 },
    'Standard': { min: 20, max: 30 },
    'Max':      { min: 50, max: 70 },
    'Custom':   { min: 70, max: 70 }
};

const PRIORITY_COSTS = {
    'normal': 0,
    'high':   10,
    'urgent': 30
};

/**
 * Recalculates the order total price server-side from orderConfig.
 * Never trusts the price sent from the frontend.
 * Returns { basePrice, discountedPrice, discountApplied }
 */
function recalculatePrice(orderConfig, promoInfo) {
    const pkg = orderConfig.package;
    const prices = PACKAGE_PRICES[pkg];

    // Unknown package — return 0 (e.g. Custom with negotiated price)
    if (!prices) {
        return { basePrice: 0, discountedPrice: 0, discountApplied: false };
    }

    // Базовая цена пакета — всегда от minimum
    const basePackage = prices.min;
    let hostingCost = 0;
    let extrasCost = 0;

    if (orderConfig.hosting?.type === 'paid') {
        hostingCost = 5; // $5/mo paid hosting
        extrasCost = (orderConfig.hosting.extraStorage || 0) * 3 +
                     (orderConfig.hosting.extraBandwidth || 0) * 1;
    }

    const priorityCost = PRIORITY_COSTS[orderConfig.priority] || 0;

    // Скидка применяется ТОЛЬКО к базе пакета + хостинг (без extras и priority)
    const discountable = basePackage + hostingCost;

    let discountedPrice;
    let discountApplied = false;

    if (promoInfo && promoInfo.chosenBenefit === 'free_mini' && pkg === 'Mini') {
        // free_mini: платим только за extras + priority
        discountedPrice = extrasCost + priorityCost;
        discountApplied = true;
    } else if (promoInfo && promoInfo.chosenBenefit === 'percent_10') {
        const discountPct = parseFloat(promoInfo.discountPercent) || 10;
        discountedPrice = Math.round(discountable * (1 - discountPct / 100) * 100) / 100;
        discountedPrice += extrasCost + priorityCost;
        discountApplied = true;
    } else {
        discountedPrice = basePackage + hostingCost + extrasCost + priorityCost;
    }

    return {
        basePrice: basePackage + hostingCost + extrasCost + priorityCost,
        discountedPrice,
        discountApplied
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validate and resolve a promo code during ticket creation.
 * Returns promoInfo object or null. Throws on security violations.
 */
async function resolvePromoForTicket(promoCode, chosenBenefit, userId, orderPackage) {
    if (!promoCode || !chosenBenefit) return null;

    const trimmedCode = String(promoCode).trim();
    if (!trimmedCode) return null;

    const validBenefits = ['free_mini', 'percent_10'];
    if (!validBenefits.includes(chosenBenefit)) {
        throw Object.assign(new Error('Invalid chosenBenefit'), { statusCode: 400 });
    }

    // free_mini only applies to Mini package
    if (chosenBenefit === 'free_mini' && orderPackage !== 'Mini') {
        throw Object.assign(
            new Error('free_mini benefit is only valid for the Mini package'),
            { statusCode: 400 }
        );
    }

    const promo = await promoDb.findPromoByCode(trimmedCode);

    if (!promo || !promo.is_active) {
        throw Object.assign(new Error('Promo code is not valid'), { statusCode: 400 });
    }

    if (promo.max_uses !== null && promo.use_count >= promo.max_uses) {
        throw Object.assign(new Error('Promo code limit reached'), { statusCode: 400 });
    }

    const alreadyUsed = await promoDb.hasUserUsedPromo(promo.id, userId);
    if (alreadyUsed) {
        throw Object.assign(new Error('Promo code already used'), { statusCode: 409 });
    }

    // Ensure free_mini benefit is actually offered by this promo
    if (chosenBenefit === 'free_mini' && !promo.is_free_mini) {
        throw Object.assign(new Error('This promo code does not offer free_mini'), { statusCode: 400 });
    }

    return {
        promoId: promo.id,
        code: promo.code,
        chosenBenefit,
        discountPercent: parseFloat(promo.discount_percent)
    };
}

// ── Controllers ────────────────────────────────────────────────────────────────

// Получить список тикетов пользователя
async function listUserTickets(req, res) {
    try {
        const { status } = req.query;
        const tickets = await db.findUserTickets(req.user.id, status);
        res.json({ tickets });
    } catch (error) {
        console.error('List tickets error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Получить детали тикета
async function getTicket(req, res) {
    try {
        const { id } = req.params;
        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const messages = await db.findTicketMessages(id);
        res.json({ ticket, messages });
    } catch (error) {
        console.error('Get ticket error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Создать тикет
async function createTicket(req, res) {
    try {
        const { subject, initialMessage, priority, orderConfig, promoCode, chosenBenefit } = req.body;

        // Валидация priority
        const validPriorities = ['normal', 'high', 'urgent'];
        const ticketPriority = priority || 'normal';
        if (!validPriorities.includes(ticketPriority)) {
            return res.status(400).json({ error: 'Invalid priority. Must be: normal, high, or urgent' });
        }

        let finalSubject = subject;
        let finalMessage = initialMessage;
        let promoInfo = null;

        if (orderConfig) {
            // Валидация orderConfig
            if (typeof orderConfig !== 'object' || orderConfig === null || Array.isArray(orderConfig)) {
                return res.status(400).json({ error: 'Invalid orderConfig format' });
            }

            const configSize = JSON.stringify(orderConfig).length;
            if (configSize > 50000) {
                return res.status(400).json({ error: 'OrderConfig is too large (max 50KB)' });
            }

            if (orderConfig.package && typeof orderConfig.package !== 'string') {
                return res.status(400).json({ error: 'Invalid orderConfig.package' });
            }

            if (orderConfig.language && typeof orderConfig.language !== 'string') {
                return res.status(400).json({ error: 'Invalid orderConfig.language' });
            }

            // ── Resolve and validate promo code server-side ──────────────────
            try {
                promoInfo = await resolvePromoForTicket(
                    promoCode || orderConfig.promoCode,
                    chosenBenefit || orderConfig.chosenBenefit,
                    req.user.id,
                    orderConfig.package
                );
            } catch (promoErr) {
                return res.status(promoErr.statusCode || 400).json({ error: promoErr.message });
            }

            // ── Server-side price recalculation ──────────────────────────────
            const { discountedPrice } = recalculatePrice(orderConfig, promoInfo);

            // Формируем тему из пакета
            finalSubject = `Заказ бота: ${orderConfig.package}`;

            const packagePrices = {
                'Mini':     '$3–5',
                'Mini+':    '$5–10',
                'Standard': '$20–30',
                'Max':      '$50–70',
                'Custom':   'от $70'
            };

            const hostingText = orderConfig.hosting?.type === 'free'
                ? 'Бесплатный (входит в пакет)'
                : orderConfig.hosting?.type === 'paid'
                ? `Платный ($5/мес)${orderConfig.hosting.extraStorage > 0 ? ` + ${orderConfig.hosting.extraStorage} ГБ доп. места` : ''}${orderConfig.hosting.extraBandwidth > 0 ? ` + ${orderConfig.hosting.extraBandwidth} ГБ доп. трафика` : ''}`
                : 'Без хостинга (сам разверну)';

            const priorityText = {
                'normal': 'Нормальный (по очереди)',
                'high':   'Высокий (+$10 к стоимости)',
                'urgent': 'Срочный (+$30 к стоимости)'
            };

            // Promo line (appended only if promo was applied)
            let promoLine = '';
            if (promoInfo) {
                const benefitLabel = promoInfo.chosenBenefit === 'free_mini'
                    ? 'Бесплатный Mini-бот'
                    : `Скидка ${promoInfo.discountPercent}%`;
                promoLine = `\n🎟 Промокод: ${promoInfo.code} (${benefitLabel})`;
            }

            finalMessage = `📦 Пакет: ${orderConfig.package} (${packagePrices[orderConfig.package] || 'custom'})

📝 Краткое описание:
${orderConfig.shortDescription || 'Не указано'}

📋 Подробное описание:
${orderConfig.detailedDescription || 'Не указано'}

💻 Язык программирования: ${orderConfig.language || 'Не указан'}

🌐 Хостинг: ${hostingText}

⚡ Приоритет: ${priorityText[orderConfig.priority] || 'Нормальный'}

💰 Итоговая стоимость: $${discountedPrice}${promoLine}`;

            // Store server-calculated price and promo info back into orderConfig for the record
            orderConfig.totalPrice = discountedPrice;
            if (promoInfo) {
                orderConfig.promoCode = promoInfo.code;
                orderConfig.chosenBenefit = promoInfo.chosenBenefit;
                orderConfig.promoApplied = true;
            }

        } else {
            // Plain ticket (from tickets modal, no orderConfig)
            // Promo fields can still be passed at the top level
            try {
                promoInfo = await resolvePromoForTicket(
                    promoCode,
                    chosenBenefit,
                    req.user.id,
                    null  // no package — only percent_10 allowed
                );
            } catch (promoErr) {
                return res.status(promoErr.statusCode || 400).json({ error: promoErr.message });
            }

            // Append promo line to plain message if applicable
            if (promoInfo && finalMessage) {
                const benefitLabel = promoInfo.chosenBenefit === 'percent_10'
                    ? `Скидка ${promoInfo.discountPercent}%`
                    : 'Бесплатный Mini-бот';
                finalMessage = finalMessage + `\n\n🎟 Промокод: ${promoInfo.code} (${benefitLabel})`;
            }
        }

        if (!finalSubject || !finalMessage) {
            return res.status(400).json({ error: 'Subject and initial message are required' });
        }

        if (finalSubject.trim().length === 0) {
            return res.status(400).json({ error: 'Subject cannot be empty' });
        }

        if (finalSubject.length > 200) {
            return res.status(400).json({ error: 'Subject is too long (max 200 characters)' });
        }

        if (finalMessage.length > 5000) {
            return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
        }

        const ticket = await db.createTicket(req.user.id, finalSubject, ticketPriority, orderConfig || null);
        await db.createMessage(ticket.id, req.user.id, finalMessage, false);

        // ── Record promo use (pending — ticket stays open) ───────────────────
        if (promoInfo) {
            await promoDb.createPromoUse(promoInfo.promoId, req.user.id, promoInfo.chosenBenefit);
        }

        // SSE notification
        sse.send('admins', 'admin:ticket:new', {
            ...ticket,
            user_username: req.user.username,
            assigned_admin_username: null
        });

        res.status(201).json({ ticket });
    } catch (error) {
        console.error('Create ticket error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Добавить сообщение в тикет
async function addMessage(req, res) {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (content.length > 5000) {
            return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (ticket.status === 'closed') {
            return res.status(409).json({ error: 'Cannot add message to closed ticket' });
        }

        const message = await db.createMessage(ticket.id, req.user.id, content.trim(), req.user.isAdmin);

        sse.send('admins', 'admin:message:new', {
            ticketId: ticket.id,
            message: { ...message, username: req.user.username }
        });

        if (ticket.assigned_admin_id) {
            sse.sendToAdmin(ticket.assigned_admin_id, 'admin:message:new', {
                ticketId: ticket.id,
                message: { ...message, username: req.user.username }
            });
        }

        res.status(201).json({ message });
    } catch (error) {
        console.error('Add message error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Обновить статус тикета (только пользователь может закрыть свой тикет)
async function updateStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        if (status !== 'closed') {
            return res.status(400).json({ error: 'Users can only close their tickets' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updatedTicket = await db.updateTicketStatus(id, status);

        // ── Finalize promo use on ticket close ───────────────────────────────
        await finalizePromoOnClose(id, ticket.user_id);

        res.json({ ticket: updatedTicket });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Finalizes a pending promo_use when a ticket is closed.
 * Sets ticket_id and increments use_count. Safe to call even if no promo was used.
 */
async function finalizePromoOnClose(ticketId, userId) {
    try {
        const pendingUse = await promoDb.findPendingPromoUse(userId);
        if (!pendingUse) return;

        await promoDb.finalizePromoUse(pendingUse.promo_code_id, userId, ticketId);
        console.log(`[PROMO] Finalized promo "${pendingUse.code}" for user ${userId}, ticket ${ticketId}`);
    } catch (err) {
        // Non-fatal — log but don't break ticket close
        console.error('[PROMO] Failed to finalize promo use on close:', err.message);
    }
}

module.exports = {
    listUserTickets,
    getTicket,
    createTicket,
    addMessage,
    updateStatus,
    finalizePromoOnClose  // exported so admin controller can call it too
};
