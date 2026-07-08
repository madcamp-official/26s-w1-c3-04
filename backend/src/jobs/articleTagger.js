const cron = require('node-cron');
const pool = require('../db');
const { callGemini } = require('../lib/gemini');
const { taxonomyAsPromptText } = require('../lib/sectorTaxonomy');
const { findCandidateCompanies } = require('./companyMatcher');
const { fetchArticleBody } = require('./articleBodyFetcher');

const BATCH_LIMIT = 30;          // 한 번 배치 실행당 처리할 기사 수(전체) — flash-lite 무료 한도로도 충분히 빠르게 처리 가능해서 늘림
const ARTICLES_PER_LLM_CALL = 5; // LLM 호출 한 번에 묶어서 보낼 기사 수 — 호출 횟수 자체를 줄여서 하루/분당 한도를 동시에 아낌

const DELAY_BETWEEN_CALLS_MS = 4500; // 묶음(그룹) 사이 간격 — flash-lite 분당 15회 한도에 맞춘 최소 안전 간격(4초)에 여유를 살짝 더함
const RATE_LIMIT_BACKOFF_MS = 15000; // 429/503 걸리면 이만큼 더 쉬고 재시도
const MAX_RETRIES_PER_GROUP = 2;     // 묶음 하나당 최대 재시도 횟수

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = (err && err.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('503') || msg.includes('quota')
      || msg.includes('rate') || msg.includes('resource_exhausted')
      || msg.includes('unavailable');
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const SYSTEM_PROMPT = `너는 개인 투자자를 위한 경제 뉴스 분석가야. 여러 개의 기사가 한 번에 주어진다. 각 기사마다 아래 항목을 독립적으로 판단해서, 입력받은 기사 개수와 정확히 같은 길이의 JSON 배열로만 응답해. 각 원소에는 반드시 입력에서 준 "id" 값을 그대로 포함해야 한다 (순서가 섞여도 id로 어느 기사인지 알 수 있도록).

[분야 태깅] — 종목 태깅과 완전히 독립적으로, 기사별로 판단한다. 아래 30개 분야 중 그 기사와 가장 관련 있는 것을 최대 2개 고른다.
${taxonomyAsPromptText()}

[종목 태깅 규칙]
- 그 기사에 딸린 후보 종목 목록 중에서만 고른다 (후보 외 이름 사용 금지, 다른 기사의 후보를 섞어 쓰지 않는다)
- 헤드라인·리드문에 등장하고, 사건의 실제 주체인 종목만 최대 2개
- 단순 언급/비교 대상으로만 나온 종목은 제외

[요약 작성 규칙]
- summary_headline: 헤드라인 형태 한 문장. 원 기사 제목을 그대로 베끼지 말고 핵심 사실이 드러나게 다시 쓴다.
- summary_body: 정확히 3문장. 만연체·수식어 남발 금지. "무슨 일이 있었다 → 왜/어떻게 → 지금 어떤 상태인가" 흐름으로, 짧고 단정적인 문장만 쓴다.
- importance_reason: "이 사실 → 그래서 투자자에게 왜 중요한가"를 인과관계 하나로 압축한 한 문장. 방향성 예측(상승/하락, 긍정/부정 영향)은 절대 포함하지 않는다.
  - 금지: "~에 대한 이해를 돕는다", "~통찰을 얻을 수 있다", "~파악하는 데 도움이 된다", "~참고할 만하다", "~시사한다" 같은 두루뭉술한 마무리 문구로 얼버무리지 않는다. 대신 구체적인 메커니즘과 결과를 직접 명시한다.
  - 나쁜 예 (두루뭉술함): "김태우 대표의 리더십 아래 조직 문화 변화와 성과 개선 사례를 통해 인재 관리 전략에 대한 통찰을 얻을 수 있다"
  - 좋은 예 (구체적 인과관계): "장기 성과가 검증된 대표의 조직 개편이 실제 펀드 수익률 개선으로 이어지고 있어, 해당 운용사 상품에 투자한 사람이라면 신뢰도 지표로 참고할 부분"

[응답 JSON 형식 — 배열, 입력 기사 개수와 동일한 길이]
[
  {
    "id": 그 기사의 id (입력에서 받은 값 그대로),
    "sector_ids": [분야 목록에서 최대 2개 숫자 id],
    "subject_companies": ["그 기사의 후보 중 실제 사건의 주체인 회사명, 최대 2개"],
    "summary_headline": "...",
    "summary_body": "...",
    "importance_reason": "..."
  }
]`;

// 기사 그룹 하나(최대 ARTICLES_PER_LLM_CALL개)를 준비 — 본문/후보종목 계산은 병렬로
async function prepareGroup(articles) {
  return Promise.all(
    articles.map(async (article) => {
      const { body, thumbnailUrl } = await fetchArticleBody(article.source_url);
      const candidates = await findCandidateCompanies(`${article.title} ${body}`);
      return { article, body, thumbnailUrl, candidates };
    })
  );
}

function buildGroupPrompt(prepared) {
  return prepared
    .map(({ article, body, candidates }) => {
      const candidateText = candidates.length > 0 ? candidates.map((c) => c.name).join(', ') : '(후보 없음)';
      return `--- 기사 (id: ${article.id}) ---
제목: ${article.title}
언론사: ${article.source_name}
본문: ${body || '(본문을 가져오지 못해 제목만 참고)'}
후보 종목 (이 중에서만 subject_companies를 골라야 함): ${candidateText}`;
    })
    .join('\n\n');
}

async function tagGroup(articles) {
  const prepared = await prepareGroup(articles);
  const userPrompt = buildGroupPrompt(prepared);
  const results = await callGemini(SYSTEM_PROMPT, userPrompt);

  if (!Array.isArray(results)) {
    throw new Error('Gemini 응답이 배열 형태가 아닙니다.');
  }

  for (const result of results) {
    const found = prepared.find((p) => String(p.article.id) === String(result.id));
    if (!found) {
      console.warn(`[태깅] 응답의 id(${result.id})에 해당하는 기사를 못 찾음, 건너뜀`);
      continue;
    }
    const { article, candidates, thumbnailUrl } = found;

    const matched = (result.subject_companies || [])
      .map((name) => candidates.find((c) => c.name === name))
      .filter(Boolean)
      .slice(0, 2);

    const companyId1 = matched[0]?.id ?? null;
    const companyId2 = matched[1]?.id ?? null;

    const sectorIds = (result.sector_ids || []).slice(0, 2);
    const sectorId1 = sectorIds[0] ?? null;
    const sectorId2 = sectorIds[1] ?? null;

    await pool.query(
      `UPDATE \`Articles\` SET
         summary_headline = ?, summary_body = ?, importance_reason = ?, thumbnail_url = ?,
         company_id_1 = ?, company_id_2 = ?, sector_id_1 = ?, sector_id_2 = ?
       WHERE id = ?`,
      [
        result.summary_headline,
        result.summary_body,
        result.importance_reason,
        thumbnailUrl, // 여기에 thumbnailUrl 추가
        companyId1,
        companyId2,
        sectorId1,
        sectorId2,
        article.id,
      ]
    );
    console.log(`[태깅] 완료: ${article.title}`);
  }

  // 혹시 모델이 일부 기사를 응답에서 빠뜨렸으면 로그로 표시 (재시도는 다음 배치 주기에 자동으로 다시 대상이 됨)
  const returnedIds = new Set(results.map((r) => String(r.id)));
  const missing = articles.filter((a) => !returnedIds.has(String(a.id)));
  if (missing.length > 0) {
    console.warn(`[태깅] 응답에서 누락된 기사 ${missing.length}건 (다음 배치에서 재시도됨):`, missing.map((a) => a.id));
  }
}

async function tagGroupWithRetry(articles) {
  let attempt = 0;
  while (true) {
    try {
      await tagGroup(articles);
      return;
    } catch (err) {
      if (isRateLimitError(err) && attempt < MAX_RETRIES_PER_GROUP) {
        attempt += 1;
        console.warn(`[태깅] 요청 제한 감지, ${RATE_LIMIT_BACKOFF_MS / 1000}초 후 그룹 재시도 (${attempt}/${MAX_RETRIES_PER_GROUP})`);
        await sleep(RATE_LIMIT_BACKOFF_MS);
        continue;
      }
      throw err;
    }
  }
}

async function tagPendingArticles() {
  // 아직 태깅 안 된(요약이 비어있는) 기사만 대상으로.
  // published_at 오름차순(오래된 것부터) — 내림차순으로 하면 새 기사가 계속
  // 들어올 때마다 예전에 실패해서 밀린 기사들이 영영 뒤로 밀려나 방치되는
  // 문제가 있어서 이렇게 변경함.
  const [articles] = await pool.query(
    `SELECT id, title, source_name, source_url
     FROM \`Articles\`
     WHERE summary_headline IS NULL
     ORDER BY published_at ASC
     LIMIT ?`,
    [BATCH_LIMIT]
  );

  console.log(`[태깅] 처리 대상 ${articles.length}건`);

  const groups = chunk(articles, ARTICLES_PER_LLM_CALL);
  console.log(`[태깅] ${groups.length}개 그룹으로 묶어서 처리 (그룹당 최대 ${ARTICLES_PER_LLM_CALL}건)`);

  for (const [index, group] of groups.entries()) {
    try {
      await tagGroupWithRetry(group);
    } catch (err) {
      console.error(`[태깅] 그룹 처리 실패:`, err.message);
    }

    if (index < groups.length - 1) {
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }
}

function startTaggingCron() {
  cron.schedule('*/5 * * * *', () => {
    tagPendingArticles().catch((err) => console.error('[태깅] 배치 오류:', err));
  });
  console.log('[태깅] 5분 주기 태깅/요약 스케줄러 등록됨');
}

module.exports = { tagPendingArticles, startTaggingCron };