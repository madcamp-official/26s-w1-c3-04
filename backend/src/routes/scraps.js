const express = require('express');
const router = express.Router();
const pool = require('../db');

async function attachCompanySectorRefs(rows) {
  const companyIds = new Set();
  const sectorIds = new Set();
  for (const r of rows) {
    if (r.company_id_1) companyIds.add(r.company_id_1);
    if (r.company_id_2) companyIds.add(r.company_id_2);
    if (r.sector_id_1) sectorIds.add(r.sector_id_1);
    if (r.sector_id_2) sectorIds.add(r.sector_id_2);
  }

  const companyMap = new Map();
  if (companyIds.size > 0) {
    const [companies] = await pool.query(
      'SELECT id, name, ticker FROM `Companies` WHERE id IN (?)',
      [[...companyIds]]
    );
    companies.forEach(c => companyMap.set(c.id, { id: c.ticker, name: c.name }));
  }

  const sectorMap = new Map();
  if (sectorIds.size > 0) {
    const [sectors] = await pool.query(
      'SELECT id, name FROM `Sectors` WHERE id IN (?)',
      [[...sectorIds]]
    );
    sectors.forEach(s => sectorMap.set(s.id, { id: String(s.id), name: s.name }));
  }

  return rows.map(r => {
    const companies = [r.company_id_1, r.company_id_2]
      .filter(Boolean)
      .map(id => companyMap.get(id))
      .filter(Boolean);
    const sectors = [r.sector_id_1, r.sector_id_2]
      .filter(Boolean)
      .map(id => sectorMap.get(id))
      .filter(Boolean);

    const { company_id_1, company_id_2, sector_id_1, sector_id_2, ...rest } = r;
    return { ...rest, companies, sectors, is_scrapped: true };
  });
}

// GET /api/scraps
router.get('/', async (req, res, next) => {
  const { cursor, limit } = req.query;
  const pageSize = Math.min(Number(limit) || 20, 50);

  try {
    const params = [req.deviceId];
    let where = `i.device_id = ? AND i.interaction_type = 'SCRAPPED'`;

    if (cursor) {
      // cursor는 마지막으로 본 항목의 scrapped_at (timestamp)
      where += ' AND i.created_at < ?';
      params.push(new Date(Number(cursor)));
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.source_name, a.title, a.source_url, a.thumbnail_url,
              a.summary_headline, a.summary_body, a.importance_reason,
              a.like_count,
              EXISTS(SELECT 1 FROM \`Device_Article_Interaction\` liked WHERE liked.device_id = ? AND liked.article_id = a.id AND liked.interaction_type = 'LIKED') AS is_liked,
              a.company_id_1, a.company_id_2, a.sector_id_1, a.sector_id_2,
              a.published_at,
              i.created_at AS scrapped_at
       FROM \`Device_Article_Interaction\` i
       JOIN \`Articles\` a ON a.id = i.article_id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT ?`,
      [req.deviceId, ...params, pageSize + 1]
    );

    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);
    const articles = await attachCompanySectorRefs(pageRows);
    const nextCursor = hasMore ? new Date(pageRows[pageRows.length - 1].scrapped_at).getTime() : null;

    res.json({ articles, nextCursor, hasMore });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
