const Parser = require('rss-parser');
const crypto = require('crypto');
const cron = require('node-cron');
const pool = require('../db');
const sources = require('./rssSources');

const parser = new Parser();

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

async function collectFromSource({ sourceName, rssUrl }) {
  let feed;
  try {
    feed = await parser.parseURL(rssUrl);
  } catch (err) {
    console.error(`[RSS] ${sourceName} 수집 실패:`, err.message);
    return;
  }

  for (const item of feed.items) {
    const sourceUrl = item.link;
    if (!sourceUrl) continue;

    const urlHash = hashUrl(sourceUrl);
    const title = (item.title || '').slice(0, 300);
    const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

    try {
      // url_hash UNIQUE 제약이 중복 기사를 자동으로 막아줌
      await pool.query(
        `INSERT INTO \`Articles\`
           (source_name, title, source_url, url_hash, published_at, like_count)
         VALUES (?, ?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE id = id`, // 이미 있으면 아무것도 안 하고 넘어감
        [sourceName, title, sourceUrl, urlHash, new Date(publishedAt)]
      );
    } catch (err) {
      console.error(`[RSS] ${sourceName} 기사 저장 실패 (${sourceUrl}):`, err.message);
    }
  }

  console.log(`[RSS] ${sourceName}: ${feed.items.length}건 처리 완료`);
}

async function collectAll() {
  console.log('[RSS] 수집 시작:', new Date().toISOString());
  for (const source of sources) {
    await collectFromSource(source);
  }
  console.log('[RSS] 수집 완료. 다음 단계(태깅/스코어링/요약)는 별도 배치에서 처리 예정');
}

/**
 * 오래된 기사를 삭제하는 함수
 */
async function deleteOldArticles() {
  const retentionDays = 30; // 30일 이상된 데이터만 보관하고 삭제
  console.log(`[CLEANUP] ${retentionDays}일 이상된 오래된 기사 삭제 시작`);
  try {
    // 오래된 기사와 연관된 인터랙션 기록(좋아요/스크랩 등)을 먼저 삭제
    const [interactionResult] = await pool.query(
      `DELETE i FROM Device_Article_Interaction i JOIN Articles a ON i.article_id = a.id WHERE a.published_at < NOW() - INTERVAL ? DAY`,
      [retentionDays]
    );
    console.log(`[CLEANUP] ${interactionResult.affectedRows}건의 오래된 인터랙션 기록 삭제 완료`);

    // 오래된 기사 본문을 삭제
    const [articleResult] = await pool.query(
      `DELETE FROM \`Articles\` WHERE published_at < NOW() - INTERVAL ? DAY`,
      [retentionDays]
    );
    console.log(`[CLEANUP] ${articleResult.affectedRows}건의 오래된 기사 삭제 완료`);
  } catch (err) {
    console.error('[CLEANUP] 오래된 기사 삭제 중 오류 발생:', err);
  }
}

// 10분 주기 (cron 표현식: 분 시 일 월 요일)
function startRssCron() {
  cron.schedule('*/10 * * * *', () => {
    collectAll().catch((err) => console.error('[RSS] 배치 오류:', err));
  });
  console.log('[RSS] 10분 주기 수집 스케줄러 등록됨');

  // 매일 새벽 4시에 오래된 데이터 삭제 (cron 표현식: 0 4 * * *)
  cron.schedule('0 4 * * *', () => {
    deleteOldArticles().catch((err) => console.error('[CLEANUP] 배치 오류:', err));
  });
  console.log('[CLEANUP] 매일 새벽 4시 오래된 기사 삭제 스케줄러 등록됨');
}

module.exports = { collectAll, startRssCron, deleteOldArticles };
