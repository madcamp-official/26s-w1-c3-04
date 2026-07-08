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
  let body = '';
  let thumbnailUrl = null;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockShortsBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { body, thumbnailUrl };

    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. 썸네일 추출 (1순위): OG(Open Graph) 이미지 태그 (가장 정확)
    thumbnailUrl = $('meta[property="og:image"]').attr('content') || null;

    // 2. 본문 텍스트 및 썸네일(2순위) 추출
    for (const selector of BODY_SELECTORS) {
      const el = $(selector);
      if (el.length > 0) {
        // 본문 텍스트 추출
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 50) {
          body = text.slice(0, 4000); // 프롬프트 길이 제한

          // 썸네일 추출 (2순위): 본문 영역의 첫 번째 이미지
          if (!thumbnailUrl) {
            const firstImg = el.find('img').first();
            if (firstImg.length > 0) {
              // 서울경제 등 일부 언론사는 고화질 이미지를 data-z 속성에 저장
              thumbnailUrl = firstImg.attr('data-z') || firstImg.attr('src') || null;
            }
          }

          break; // 찾았으면 루프 종료
        }
      }
    }
    return { body, thumbnailUrl };
  } catch (err) {
    console.error(`[크롤링] 실패 (${url}):`, err.message);
    return { body, thumbnailUrl }; // 에러 발생 시에도 기본값 반환
  }
}

module.exports = { fetchArticleBody };
