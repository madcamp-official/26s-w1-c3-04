const express = require('express');
const router = express.Router();
const pool = require('../db');

const { getDailyChart, toPriceSeries } = require('../kis');

// 종목 배열에 현재가/등락률을 병렬로 붙여주는 헬퍼.
// 차트 화면(캔들)과 같은 소스(일자별 시세 API)에서 최신 값을 가져와서,
// "홈 화면 가격"과 "차트 헤더 가격"이 서로 다르게 보이는 걸 방지함.
// output2(일자별 배열)는 여기선 필요 없어서 버리고 output1만 사용.
// KIS 호출이 실패해도 목록 자체는 보여줄 수 있게, 실패한 종목은 null로 채움.
async function attachPrices(companies) {
  return Promise.all(
    companies.map(async (c) => {
      try {
        const result = await getDailyChart(c.ticker, 'D');
        if (result.rt_cd !== '0') {
          throw new Error(result.msg1 || 'KIS API 호출 실패');
        }
        return {
          ...c,
          current_price: Number(result.output1.stck_prpr),
          change_rate: Number(result.output1.prdy_ctrt),
        };
      } catch (err) {
        console.error(`[현재가 조회 실패] ${c.ticker}:`, err.message);
        return { ...c, current_price: null, change_rate: null };
      }
    })
  );
}

// GET /api/companies?q=검색어
// 홈 화면 구독추가 검색, 차트 탭 기업검색 둘 다 이 API를 그대로 쓰고,
// 화면 UI만 다르게 배치(홈은 구독버튼, 차트는 클릭시 선택)하는 것으로 통일함.
// 검색 결과 자체엔 가격을 안 붙임(KIS 호출 없이 DB 조회만) — 가격/등락률은
// "구독 중인 기업"/"최근 본 항목"처럼 개수가 정해진 목록에서만 보여주기로 함.
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
      `SELECT c.id, c.name, c.ticker, c.logo_url, s.subscribed_at,
              EXISTS(
                SELECT 1
                FROM \`Articles\` a
                LEFT JOIN \`Story_view_logs\` sv
                  ON sv.device_id = s.device_id AND sv.company_id = c.id
                WHERE (a.company_id_1 = c.id OR a.company_id_2 = c.id)
                  AND a.summary_headline IS NOT NULL
                  AND a.published_at >= NOW() - INTERVAL 24 HOUR
                  AND (
                    sv.last_viewed_article_id IS NULL
                    OR a.id > sv.last_viewed_article_id
                  )
              ) AS has_unread
       FROM \`User_Company_Subscription\` s
       JOIN \`Companies\` c ON c.id = s.company_id
       WHERE s.device_id = ?
       ORDER BY s.subscribed_at DESC`,
      [req.deviceId]
    );
    const companies = await attachPrices(rows);
    res.json({ companies });
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/prices?tickers=005930,000660,373220
// 여러 종목의 현재가/등락률을 한 번에 갱신 조회 (홈/차트 화면에서 주기적으로 호출해서
// 이미 화면에 떠있는 종목들 가격을 실시간에 가깝게 계속 새로고침하는 용도)
router.get('/prices', async (req, res, next) => {
  const { tickers } = req.query;
  if (!tickers) {
    return res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'tickers 파라미터가 필요합니다.',
    });
  }

  const tickerList = String(tickers).split(',').map(t => t.trim()).filter(Boolean);
  if (tickerList.length === 0) {
    return res.json({ companies: [] });
  }

  try {
    const placeholders = tickerList.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, name, ticker, logo_url FROM \`Companies\` WHERE ticker IN (${placeholders})`,
      tickerList
    );
    const companies = await attachPrices(rows);
    res.json({ companies });
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

// GET /api/companies/:id/chart (일봉 고정)
router.get('/:id/chart', async (req, res, next) => {
  const companyId = req.params.id;

  try {
    const [companyRows] = await pool.query(
      'SELECT id, name, ticker FROM `Companies` WHERE id = ?',
      [companyId]
    );
    if (companyRows.length === 0) {
      return res.status(404).json({
        error_code: 'RESOURCE_NOT_FOUND',
        message: '존재하지 않는 종목입니다.',
      });
    }
    const company = companyRows[0];

    const kisResult = await getDailyChart(company.ticker);
    if (kisResult.rt_cd !== '0') {
      return res.status(502).json({
        error_code: 'EXTERNAL_API_ERROR',
        message: kisResult.msg1 || 'KIS API 호출 실패',
      });
    }

    const priceSeries = toPriceSeries(kisResult.output2);
    const latest = kisResult.output1;

    // 최근 본 항목 기록
    await pool.query(
      `INSERT INTO \`Device_Company_View_Logs\` (device_id, company_id, last_viewed_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_viewed_at = NOW()`,
      [req.deviceId, companyId]
    );

    res.json({
      company_id: Number(companyId),
      ticker: company.ticker,
      current_price: Number(latest.stck_prpr),
      change_rate: Number(latest.prdy_ctrt),
      price_series: priceSeries,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
