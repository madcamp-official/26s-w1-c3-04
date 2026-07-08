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

// company_id_1/2, sector_id_1/2 (숫자 원본 id) -> companies[]/sectors[] (중첩 배열, 이름 포함)로 변환.
// rows 안에서 실제 등장한 id만 모아서 딱 필요한 만큼만 조회함 (전체 테이블을 매번 긁지 않음).
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

    // 원본 flat 필드(company_id_1 등)는 응답에서 빼고 companies/sectors로 교체
    const { company_id_1, company_id_2, sector_id_1, sector_id_2, ...rest } = r;
    return { ...rest, companies, sectors };
  });
}

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
      const articles = await attachCompanySectorRefs(rows);

      return res.json({
        articles,
        totalCount: rows.length,
        viewedCount,
        unviewedCount: rows.length - viewedCount,
      });
    }

    if (mode === 'liked') {
      // 좋아요 많은 순 Top N — 홈 화면 햄버거 메뉴 "인기 기사" 패널용
      const limitN = Math.min(Number(limit) || 5, 20);
      const [rows] = await pool.query(
        `SELECT ${ARTICLE_FIELDS}
         FROM \`Articles\` a
         WHERE a.summary_headline IS NOT NULL AND a.like_count > 0
         ORDER BY a.like_count DESC, a.published_at DESC
         LIMIT ?`,
        [req.deviceId, req.deviceId, limitN]
      );
      const articles = await attachCompanySectorRefs(rows);
      return res.json({ articles });
    }

    // mode === 'sector' (기본값): 최신순, 커서 기반 페이지네이션
    const params = [req.deviceId, req.deviceId]; // is_liked, is_scrapped용 device_id
    let where = `a.summary_headline IS NOT NULL
      AND NOT EXISTS(
        SELECT 1 FROM \`Device_Article_Interaction\` viewed
        WHERE viewed.device_id = ?
          AND viewed.article_id = a.id
          AND viewed.interaction_type = 'VIEWED'
      )`;
    params.push(req.deviceId);

    if (sector_id) {
      // 콤마로 여러 개 넘어올 수 있음 (관심분야 토글 on인 것들 전부) — sector_id=1,3,5
      // 주/보조 태그 둘 다 확인 — 두 분야에 걸쳐 태깅된 기사도 정상적으로 포함시킴
      // (프론트에서 sectors[] 전체를 뱃지로 보여줘서, 왜 걸렸는지 알 수 있게 처리함)
      const sectorIds = String(sector_id)
        .split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (sectorIds.length > 0) {
        const placeholders = sectorIds.map(() => '?').join(',');
        where += ` AND (a.sector_id_1 IN (${placeholders}) OR a.sector_id_2 IN (${placeholders}))`;
        params.push(...sectorIds, ...sectorIds);
      }
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
    const pageRows = rows.slice(0, pageSize);
    const nextCursor = hasMore
      ? new Date(pageRows[pageRows.length - 1].published_at).getTime()
      : null;
    const articles = await attachCompanySectorRefs(pageRows);

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

    const [insertResult] = await pool.query(
      `INSERT INTO \`Device_Article_Interaction\` (device_id, article_id, interaction_type, created_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [req.deviceId, articleId, interactionType]
    );

    if (interactionType === 'LIKED' && insertResult.affectedRows === 1) {
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
    const [deleteResult] = await pool.query(
      `DELETE FROM \`Device_Article_Interaction\`
       WHERE device_id = ? AND article_id = ? AND interaction_type = ?`,
      [req.deviceId, articleId, type]
    );

    if (type === 'LIKED' && deleteResult.affectedRows > 0) {
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
