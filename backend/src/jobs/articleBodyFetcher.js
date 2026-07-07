const cheerio = require('cheerio');

// 언론사마다 본문이 담긴 태그가 달라서 대표적인 선택자들을 순서대로 시도.
// 실제 페이지 구조 확인 후 이 목록은 계속 다듬어야 함.
const BODY_SELECTORS = [
  '#articletxt', // 한국경제
  '.news_cnt_detail_wrap', // 매일경제류
  '#article-body', // 서울경제류
  'article',
  '.article-body',
  '#newsEndContents',
];

async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockShortsBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';

    const html = await res.text();
    const $ = cheerio.load(html);

    for (const selector of BODY_SELECTORS) {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 50) return text.slice(0, 4000); // 프롬프트 길이 제한
      }
    }
    return ''; // 못 찾으면 빈 문자열 (제목만으로 처리하게 됨)
  } catch (err) {
    console.error(`[크롤링] 실패 (${url}):`, err.message);
    return '';
  }
}

module.exports = { fetchArticleBody };
