// Sectors 테이블에 seed_sectors_autoincrement.sql로 넣은 순서 그대로 id 1~30과 매칭됨.
// (그룹1: 1~5, 그룹2: 6~12, 그룹3: 13~18, 그룹4: 19~23, 그룹5: 24~30)
const SECTOR_TAXONOMY = [
  { id: 1, group: '기술/성장주 섹터', name: '반도체', examples: '삼성전자, SK하이닉스, 소부장' },
  { id: 2, group: '기술/성장주 섹터', name: 'AI/소프트웨어', examples: '네이버, 카카오, 인공지능' },
  { id: 3, group: '기술/성장주 섹터', name: '디스플레이', examples: 'LG디스플레이 등' },
  { id: 4, group: '기술/성장주 섹터', name: '로봇/자동화', examples: '두산로보틱스, 레인보우로보틱스' },
  { id: 5, group: '기술/성장주 섹터', name: '우주항공/위성', examples: '한화에어로스페이스 등' },
  { id: 6, group: '제조/중화학/전통산업', name: '자동차/자율주행', examples: '현대차, 기아, 부품사' },
  { id: 7, group: '제조/중화학/전통산업', name: '2차전지/배터리', examples: 'LG에너지솔루션, 에코프로' },
  { id: 8, group: '제조/중화학/전통산업', name: '조선/해운', examples: 'HD현대중공업, HMM' },
  { id: 9, group: '제조/중화학/전통산업', name: '철강/메탈', examples: '포스코홀딩스, 현대제철' },
  { id: 10, group: '제조/중화학/전통산업', name: '화학/정유', examples: 'LG화학, S-Oil' },
  { id: 11, group: '제조/중화학/전통산업', name: '건설/토목', examples: '현대건설, 대우건설' },
  { id: 12, group: '제조/중화학/전통산업', name: '방위산업', examples: 'K-방산 수주 관련' },
  { id: 13, group: '소비재/문화/트렌드', name: '식품/음료', examples: '삼양식품, 농심, CJ제일제당' },
  { id: 14, group: '소비재/문화/트렌드', name: '엔터테인먼트', examples: '하이브, SM, JYP' },
  { id: 15, group: '소비재/문화/트렌드', name: '화장품/뷰티', examples: '아모레퍼시픽, 코스맥스' },
  { id: 16, group: '소비재/문화/트렌드', name: '게임/웹툰', examples: '크래프톤' },
  { id: 17, group: '소비재/문화/트렌드', name: '패션/의류', examples: 'F&F, 한섬' },
  { id: 18, group: '소비재/문화/트렌드', name: '유통/백화점', examples: '이마트, BGF리테일' },
  { id: 19, group: '보건/바이오/인프라', name: '제약/바이오', examples: '삼성바이오로직스, 셀트리온' },
  { id: 20, group: '보건/바이오/인프라', name: '의료기기/미용기기', examples: '클래시스, 파마리서치' },
  { id: 21, group: '보건/바이오/인프라', name: '신재생에너지', examples: '태양광, 풍력, 수소' },
  { id: 22, group: '보건/바이오/인프라', name: '전력/원자력', examples: '두산에너빌리티, 전선주' },
  { id: 23, group: '보건/바이오/인프라', name: '통신/5G', examples: 'SKT, KT, LGU+' },
  { id: 24, group: '금융/자산/정책', name: '은행/금융지주', examples: 'KB금융, 신한지주' },
  { id: 25, group: '금융/자산/정책', name: '증권/보험', examples: '미래에셋, 삼성화재' },
  { id: 26, group: '금융/자산/정책', name: '지주회사/밸류업', examples: '정부 정책, 주주환원 관련' },
  { id: 27, group: '금융/자산/정책', name: '해외증시/매크로', examples: '미국 금리인하, 뉴욕증시 시황' },
  { id: 28, group: '금융/자산/정책', name: '가상자산/STO', examples: '비트코인 연동주, 토큰증권' },
  { id: 29, group: '금융/자산/정책', name: '원자재/곡물', examples: '금, 구리, 니켈, 국제 유가, 곡물가' },
  { id: 30, group: '금융/자산/정책', name: '기타/공시', examples: '정치 테마 등 일시적 이슈' },
];

// 프롬프트에 넣을 문자열 형태로 변환
function taxonomyAsPromptText() {
  return SECTOR_TAXONOMY.map(
    (s) => `${s.id}. ${s.name} (${s.group}) - 예: ${s.examples}`
  ).join('\n');
}

module.exports = { SECTOR_TAXONOMY, taxonomyAsPromptText };
