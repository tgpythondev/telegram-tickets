const db = require('../config/database');

// ============ PORTFOLIO PROJECTS ============

async function getAllProjects({ platform, plan, visibleOnly = false } = {}) {
    const conditions = [];
    const params = [];
    let i = 1;

    if (visibleOnly) {
        conditions.push(`is_visible = TRUE`);
    }
    if (platform && platform !== 'all') {
        conditions.push(`platform = $${i++}`);
        params.push(platform);
    }
    if (plan && plan !== 'all') {
        conditions.push(`plan = $${i++}`);
        params.push(plan);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
        `SELECT * FROM portfolio_projects ${where} ORDER BY sort_order ASC, created_at DESC`,
        params
    );
    return result.rows;
}

async function getProjectById(id) {
    const result = await db.query(
        'SELECT * FROM portfolio_projects WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
}

async function createProject({ title, description, platform, plan, lang, price, term, botUrl, sourceUrl, screenshots, features, isVisible, sortOrder }) {
    const result = await db.query(
        `INSERT INTO portfolio_projects
            (title, description, platform, plan, lang, price, term, bot_url, source_url, screenshots, features, is_visible, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
            title,
            description,
            platform   || 'telegram',
            plan       || 'mini',
            lang       || null,
            price      || null,
            term       || null,
            botUrl     || null,
            sourceUrl  || null,
            JSON.stringify(screenshots || []),
            JSON.stringify(features   || []),
            isVisible  !== false,
            sortOrder  || 0
        ]
    );
    return result.rows[0];
}

async function updateProject(id, updates) {
    const fields  = [];
    const params  = [];
    let   idx     = 1;

    const map = {
        title:       'title',
        description: 'description',
        platform:    'platform',
        plan:        'plan',
        lang:        'lang',
        price:       'price',
        term:        'term',
        botUrl:      'bot_url',
        sourceUrl:   'source_url',
        isVisible:   'is_visible',
        sortOrder:   'sort_order',
    };

    for (const [jsKey, col] of Object.entries(map)) {
        if (updates[jsKey] !== undefined) {
            fields.push(`${col} = $${idx++}`);
            params.push(updates[jsKey]);
        }
    }

    // JSONB fields
    if (updates.screenshots !== undefined) {
        fields.push(`screenshots = $${idx++}`);
        params.push(JSON.stringify(updates.screenshots));
    }
    if (updates.features !== undefined) {
        fields.push(`features = $${idx++}`);
        params.push(JSON.stringify(updates.features));
    }

    if (fields.length === 0) return null;

    params.push(id);
    const result = await db.query(
        `UPDATE portfolio_projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
    );
    return result.rows[0] || null;
}

async function deleteProject(id) {
    const result = await db.query(
        'DELETE FROM portfolio_projects WHERE id = $1 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
}

module.exports = {
    getAllProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
};
