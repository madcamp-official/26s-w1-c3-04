const pool = require('../db');

let companyCache = null; // [{id, name, ticker, primary_sector_id}]
let lastLoadedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분마다 갱신 (companies가 자주 안 바뀌므로)

async function loadCompanies() {
  const now = Date.now();
  if (companyCache && now - lastLoadedAt < CACHE_TTL_MS) return companyCache;

  const [rows] = await pool.query('SELECT id, name, ticker FROM `Companies`');
  companyCache = rows;
  lastLoadedAt = now;
  return companyCache;
}

// 기사 텍스트(제목+본문)에서 이름이 등장하는 회사 후보를 찾음
async function findCandidateCompanies(text) {
  const companies = await loadCompanies();
  if (!text) return [];

  return companies.filter((c) => c.name && text.includes(c.name));
}

module.exports = { findCandidateCompanies, loadCompanies };
