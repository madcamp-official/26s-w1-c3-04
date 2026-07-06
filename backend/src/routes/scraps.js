const express = require('express');
const router = express.Router();
const pool = require('../db');

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
      `SELECT a.id, a.thumbnail_url, a.summary_headline,
              a.company_id_1, a.company_id_2, a.sector_id_1, a.sector_id_2,
              i.created_at AS scrapped_at -- 스크랩한 시간을 기준으로 정렬하기 위해 별칭 부여
       FROM \`Device_Article_Interaction\` i
       JOIN \`Articles\` a ON a.id = i.article_id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT ?`,
      [...params, pageSize + 1]
    );

    const hasMore = rows.length > pageSize;
    const articles = rows.slice(0, pageSize);
    const nextCursor = hasMore ? new Date(articles[articles.length - 1].scrapped_at).getTime() : null;

    res.json({ articles, nextCursor, hasMore });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
