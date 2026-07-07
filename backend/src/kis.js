require('dotenv').config();

let cachedToken = null;
let tokenExpiresAt = 0;

// 접근토큰 발급 (1분당 1회 제한 있어서, 이미 유효한 토큰 있으면 재사용)
async function getAccessToken() {
  console.log('현재 사용 중인 KIS_BASE_URL:', process.env.KIS_BASE_URL);
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
  // expires_in은 보통 초 단위. 여유 두고 5분 일찍 만료 처리
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// 국내주식기간별시세 조회
async function getDailyChart(ticker, periodCode = 'D') {
  const token = await getAccessToken();

  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');
  const startDateObj = new Date(today);
  startDateObj.setDate(startDateObj.getDate() - 30);
  const startDate = startDateObj.toISOString().slice(0, 10).replace(/-/g, '');

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: periodCode, // D=일, W=주, M=월
    FID_ORG_ADJ_PRC: '1',
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
  return data;
}

module.exports = { getAccessToken, getDailyChart };

// kis.js에 추가
function toPriceSeries(kisOutput2) {
  // KIS는 최신순으로 주므로, 프론트에서 쓰기 편하게 날짜 오름차순으로 뒤집음
  return [...kisOutput2].reverse().map(d => ({
    time: `${d.stck_bsop_date.slice(0,4)}-${d.stck_bsop_date.slice(4,6)}-${d.stck_bsop_date.slice(6,8)}`,
    open: Number(d.stck_oprc),
    high: Number(d.stck_hgpr),
    low: Number(d.stck_lwpr),
    close: Number(d.stck_clpr),
    volume: Number(d.acml_vol),
  }));
}

module.exports = { getAccessToken, getDailyChart, toPriceSeries };