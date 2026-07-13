const promoDb = require('../models/promoDb');

// ── User-facing ────────────────────────────────────────────────────────────────

/**
 * POST /api/promo/validate
 * Body: { code: string }
 * Auth required (authenticateToken middleware)
 *
 * Validates a promo code for the authenticated user.
 * Returns available benefit options if valid.
 */
async function validatePromo(req, res) {
    try {
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ valid: false, reason: 'Promo code is required' });
        }

        const trimmedCode = code.trim();
        if (trimmedCode.length === 0 || trimmedCode.length > 50) {
            return res.status(400).json({ valid: false, reason: 'Invalid promo code format' });
        }

        const promo = await promoDb.findPromoByCode(trimmedCode);

        if (!promo) {
            return res.status(200).json({ valid: false, reason: 'promo_not_found' });
        }

        if (!promo.is_active) {
            return res.status(200).json({ valid: false, reason: 'promo_inactive' });
        }

        // Check global usage limit
        if (promo.max_uses !== null && promo.use_count >= promo.max_uses) {
            return res.status(200).json({ valid: false, reason: 'promo_limit_reached' });
        }

        // Check per-user usage
        const alreadyUsed = await promoDb.hasUserUsedPromo(promo.id, req.user.id);
        if (alreadyUsed) {
            return res.status(200).json({ valid: false, reason: 'promo_already_used' });
        }

        // Build available benefit options
        const options = [];

        // free_mini option — always available if the promo has is_free_mini = true
        if (promo.is_free_mini) {
            options.push({
                type: 'free_mini',
                label: 'free_mini'
            });
        }

        // percent_10 option — always available (for any package)
        options.push({
            type: 'percent_10',
            label: 'percent_10',
            discountPercent: parseFloat(promo.discount_percent)
        });

        return res.status(200).json({
            valid: true,
            promoId: promo.id,
            code: promo.code,
            options
        });
    } catch (error) {
        console.error('Validate promo error:', error);
        return res.status(500).json({ valid: false, reason: 'server_error' });
    }
}

// ── Admin CRUD ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/promo
 * Returns all promo codes with stats
 */
async function listPromoCodes(req, res) {
    try {
        const codes = await promoDb.listPromoCodes();
        return res.json({ promoCodes: codes });
    } catch (error) {
        console.error('List promo codes error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * POST /api/admin/promo
 * Body: { code, description?, discountPercent?, isFreeMini?, maxUses? }
 */
async function createPromoCode(req, res) {
    try {
        const { code, description, discountPercent, isFreeMini, maxUses } = req.body;

        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            return res.status(400).json({ error: 'Promo code is required' });
        }

        if (code.trim().length > 50) {
            return res.status(400).json({ error: 'Promo code too long (max 50 characters)' });
        }

        // Validate discountPercent if provided
        if (discountPercent !== undefined) {
            const pct = parseFloat(discountPercent);
            if (isNaN(pct) || pct < 0 || pct > 100) {
                return res.status(400).json({ error: 'discountPercent must be between 0 and 100' });
            }
        }

        // Validate maxUses if provided
        if (maxUses !== undefined && maxUses !== null) {
            const uses = parseInt(maxUses, 10);
            if (isNaN(uses) || uses < 1) {
                return res.status(400).json({ error: 'maxUses must be a positive integer or null' });
            }
        }

        const promo = await promoDb.createPromoCode({
            code: code.trim(),
            description: description || null,
            discountPercent: discountPercent !== undefined ? parseFloat(discountPercent) : 10.00,
            isFreeMini: isFreeMini === true || isFreeMini === 'true',
            maxUses: maxUses !== undefined && maxUses !== null ? parseInt(maxUses, 10) : null,
            createdBy: req.user.id
        });

        return res.status(201).json({ promoCode: promo });
    } catch (error) {
        // Duplicate code
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Promo code already exists' });
        }
        console.error('Create promo code error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * GET /api/admin/promo/:id
 * Returns single promo code with full stats
 */
async function getPromoCode(req, res) {
    try {
        const { id } = req.params;
        const promo = await promoDb.getPromoStats(id);
        if (!promo) {
            return res.status(404).json({ error: 'Promo code not found' });
        }
        return res.json({ promoCode: promo });
    } catch (error) {
        console.error('Get promo code error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * PATCH /api/admin/promo/:id
 * Body: { isActive?, description?, maxUses? }
 */
async function updatePromoCode(req, res) {
    try {
        const { id } = req.params;
        const { isActive, description, maxUses } = req.body;

        const promo = await promoDb.findPromoById(id);
        if (!promo) {
            return res.status(404).json({ error: 'Promo code not found' });
        }

        // Validate maxUses if provided
        if (maxUses !== undefined && maxUses !== null) {
            const uses = parseInt(maxUses, 10);
            if (isNaN(uses) || uses < 1) {
                return res.status(400).json({ error: 'maxUses must be a positive integer or null' });
            }
        }

        const updated = await promoDb.updatePromoCode(id, {
            isActive: isActive !== undefined ? Boolean(isActive) : undefined,
            description: description !== undefined ? description : undefined,
            maxUses: maxUses !== undefined ? (maxUses === null ? null : parseInt(maxUses, 10)) : undefined
        });

        if (!updated) {
            return res.status(400).json({ error: 'Nothing to update' });
        }

        return res.json({ promoCode: updated });
    } catch (error) {
        console.error('Update promo code error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * DELETE /api/admin/promo/:id
 * Only deletes if use_count = 0, otherwise deactivates
 */
async function deletePromoCode(req, res) {
    try {
        const { id } = req.params;

        const promo = await promoDb.findPromoById(id);
        if (!promo) {
            return res.status(404).json({ error: 'Promo code not found' });
        }

        if (promo.use_count > 0) {
            // Has usage history — deactivate instead of deleting
            const updated = await promoDb.updatePromoCode(id, { isActive: false });
            return res.json({ deactivated: true, promoCode: updated });
        }

        const deleted = await promoDb.deletePromoCode(id);
        if (!deleted) {
            return res.status(500).json({ error: 'Failed to delete promo code' });
        }

        return res.json({ deleted: true });
    } catch (error) {
        console.error('Delete promo code error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    validatePromo,
    listPromoCodes,
    createPromoCode,
    getPromoCode,
    updatePromoCode,
    deletePromoCode
};
