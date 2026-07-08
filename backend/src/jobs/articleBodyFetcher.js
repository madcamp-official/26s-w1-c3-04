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

// 이미지 태그가 실제 이미지 URL을 어느 속성에 담아두는지는 언론사마다 다름 —
// 특히 지연로딩(lazy-load)을 쓰는 곳은 src에 1x1 placeholder를 넣고 진짜 주소는
// data-* 속성에 넣어두는 경우가 많아서, 우선순위대로 다 확인함.
const IMG_ATTR_CANDIDATES = ['data-z', 'data-src', 'data-original', 'data-lazy-src', 'src'];

// 로고/아이콘/광고 배너처럼 기사 사진이 아닐 게 뻔한 이미지는 후보에서 제외
const JUNK_IMG_PATTERN = /(logo|icon|sprite|blank|pixel|1x1|banner|btn_|ico_)/i;

function pickImgSrc($img) {
  for (const attr of IMG_ATTR_CANDIDATES) {
    const val = $img.attr(attr);
    if (val && val.trim() && !val.trim().startsWith('data:')) return val.trim();
  }
  return null;
}

// 상대경로("/img/a.jpg")로 오는 경우 프론트 브라우저 기준으로는 깨진 링크가 되므로,
// 원문 기사 URL을 기준으로 항상 절대 URL로 변환해서 저장함.
function resolveUrl(src, baseUrl) {
  if (!src) return null;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

async function fetchArticleBody(url) {
  let body = '';
  let thumbnailUrl = null;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockShortsBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { body, thumbnailUrl };

    // 리다이렉트가 있었을 수 있으니, 상대경로 이미지는 최종 도착 URL 기준으로 풀어야 함
    const baseUrl = res.url || url;
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. 썸네일 추출 (1순위): OG/트위터 카드 메타태그 — 여러 변형을 순서대로 시도
    const metaCandidates = [
      $('meta[property="og:image"]').attr('content'),
      $('meta[property="og:image:secure_url"]').attr('content'),
      $('meta[name="twitter:image"]').attr('content'),
      $('meta[name="twitter:image:src"]').attr('content'),
    ];
    const metaImage = metaCandidates.find((v) => v && v.trim());
    thumbnailUrl = resolveUrl(metaImage, baseUrl);

    // 2. 본문 텍스트 및 썸네일(2순위) 추출 — 알려진 선택자들을 순서대로 시도
    let matchedBodyEl = null;
    for (const selector of BODY_SELECTORS) {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 50) {
          body = text.slice(0, 4000); // 프롬프트 길이 제한
          matchedBodyEl = el;
          break; // 본문을 찾았으면 루프 종료
        }
      }
    }

    // 본문 영역을 찾았으면 그 안의 첫 번째(쓸만한) 이미지를 썸네일 2순위 후보로 사용
    if (!thumbnailUrl && matchedBodyEl) {
      matchedBodyEl.find('img').each((_, imgEl) => {
        if (thumbnailUrl) return false; // 이미 찾았으면 중단
        const $img = $(imgEl);
        const src = pickImgSrc($img);
        if (src && !JUNK_IMG_PATTERN.test(src)) {
          thumbnailUrl = resolveUrl(src, baseUrl);
        }
      });
    }

    // 3. 그래도 못 찾았으면(선택자가 이 사이트 구조랑 안 맞는 경우 등) — 페이지 전체에서
    // 로고/아이콘류가 아닌 첫 번째 이미지를 최후 후보로 사용. 완전 무관한 이미지가 걸릴
    // 위험은 있지만, 썸네일 없음보다는 나은 경우가 많음.
    if (!thumbnailUrl) {
      $('img').each((_, imgEl) => {
        if (thumbnailUrl) return false;
        const $img = $(imgEl);
        const src = pickImgSrc($img);
        if (!src || JUNK_IMG_PATTERN.test(src)) return;
        const resolved = resolveUrl(src, baseUrl);
        if (resolved) thumbnailUrl = resolved;
      });
    }

    return { body, thumbnailUrl };
  } catch (err) {
    console.error(`[크롤링] 실패 (${url}):`, err.message);
    return { body, thumbnailUrl }; // 에러 발생 시에도 기본값 반환
  }
}

module.exports = { fetchArticleBody };
