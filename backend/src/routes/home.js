const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/home
router.get('/', async (req, res, next) => {
  try {
    // 1) 구독 기업 스토리 레일 (안 읽음 = 빨간 테두리)
    const [stories] = await pool.query(
      `SELECT c.id AS company_id, c.name, c.logo_url,
              EXISTS (
                SELECT 1 FROM \`Articles\` a
                WHERE (a.company_id_1 = c.id OR a.company_id_2 = c.id)
                  AND a.published_at >= NOW() - INTERVAL 24 HOUR
                  AND a.id > COALESCE(sv.last_viewed_article_id, 0)
              ) AS has_unread
       FROM \`User_Company_Subscription\` ucs
       JOIN \`Companies\` c ON c.id = ucs.company_id
       LEFT JOIN \`Story_view_logs\` sv
              ON sv.device_id = ucs.device_id AND sv.company_id = c.id
       WHERE ucs.device_id = ?
       ORDER BY ucs.subscribed_at DESC`,
      [req.deviceId]
    );

    // 2) 오늘의 주요 뉴스 헤드라인 (스코어링이 없어졌으니 최신순으로 대체)
    const [headlines] = await pool.query(
      `SELECT id, summary_headline, thumbnail_url, source_name, published_at
       FROM \`Articles\`
       WHERE summary_headline IS NOT NULL
       ORDER BY published_at DESC
       LIMIT 10`
    );

    // 3) 요약 카드(지수/관심기업 등락률+스파크라인) — 차트/KIS API 연동 후 채울 자리
    const summaryCards = [];

    res.json({
      stories: stories.map((s) => ({
        companyId: s.company_id,
        name: s.name,
        logoUrl: s.logo_url,
        hasUnread: !!s.has_unread,
      })),
      summaryCards,
      topHeadlines: headlines,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
