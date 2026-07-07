const express = require('express');
const cors = require('cors');
require('dotenv').config();

const deviceAuth = require('./middleware/deviceAuth');
const devicesRouter = require('./routes/devices');
const companiesRouter = require('./routes/companies');
const sectorsRouter = require('./routes/sectors');
const articlesRouter = require('./routes/articles');
const scrapsRouter = require('./routes/scraps');
const { startRssCron, collectAll } = require('./jobs/rssCollector'); // 기사 수집기
const { startTaggingCron, tagPendingArticles } = require('./jobs/articleTagger'); // 기사 태깅/요약기

const app = express();
app.use(cors());
app.use(express.json());

// Day 1 범위: devices / companies / sectors
app.use('/api/devices', deviceAuth, devicesRouter);
app.use('/api/companies', deviceAuth, companiesRouter);
app.use('/api/sectors', deviceAuth, sectorsRouter);
app.use('/api/articles', deviceAuth, articlesRouter);
app.use('/api/scraps', deviceAuth, scrapsRouter);

// 공통 에러 핸들러 (반드시 라우터 등록 이후에 위치)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error_code: 'INTERNAL_ERROR',
    message: '서버 내부 오류가 발생했습니다.',
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // RSS 수집 스케줄러 시작
  startRssCron();
  // (개발 편의를 위해) 서버 시작 시 1회 즉시 실행
  collectAll().catch((err) => console.error('[RSS] 초기 수집 오류:', err));

  // AI 태깅/요약 스케줄러 시작
  startTaggingCron();
  // (개발 편의를 위해) 서버 시작 시 1회 즉시 실행
  tagPendingArticles().catch((err) => console.error('[태깅] 초기 태깅 오류:', err));
});
