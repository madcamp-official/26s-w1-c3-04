const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/companies?q=검색어
router.get('/', async (req, res, next) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'q 파라미터가 필요합니다.',
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.ticker, c.logo_url,
              EXISTS(
                SELECT 1 FROM \`User_Company_Subscription\` s
                WHERE s.device_id = ? AND s.company_id = c.id
              ) AS is_subscribed
       FROM \`Companies\` c
       WHERE c.name LIKE ? OR c.ticker LIKE ?
       LIMIT 20`,
      [req.deviceId, `%${q}%`, `%${q}%`]
    );
    res.json({ companies: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/subscriptions (내가 구독 중인 종목 목록)
router.get('/subscriptions', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         c.id, c.name, c.ticker, c.logo_url,
         -- 이 회사의 24시간 내 기사 중, 마지막으로 본 기사 ID보다 더 큰 ID(최신)를 가진 기사가 있으면 true
         EXISTS(
           SELECT 1 FROM \`Articles\` a
           WHERE (a.company_id_1 = c.id OR a.company_id_2 = c.id)
             AND a.published_at >= NOW() - INTERVAL 24 HOUR
             AND a.id > (
               SELECT IFNULL(MAX(svl.last_viewed_article_id), 0)
               FROM \`Story_view_logs\` svl
               WHERE svl.device_id = s.device_id AND svl.company_id = c.id
             )
         ) AS has_unread
       FROM \`User_Company_Subscription\` s
       JOIN \`Companies\` c ON c.id = s.company_id
       WHERE s.device_id = ?
       ORDER BY s.subscribed_at DESC`,
      [req.deviceId]
    );
    res.json({ companies: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:id/subscriptions (구독 추가)
router.post('/:id/subscriptions', async (req, res, next) => {
  const companyId = req.params.id;
  try {
    const [company] = await pool.query(
      'SELECT id FROM `Companies` WHERE id = ?',
      [companyId]
    );
    if (company.length === 0) {
      return res.status(404).json({
        error_code: 'RESOURCE_NOT_FOUND',
        message: '존재하지 않는 종목입니다.',
      });
    }

    await pool.query(
      `INSERT INTO \`User_Company_Subscription\` (device_id, company_id, subscribed_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE subscribed_at = subscribed_at`,
      [req.deviceId, companyId]
    );

    res.status(201).json({
      companyId: Number(companyId),
      subscribedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/companies/:id/subscriptions (구독 해제)
router.delete('/:id/subscriptions', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM `User_Company_Subscription` WHERE device_id = ? AND company_id = ?',
      [req.deviceId, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies/:id/story-views (스토리 진입 시 읽음 처리 -> 홈 화면 빨간 테두리 해제)
router.post('/:id/story-views', async (req, res, next) => {
  const { articleId } = req.body;
  if (!articleId) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'articleId가 필요합니다.',
    });
  }

  try {
    await pool.query(
      `INSERT INTO \`Story_view_logs\` (device_id, company_id, last_viewed_article_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_viewed_article_id = VALUES(last_viewed_article_id)`,
      [req.deviceId, req.params.id, articleId]
    );
    res.json({ companyId: Number(req.params.id), lastViewedArticleId: Number(articleId) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
