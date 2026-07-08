require('dotenv').config();

let cachedToken = null;
let tokenExpiresAt = 0;

// ─── 5분 캐시 저장소 설정 ──────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000; // 5분을 밀리초(ms)로 환산
const chartCache = new Map();    // 차트 데이터 캐시
const priceCache = new Map();    // 현재가/등락률 캐시

// 접근토큰 발급
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${process.env.KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`토큰 발급 실패: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// 국내주식 일봉 차트 조회 (5분 캐싱 적용)
async function getDailyChart(ticker) {
  const now = Date.now();
  const cached = chartCache.get(ticker);

  // 1. 캐시가 존재하고 아직 5분이 지나지 않았다면 API 호출 없이 즉시 반환
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  // 2. 캐시가 없거나 만료되었다면 KIS API 새로 호출
  const token = await getAccessToken();
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  const startDateObj = new Date(today);
  startDateObj.setDate(startDateObj.getDate() - 60);
  const startDate = startDateObj.toISOString().slice(0, 10).replace(/-/g, '');

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: 'D',
    FID_ORG_ADJ_PRC: '0',     // 무조건 수정주가(0) 고정
  });

  const res = await fetch(
    `${process.env.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: 'FHKST03010100',
      },
    }
  );

  const data = await res.json();

  // 3. 정상 응답일 경우에만 캐시 저장소에 5분 유효기간과 함께 저장
  if (data.rt_cd === '0') {
    chartCache.set(ticker, { data, expiresAt: now + CACHE_TTL });
  }

  return data;
}

// 응답 데이터 포맷 변환
function toPriceSeries(kisOutput2) {
  if (!kisOutput2 || !Array.isArray(kisOutput2)) return [];

  return [...kisOutput2].reverse().map(d => ({
    time: `${d.stck_bsop_date.slice(0, 4)}-${d.stck_bsop_date.slice(4, 6)}-${d.stck_bsop_date.slice(6, 8)}`,
    open: Number(d.stck_oprc),
    high: Number(d.stck_hgpr),
    low: Number(d.stck_lwpr),
    close: Number(d.stck_clpr),
    volume: Number(d.acml_vol),
  }));
}

// 등락률(전일 종가 대비, %) 직접 계산 — output1.prdy_ctrt 필드를 그대로 믿었더니
// 종목과 무관하게 계속 0.0%만 나오는 문제가 있어서(이 API의 prdy_ctrt는 신뢰도가 낮은 걸로 보임),
// 우리가 이미 갖고 있는 일별 시세(output2)에서 최근 두 거래일 종가로 직접 계산함
function computeChangeRate(priceSeries) {
  if (!priceSeries || priceSeries.length < 2) return null;
  const last = priceSeries[priceSeries.length - 1];
  const prev = priceSeries[priceSeries.length - 2];
  if (!prev.close) return null;
  return ((last.close - prev.close) / prev.close) * 100;
}

// 주식현재가 시세 (5분 캐싱 적용)
async function getCurrentPrice(ticker) {
  const now = Date.now();
  const cached = priceCache.get(ticker);

  // 1. 캐시 확인
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  // 2. KIS API 호출
  const token = await getAccessToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
  });

  const res = await fetch(
    `${process.env.KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY,
        appsecret: process.env.KIS_APP_SECRET,
        tr_id: 'FHKST01010100',
      },
    }
  );

  const data = await res.json();
  if (data.rt_cd !== '0') {
    throw new Error(data.msg1 || 'KIS 현재가 조회 실패');
  }

  const result = {
    current_price: Number(data.output.stck_prpr),
    change_rate: Number(data.output.prdy_ctrt),
  };

  // 3. 파싱 완료된 값을 캐시에 저장
  priceCache.set(ticker, { data: result, expiresAt: now + CACHE_TTL });

  return result;
}

module.exports = { getAccessToken, getDailyChart, toPriceSeries, computeChangeRate, getCurrentPrice };
