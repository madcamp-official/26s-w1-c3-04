const express = require('express');
const router = express.Router();
const pool = require('../db');

const ARTICLE_FIELDS = `
  a.id, a.source_name, a.title, a.source_url, a.thumbnail_url,
  a.summary_headline, a.summary_body, a.importance_reason,
  a.like_count,
  EXISTS(SELECT 1 FROM \`Device_Article_Interaction\` i WHERE i.device_id = ? AND i.article_id = a.id AND i.interaction_type = 'LIKED') as is_liked,
  EXISTS(SELECT 1 FROM \`Device_Article_Interaction\` i WHERE i.device_id = ? AND i.article_id = a.id AND i.interaction_type = 'SCRAPPED') as is_scrapped,
  a.company_id_1, a.company_id_2, a.sector_id_1, a.sector_id_2, a.published_at
`;

// GET /api/articles?mode=sector&sector_id=1&cursor=&limit=10
// GET /api/articles?mode=story&company_id=5
router.get('/', async (req, res, next) => {
  const { mode, sector_id, company_id, cursor, limit } = req.query;
  const pageSize = Math.min(Number(limit) || 10, 30);

  try {
    if (mode === 'story') {
      if (!company_id) {
        return res.status(400).json({
          error_code: 'VALIDATION_ERROR',
          message: 'company_id가 필요합니다.',
        });
      }

      // 24시간 이내, 오래된 것부터(오름차순) - 인스타 스토리 방식
      const [rows] = await pool.query(
        `SELECT ${ARTICLE_FIELDS},
                EXISTS( -- is_viewed는 이 쿼리에서만 필요
                  SELECT 1 FROM \`Device_Article_Interaction\` i
                  WHERE i.device_id = ? AND i.article_id = a.id AND i.interaction_type = 'VIEWED'
                ) AS is_viewed
         FROM \`Articles\` a
         WHERE (a.company_id_1 = ? OR a.company_id_2 = ?)
           AND a.summary_headline IS NOT NULL
           AND a.published_at >= NOW() - INTERVAL 24 HOUR
         ORDER BY a.published_at ASC`,
        [req.deviceId, req.deviceId, req.deviceId, company_id, company_id]
      );

      const viewedCount = rows.filter((r) => r.is_viewed).length;

      return res.json({
        articles: rows,
        totalCount: rows.length,
        viewedCount,
        unviewedCount: rows.length - viewedCount,
      });
    }

    // mode === 'sector' (기본값): 최신순, 커서 기반 페이지네이션
    const params = [req.deviceId, req.deviceId]; // is_liked, is_scrapped용 device_id
    let where = 'a.summary_headline IS NOT NULL';

    if (sector_id) {
      where += ' AND (a.sector_id_1 = ? OR a.sector_id_2 = ?)';
      params.push(Number(sector_id), Number(sector_id));
    }
    if (cursor) {
      where += ' AND a.published_at < ?';
      params.push(new Date(Number(cursor)));
    }

    const [rows] = await pool.query( // pageSize + 1개를 가져와서 다음 페이지 유무 확인
      `SELECT ${ARTICLE_FIELDS}
       FROM \`Articles\` a
       WHERE ${where}
       ORDER BY a.published_at DESC
       LIMIT ?`,
      [...params, pageSize + 1]
    );

    const hasMore = rows.length > pageSize;
    const articles = rows.slice(0, pageSize);
    const nextCursor = hasMore
      ? new Date(articles[articles.length - 1].published_at).getTime()
      : null;

    res.json({ articles, nextCursor, hasMore });
  } catch (err) {
    next(err);
  }
});

// POST /api/articles/:id/interactions  { interactionType: 'VIEWED' | 'LIKED' | 'SCRAPPED' }
router.post('/:id/interactions', async (req, res, next) => {
  const { interactionType } = req.body;
  const articleId = req.params.id;

  if (!['VIEWED', 'LIKED', 'SCRAPPED'].includes(interactionType)) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'interactionType은 VIEWED, LIKED, SCRAPPED 중 하나여야 합니다.',
    });
  }

  try {
    const [article] = await pool.query('SELECT id FROM `Articles` WHERE id = ?', [articleId]);
    if (article.length === 0) {
      return res.status(404).json({
        error_code: 'RESOURCE_NOT_FOUND',
        message: '존재하지 않는 기사입니다.',
      });
    }

    await pool.query(
      `INSERT INTO \`Device_Article_Interaction\` (device_id, article_id, interaction_type, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [req.deviceId, articleId, interactionType]
    );

    if (interactionType === 'LIKED') {
      await pool.query('UPDATE `Articles` SET like_count = like_count + 1 WHERE id = ?', [
        articleId,
      ]);
    }

    res.status(201).json({
      articleId: Number(articleId),
      interactionType,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/articles/:id/interactions/:type  (LIKED, SCRAPPED만 취소 가능)
router.delete('/:id/interactions/:type', async (req, res, next) => {
  const { type } = req.params;
  const articleId = req.params.id;

  if (type === 'VIEWED') {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'VIEWED는 취소할 수 없습니다.',
    });
  }

  try {
    await pool.query(
      `DELETE FROM \`Device_Article_Interaction\`
       WHERE device_id = ? AND article_id = ? AND interaction_type = ?`,
      [req.deviceId, articleId, type]
    );

    if (type === 'LIKED') {
      await pool.query(
        'UPDATE `Articles` SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?',
        [articleId]
      );
    }

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
