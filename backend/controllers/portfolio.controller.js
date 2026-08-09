const portfolioDb = require('../models/portfolioDb');

const VALID_PLATFORMS = ['telegram', 'discord'];
const VALID_PLANS     = ['mini', 'miniplus', 'standard', 'max', 'custom'];

// ── Public: GET /api/portfolio ─────────────────────────────────────────────
async function listPublic(req, res) {
    try {
        const { platform, plan } = req.query;
        const projects = await portfolioDb.getAllProjects({
            platform,
            plan,
            visibleOnly: true
        });
        res.json({ projects });
    } catch (err) {
        console.error('[PORTFOLIO] listPublic error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin: GET /api/admin/portfolio ────────────────────────────────────────
async function listAll(req, res) {
    try {
        const { platform, plan } = req.query;
        const projects = await portfolioDb.getAllProjects({ platform, plan, visibleOnly: false });
        res.json({ projects });
    } catch (err) {
        console.error('[PORTFOLIO] listAll error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin: GET /api/admin/portfolio/:id ────────────────────────────────────
async function getOne(req, res) {
    try {
        const project = await portfolioDb.getProjectById(req.params.id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        res.json({ project });
    } catch (err) {
        console.error('[PORTFOLIO] getOne error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin: POST /api/admin/portfolio ──────────────────────────────────────
async function create(req, res) {
    try {
        const { title, description, platform, plan, lang, price, term, botUrl, sourceUrl, screenshots, features, isVisible, sortOrder } = req.body;

        if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
        if (!description || !description.trim()) return res.status(400).json({ error: 'description is required' });
        if (platform && !VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
        if (plan && !VALID_PLANS.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });

        const project = await portfolioDb.createProject({
            title:       title.trim(),
            description: description.trim(),
            platform:    platform   || 'telegram',
            plan:        plan       || 'mini',
            lang:        lang       || null,
            price:       price      || null,
            term:        term       || null,
            botUrl:      botUrl     || null,
            sourceUrl:   sourceUrl  || null,
            screenshots: Array.isArray(screenshots) ? screenshots : [],
            features:    Array.isArray(features)    ? features    : [],
            isVisible:   isVisible !== false,
            sortOrder:   parseInt(sortOrder) || 0
        });

        res.status(201).json({ project });
    } catch (err) {
        console.error('[PORTFOLIO] create error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin: PATCH /api/admin/portfolio/:id ─────────────────────────────────
async function update(req, res) {
    try {
        const { title, description, platform, plan, lang, price, term, botUrl, sourceUrl, screenshots, features, isVisible, sortOrder } = req.body;

        if (platform !== undefined && !VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
        if (plan     !== undefined && !VALID_PLANS.includes(plan))         return res.status(400).json({ error: 'Invalid plan' });

        const updates = {};
        if (title       !== undefined) updates.title       = title.trim();
        if (description !== undefined) updates.description = description.trim();
        if (platform    !== undefined) updates.platform    = platform;
        if (plan        !== undefined) updates.plan        = plan;
        if (lang        !== undefined) updates.lang        = lang || null;
        if (price       !== undefined) updates.price       = price || null;
        if (term        !== undefined) updates.term        = term  || null;
        if (botUrl      !== undefined) updates.botUrl      = botUrl     || null;
        if (sourceUrl   !== undefined) updates.sourceUrl   = sourceUrl  || null;
        if (screenshots !== undefined) updates.screenshots = Array.isArray(screenshots) ? screenshots : [];
        if (features    !== undefined) updates.features    = Array.isArray(features)    ? features    : [];
        if (isVisible   !== undefined) updates.isVisible   = Boolean(isVisible);
        if (sortOrder   !== undefined) updates.sortOrder   = parseInt(sortOrder) || 0;

        const project = await portfolioDb.updateProject(req.params.id, updates);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        res.json({ project });
    } catch (err) {
        console.error('[PORTFOLIO] update error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// ── Admin: DELETE /api/admin/portfolio/:id ────────────────────────────────
async function remove(req, res) {
    try {
        const deleted = await portfolioDb.deleteProject(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Project not found' });
        res.json({ deleted: true, id: deleted.id });
    } catch (err) {
        console.error('[PORTFOLIO] remove error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { listPublic, listAll, getOne, create, update, remove };
