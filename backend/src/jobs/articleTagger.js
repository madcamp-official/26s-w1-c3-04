const cron = require('node-cron');
const pool = require('../db');
const { callGemini } = require('../lib/gemini');
const { taxonomyAsPromptText } = require('../lib/sectorTaxonomy');
const { findCandidateCompanies } = require('./companyMatcher');
const { fetchArticleBody } = require('./articleBodyFetcher');

const BATCH_LIMIT = 20; // 한 번 배치 실행당 처리할 기사 수

const SYSTEM_PROMPT = `너는 개인 투자자를 위한 경제 뉴스 분석가야. 기사를 읽고 아래를 판단해서 JSON으로만 응답해.

[분야 태깅] — 종목 태깅과 완전히 독립적으로 판단한다. 기사 내용을 읽고 아래 30개 분야 중 가장 관련 있는 것을 최대 2개 고른다 (종목이 뭐가 태깅됐는지와 상관없이, 기사 주제 자체로 판단).
${taxonomyAsPromptText()}

[종목 태깅 규칙]
- 주어진 후보 종목 목록 중에서만 고른다 (후보 외 이름 사용 금지)
- 헤드라인·리드문에 등장하고, 사건의 실제 주체인 종목만 최대 2개
- 단순 언급/비교 대상으로만 나온 종목은 제외

[요약 작성 규칙]
- summary_headline: 헤드라인 형태 한 문장
- summary_body: 3~4문장 요약
- importance_reason: "왜 투자자가 이 기사를 알아야 하는지" 맥락과 인과관계만 설명. 방향성 예측(상승/하락, 긍정/부정 영향)은 절대 포함하지 않는다.

[응답 JSON 형식]
{
  "sector_ids": [분야 목록에서 최대 2개 숫자 id],
  "subject_companies": ["후보 중 실제 사건의 주체인 회사명, 최대 2개"],
  "summary_headline": "...",
  "summary_body": "...",
  "importance_reason": "..."
}`;

async function tagOneArticle(article) {
  const body = await fetchArticleBody(article.source_url);
  const textForMatching = `${article.title} ${body}`;
  const candidates = await findCandidateCompanies(textForMatching);

  const userPrompt = `제목: ${article.title}
언론사: ${article.source_name}
본문: ${body || '(본문을 가져오지 못해 제목만 참고)'}

후보 종목 목록 (이 중에서만 subject_companies를 골라야 함, 후보 외 이름 사용 금지): ${
    candidates.length > 0 ? candidates.map((c) => c.name).join(', ') : '(후보 없음)'
  }`;

  const result = await callGemini(SYSTEM_PROMPT, userPrompt);

  // subject_companies 이름 -> candidates에서 id 조회
  const matched = (result.subject_companies || [])
    .map((name) => candidates.find((c) => c.name === name))
    .filter(Boolean)
    .slice(0, 2);

  const companyId1 = matched[0]?.id ?? null;
  const companyId2 = matched[1]?.id ?? null;

  // 분야는 종목과 완전히 독립적으로, AI가 고른 것 그대로 사용
  const sectorIds = (result.sector_ids || []).slice(0, 2);
  const sectorId1 = sectorIds[0] ?? null;
  const sectorId2 = sectorIds[1] ?? null;

  await pool.query(
    `UPDATE \`Articles\` SET
       summary_headline = ?, summary_body = ?, importance_reason = ?,
       company_id_1 = ?, company_id_2 = ?, sector_id_1 = ?, sector_id_2 = ?
     WHERE id = ?`,
    [
      result.summary_headline,
      result.summary_body,
      result.importance_reason,
      companyId1,
      companyId2,
      sectorId1,
      sectorId2,
      article.id,
    ]
  );
}

async function tagPendingArticles() {
  // 아직 태깅 안 된(요약이 비어있는) 기사만 대상으로
  const [articles] = await pool.query(
    `SELECT id, title, source_name, source_url
     FROM \`Articles\`
     WHERE summary_headline IS NULL
     ORDER BY published_at DESC
     LIMIT ?`,
    [BATCH_LIMIT]
  );

  console.log(`[태깅] 처리 대상 ${articles.length}건`);

  for (const article of articles) {
    try {
      await tagOneArticle(article);
      console.log(`[태깅] 완료: ${article.title}`);
    } catch (err) {
      console.error(`[태깅] 실패 (id=${article.id}):`, err.message);
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
