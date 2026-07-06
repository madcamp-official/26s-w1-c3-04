// ─────────────────────────────────────────────────────────────────────────
// API 명세서(GET /articles, GET /companies, GET /sectors, GET /companies/{id}/chart)
// 응답 구조를 그대로 반영한 목업 데이터입니다.
//
// 나중에 진짜 백엔드가 준비되면, 이 파일의 MOCK_ARTICLES / MOCK_COMPANIES /
// MOCK_SECTOR_GROUPS 를 실제 fetch() 결과로 바꿔치기만 하면 됩니다.
// (필드명이 API 응답과 동일하므로 컴포넌트 코드는 그대로 재사용 가능)
// ─────────────────────────────────────────────────────────────────────────

// ─── API 응답 타입 ──────────────────────────────────────────────────────────
export interface ApiCompanyRef {
  id: string; // ticker를 식별자로 사용 (예: "005930")
  name: string;
}
export interface ApiSectorRef {
  id: string;
  name: string;
}
export interface ApiArticle {
  id: number;
  source_name: string;
  title: string;
  source_url: string;
  thumbnail_url: string;
  summary_headline: string;
  summary_body: string;
  importance_reason: string;
  like_count: number;
  is_liked: boolean;
  is_scrapped: boolean;
  companies: ApiCompanyRef[]; // 최대 2개
  sectors: ApiSectorRef[]; // 최대 2개
  published_at: string; // ISO 8601
}
export interface ApiCompany {
  id: string; // ticker
  name: string;
  ticker: string;
  logo_url: string | null;
  is_subscribed: boolean;
  current_price: number;
  change_rate: number; // % 단위, 예: 5.8, -1.4
}
export interface ApiSectorItem {
  id: string;
  name: string;
  is_on: boolean;
}
export interface ApiSectorGroup {
  group_name: string;
  emoji: string; // API엔 없는 값, 프론트에서 group_name 기준으로 매핑
  sectors: ApiSectorItem[];
}
export interface ApiPricePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── 목업: 종목 ──────────────────────────────────────────────────────────────
export const MOCK_COMPANIES: ApiCompany[] = [
  { id: "005930", name: "삼성전자", ticker: "005930", logo_url: null, is_subscribed: true, current_price: 77400, change_rate: 5.8 },
  { id: "000660", name: "SK하이닉스", ticker: "000660", logo_url: null, is_subscribed: true, current_price: 198500, change_rate: 3.2 },
  { id: "373220", name: "LG에너지솔루션", ticker: "373220", logo_url: null, is_subscribed: true, current_price: 412000, change_rate: -1.4 },
  { id: "005380", name: "현대차", ticker: "005380", logo_url: null, is_subscribed: true, current_price: 248000, change_rate: 1.1 },
  { id: "035420", name: "NAVER", ticker: "035420", logo_url: null, is_subscribed: true, current_price: 182300, change_rate: -0.6 },
  { id: "035720", name: "카카오", ticker: "035720", logo_url: null, is_subscribed: false, current_price: 52800, change_rate: 0.4 },
  { id: "051910", name: "LG화학", ticker: "051910", logo_url: null, is_subscribed: false, current_price: 392000, change_rate: -2.1 },
  { id: "006400", name: "삼성SDI", ticker: "006400", logo_url: null, is_subscribed: false, current_price: 328500, change_rate: -1.8 },
];

export const INIT_RECENT_COMPANY_IDS = ["005930", "000660", "373220"];
export const INIT_READ_COMPANY_IDS = ["000660", "005380"];

// ─── 목업: 분야 (대분류 5개, backend-seed_sectors.sql 기준) ────────────────
// 세부분야 30개는 그대로, 그룹 배정만 실제 DB 시드 데이터와 일치시킴
export const MOCK_SECTOR_GROUPS: ApiSectorGroup[] = [
  { group_name: "기술/성장주 섹터", emoji: "💾", sectors: [
    { id: "semi", name: "반도체", is_on: true },
    { id: "ai_sw", name: "AI·소프트웨어", is_on: true },
    { id: "display", name: "디스플레이", is_on: false },
    { id: "robot", name: "로봇·자동화", is_on: false },
    { id: "space", name: "우주항공·위성", is_on: false },
  ]},
  { group_name: "제조/중화학/전통산업", emoji: "🏗️", sectors: [
    { id: "auto", name: "자동차·자율주행", is_on: true },
    { id: "battery", name: "2차전지·배터리", is_on: true },
    { id: "ship", name: "조선·해운", is_on: false },
    { id: "steel", name: "철강·메탈", is_on: false },
    { id: "chem", name: "화학·정유", is_on: false },
    { id: "construct", name: "건설·토목", is_on: false },
    { id: "defense", name: "방위산업", is_on: false },
  ]},
  { group_name: "소비재/문화/트렌드", emoji: "🛍️", sectors: [
    { id: "food", name: "식품·음료", is_on: false },
    { id: "entertain", name: "엔터테인먼트", is_on: false },
    { id: "beauty", name: "화장품·뷰티", is_on: false },
    { id: "game", name: "게임·웹툰", is_on: true },
    { id: "fashion", name: "패션·의류", is_on: false },
    { id: "retail", name: "유통·백화점", is_on: false },
  ]},
  { group_name: "보건/바이오/인프라", emoji: "🧬", sectors: [
    { id: "pharma", name: "제약·바이오", is_on: false },
    { id: "medtech", name: "의료기기·미용기기", is_on: false },
    { id: "renewable", name: "신재생에너지", is_on: false },
    { id: "nuclear", name: "전력·원자력", is_on: false },
    { id: "telecom", name: "통신/5G", is_on: false },
  ]},
  { group_name: "금융/자산/정책", emoji: "🏦", sectors: [
    { id: "bank", name: "은행·금융지주", is_on: false },
    { id: "securities", name: "증권·보험", is_on: false },
    { id: "holding", name: "지주회사·밸류업", is_on: false },
    { id: "global_m", name: "해외증시·매크로", is_on: false },
    { id: "crypto", name: "가상자산·STO", is_on: false },
    { id: "commodity", name: "원자재·곡물", is_on: false },
    { id: "etc_pub", name: "기타·공시", is_on: false },
  ]},
];

// 실행 시점 기준 "n시간 전" ISO 문자열 생성 — 목업 기사가 언제 테스트하든
// 항상 "최근 기사"로 취급되게 하기 위함 (스토리 24시간 필터가 정상 동작하려면 필요)
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// ─── 목업: 기사 (GET /articles 구조) ────────────────────────────────────────
export const MOCK_ARTICLES: ApiArticle[] = [
  {
    id: 1, source_name: "한국경제", title: "삼성전자, 2분기 영업이익 컨센서스 15% 상회",
    source_url: "https://www.hankyung.com/article/2024010100001",
    thumbnail_url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=160&fit=crop&auto=format",
    summary_headline: "삼성전자, 2분기 영업이익 컨센서스 15% 상회",
    summary_body: "삼성전자가 2분기 잠정 영업이익 11조 2천억 원을 기록해 시장 예상치를 크게 웃돌았다. 메모리 반도체 가격 회복과 HBM 출하량 증가가 주된 요인으로 분석된다. DS 부문이 전체 실적 개선을 주도했으며 스마트폰 사업부도 전 분기 대비 수익성이 개선됐다. 4분기 추가 개선을 전망하는 증권사 리포트도 잇따르고 있다.",
    importance_reason: "메모리 반도체 업황 개선이 본격 실적에 반영된 신호로, 하반기 추가 실적 개선 기대감을 높인다",
    like_count: 128, is_liked: false, is_scrapped: false,
    companies: [{ id: "005930", name: "삼성전자" }], sectors: [{ id: "semi", name: "반도체" }],
    published_at: hoursAgo(0.5),
  },
  {
    id: 2, source_name: "연합뉴스", title: "한국은행, 기준금리 3.25% 동결…물가 경계 지속",
    source_url: "https://www.yna.co.kr/view/AKR20240101000001",
    thumbnail_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=160&fit=crop&auto=format",
    summary_headline: "한국은행, 기준금리 3.25% 동결…물가 경계 지속",
    summary_body: "한국은행 금융통화위원회는 이날 기준금리를 현행 3.25%로 동결하기로 결정했다. 물가 상승률이 목표치(2%)를 상회하고 있어 인하 시기를 서두르기 어렵다는 판단이다. 총재는 가계부채 추이도 면밀히 모니터링 중이라고 밝혔다. 시장은 연내 인하 기대를 1회로 하향 조정했다.",
    importance_reason: "대출금리가 당분간 현 수준으로 유지돼 부동산·소비 회복 속도가 늦춰질 가능성",
    like_count: 41, is_liked: false, is_scrapped: false,
    companies: [], sectors: [{ id: "bank", name: "금융" }],
    published_at: hoursAgo(1),
  },
  {
    id: 3, source_name: "머니투데이", title: "LG에너지솔루션·현대차, 전고체 배터리 공동 개발 MOU 체결",
    source_url: "https://news.mt.co.kr/mtview.php?no=2024010100002",
    thumbnail_url: "https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "LG에너지솔루션·현대차, 전고체 배터리 공동 개발 MOU 체결",
    summary_body: "LG에너지솔루션과 현대자동차가 전고체 배터리 공동 개발을 위한 MOU를 체결했다고 밝혔다. 양사는 2027년까지 주행거리 700km 이상의 전고체 배터리 시제품 개발을 목표로 한다. 배터리 내재화 경쟁이 심화되는 가운데 협력 방식으로 기술 격차를 줄이는 전략을 택했다. 현대차는 이 배터리를 아이오닉 후속 모델에 탑재할 계획이다.",
    importance_reason: "양사 협력은 전고체 배터리 내재화 이슈를 완화하고 현대차의 EV 원가 경쟁력 확보에 직결된다",
    like_count: 76, is_liked: false, is_scrapped: true,
    companies: [{ id: "373220", name: "LG에너지솔루션" }, { id: "005380", name: "현대차" }],
    sectors: [{ id: "battery", name: "2차전지" }],
    published_at: hoursAgo(1.8),
  },
  {
    id: 4, source_name: "서울경제", title: "현대차 인도 IPO 공모가 상단 확정…시총 20조 전망",
    source_url: "https://www.sedaily.com/NewsView/2024010100004",
    thumbnail_url: "https://images.unsplash.com/photo-1615829386703-e2bb66a7cb7d?w=400&h=160&fit=crop&auto=format",
    summary_headline: "현대차 인도 IPO 공모가 상단 확정…시총 20조 전망",
    summary_body: "현대자동차 인도법인이 뭄바이 증시 상장을 위한 공모가를 밴드 최상단인 1,960루피로 확정했다. 기관 투자자 청약에서 6.5배 경쟁률을 기록했으며 상장 후 시가총액은 약 20조 원에 달할 것으로 추산된다. 현대차는 조달 자금을 인도 공장 추가 증설에 활용할 계획이다.",
    importance_reason: "인도 법인 상장으로 숨겨진 자산가치가 주가에 반영될 기회이며 현대차 지분가치 상승으로 이어질 수 있다",
    like_count: 93, is_liked: true, is_scrapped: false,
    companies: [{ id: "005380", name: "현대차" }], sectors: [{ id: "auto", name: "자동차" }],
    published_at: hoursAgo(2.9),
  },
  {
    id: 5, source_name: "조선비즈", title: "NAVER, 라인야후 지분 매각 협상 최종 타결 임박",
    source_url: "https://biz.chosun.com/stock/2024/01/01/00005",
    thumbnail_url: "https://images.unsplash.com/photo-1533577116850-9cc66cad8a9b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "NAVER, 라인야후 지분 매각 협상 최종 타결 임박",
    summary_body: "NAVER가 소프트뱅크와 라인야후 지분 매각 협상에서 주요 조건에 합의한 것으로 알려졌다. 매각 대금은 약 2조 3천억 원 수준에서 논의 중이며 이르면 다음 달 공식 발표가 예상된다. NAVER는 매각 대금을 자사주 매입 및 AI 투자에 활용할 계획이다.",
    importance_reason: "라인야후 불확실성 해소와 자사주 매입 기대가 주가 재평가의 핵심 촉매로 작용할 수 있다",
    like_count: 54, is_liked: false, is_scrapped: false,
    companies: [{ id: "035420", name: "NAVER" }], sectors: [{ id: "game", name: "인터넷·게임" }],
    published_at: hoursAgo(3.9),
  },
  {
    id: 6, source_name: "전자신문", title: "삼성전자·SK하이닉스, HBM4 양산 속도전…AI 반도체 주도권 경쟁",
    source_url: "https://www.etnews.com/20240101000006",
    thumbnail_url: "https://images.unsplash.com/photo-1562408590-e32931084e23?w=400&h=160&fit=crop&auto=format",
    summary_headline: "삼성전자·SK하이닉스, HBM4 양산 속도전…AI 반도체 주도권 경쟁",
    summary_body: "삼성전자가 HBM4 제품의 연내 양산을 공식 선언하며 SK하이닉스의 독주에 도전장을 내밀었다. SK하이닉스는 내년까지 HBM4E 양산 체제를 완성하겠다고 맞받았다. 엔비디아·AMD 등 주요 고객사들은 두 회사 모두에서 조달 비율을 유연하게 가져가겠다고 밝혔다. AI 반도체 수요 확대 속에 HBM 시장 규모는 2026년까지 현재의 3배로 성장할 전망이다.",
    importance_reason: "HBM 시장 확대 국면에서 1·2위 간 점유율 경쟁이 양사 실적 변동성의 핵심 변수",
    like_count: 201, is_liked: false, is_scrapped: false,
    companies: [{ id: "005930", name: "삼성전자" }, { id: "000660", name: "SK하이닉스" }],
    sectors: [{ id: "semi", name: "반도체" }],
    published_at: hoursAgo(4.9),
  },
  {
    id: 7, source_name: "이데일리", title: "GS건설, PF 부실 사업장 손실 1,800억 일괄 반영",
    source_url: "https://www.edaily.co.kr/news/read?newsId=2024010100007",
    thumbnail_url: "https://images.unsplash.com/photo-1574353260424-97ee3385ea0e?w=400&h=160&fit=crop&auto=format",
    summary_headline: "GS건설, PF 부실 사업장 손실 1,800억 일괄 반영",
    summary_body: "GS건설이 PF 부실 사업장 3곳에 대한 손실충당금 1,800억 원을 2분기에 일괄 반영한다고 공시했다. 이에 따라 2분기 영업손실이 불가피해졌으며, 시장에서는 추가 부실 가능성도 배제하지 않는 분위기다. 업계 전반의 PF 리스크 재평가로 이어지고 있다.",
    importance_reason: "PF 부실 규모가 예상보다 클 경우 자본 건전성 훼손과 신용등급 하향으로 이어질 위험",
    like_count: 29, is_liked: false, is_scrapped: false,
    companies: [], sectors: [{ id: "construct", name: "건설·부동산" }],
    published_at: hoursAgo(5.9),
  },
  {
    id: 8, source_name: "게임조선", title: "크래프톤, 배틀그라운드 인도 재출시 DAU 500만 첫날 돌파",
    source_url: "https://www.gamechosun.co.kr/article/view/2024/01/01/00008",
    thumbnail_url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "크래프톤, 배틀그라운드 인도 재출시 DAU 500만 첫날 돌파",
    summary_body: "크래프톤의 배틀그라운드 모바일이 인도에서 재출시 첫날 DAU 500만 명을 넘어섰다. 이는 재출시 전 예상치의 2.5배 수준으로 인도 앱마켓 게임 부문 1위에도 즉시 등극했다. 현지화 콘텐츠와 e스포츠 연동 전략이 주효했다는 분석이다.",
    importance_reason: "인도 재진입 성공은 신규 MAU 확보와 인앱 결제 매출 급증으로 연결될 핵심 성장 이벤트",
    like_count: 33, is_liked: false, is_scrapped: false,
    companies: [], sectors: [{ id: "game", name: "인터넷·게임" }],
    published_at: hoursAgo(6.9),
  },
  {
    id: 9, source_name: "파이낸셜뉴스", title: "포스코퓨처엠, 양극재 생산능력 2026년 30만 톤으로 확대",
    source_url: "https://www.fnnews.com/news/2024010100009",
    thumbnail_url: "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=400&h=160&fit=crop&auto=format",
    summary_headline: "포스코퓨처엠, 양극재 생산능력 2026년 30만 톤으로 확대",
    summary_body: "포스코퓨처엠이 경북 포항과 캐나다 퀘벡에 추가 양극재 공장을 착공하며 2026년까지 생산능력을 현재의 두 배인 30만 톤으로 늘릴 계획이다. 전고체 배터리용 소재 라인업도 2025년부터 순차적으로 추가한다.",
    importance_reason: "배터리 공급망 내재화 추세 속에 양극재 증설 속도가 수주 경쟁력의 핵심 변수로 부상한다",
    like_count: 18, is_liked: false, is_scrapped: true,
    companies: [], sectors: [{ id: "battery", name: "2차전지" }],
    published_at: hoursAgo(7.9),
  },
  // ── 아래부터는 스토리 세그먼트 바 테스트용으로 추가 — 구독 기업별로 24시간 내 기사 여러 개 ──
  {
    id: 10, source_name: "머니투데이", title: "삼성전자, 파운드리 신규 고객사 확보 추진",
    source_url: "https://news.mt.co.kr/mtview.php?no=2024010100010",
    thumbnail_url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=160&fit=crop&auto=format",
    summary_headline: "삼성전자, 파운드리 신규 고객사 확보 추진",
    summary_body: "삼성전자 파운드리 사업부가 미국 팹리스 업체와 신규 위탁생산 계약을 논의 중인 것으로 알려졌다. 2나노 공정 수율 개선이 협상의 핵심 변수로 거론된다.",
    importance_reason: "파운드리 신규 고객 확보는 TSMC 의존도가 높은 첨단 공정 시장에서 점유율 반등의 계기가 될 수 있다",
    like_count: 62, is_liked: false, is_scrapped: false,
    companies: [{ id: "005930", name: "삼성전자" }], sectors: [{ id: "semi", name: "반도체" }],
    published_at: hoursAgo(3.2),
  },
  {
    id: 11, source_name: "한국경제", title: "삼성전자 노조, 임금 협상 잠정 합의",
    source_url: "https://www.hankyung.com/article/2024010100011",
    thumbnail_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=160&fit=crop&auto=format",
    summary_headline: "삼성전자 노조, 임금 협상 잠정 합의",
    summary_body: "삼성전자 노사가 올해 임금 및 단체협약 협상에서 잠정 합의안을 도출했다. 조합원 투표를 거쳐 최종 타결 여부가 결정될 예정이다.",
    importance_reason: "노사 협상 조기 마무리는 생산 차질 리스크를 줄이고 하반기 실적 가이던스의 불확실성을 낮춘다",
    like_count: 34, is_liked: false, is_scrapped: false,
    companies: [{ id: "005930", name: "삼성전자" }], sectors: [{ id: "etc_pub", name: "기타·공시" }],
    published_at: hoursAgo(10.5),
  },
  {
    id: 12, source_name: "전자신문", title: "삼성전자, 하반기 갤럭시 신제품 라인업 예고",
    source_url: "https://www.etnews.com/20240101000012",
    thumbnail_url: "https://images.unsplash.com/photo-1562408590-e32931084e23?w=400&h=160&fit=crop&auto=format",
    summary_headline: "삼성전자, 하반기 갤럭시 신제품 라인업 예고",
    summary_body: "삼성전자가 하반기 폴더블 신제품과 보급형 라인업을 순차적으로 공개할 예정이라고 밝혔다. 온디바이스 AI 기능이 전 라인업에 확대 적용된다.",
    importance_reason: "신제품 출시 주기 조정이 스마트폰 사업부 분기 실적 변동성에 직접 영향을 준다",
    like_count: 45, is_liked: false, is_scrapped: false,
    companies: [{ id: "005930", name: "삼성전자" }], sectors: [{ id: "ai_sw", name: "AI·소프트웨어" }],
    published_at: hoursAgo(18.7),
  },
  {
    id: 13, source_name: "서울경제", title: "SK하이닉스, HBM 공급 계약 추가 체결",
    source_url: "https://www.sedaily.com/NewsView/2024010100013",
    thumbnail_url: "https://images.unsplash.com/photo-1562408590-e32931084e23?w=400&h=160&fit=crop&auto=format",
    summary_headline: "SK하이닉스, HBM 공급 계약 추가 체결",
    summary_body: "SK하이닉스가 글로벌 AI 반도체 업체와 HBM 장기 공급 계약을 추가로 체결했다고 공시했다. 계약 규모는 비공개다.",
    importance_reason: "장기 공급 계약 확대는 HBM 매출 가시성을 높여 실적 예측 신뢰도를 높인다",
    like_count: 58, is_liked: false, is_scrapped: false,
    companies: [{ id: "000660", name: "SK하이닉스" }], sectors: [{ id: "semi", name: "반도체" }],
    published_at: hoursAgo(4.4),
  },
  {
    id: 14, source_name: "이데일리", title: "SK하이닉스 목표주가 상향 잇따라",
    source_url: "https://www.edaily.co.kr/news/read?newsId=2024010100014",
    thumbnail_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=160&fit=crop&auto=format",
    summary_headline: "SK하이닉스 목표주가 상향 잇따라",
    summary_body: "주요 증권사들이 SK하이닉스의 목표주가를 잇따라 상향 조정했다. HBM 판가 상승과 출하량 증가가 근거로 제시됐다.",
    importance_reason: "증권가 목표주가 상향은 기관 수급에 우호적으로 작용할 수 있는 신호다",
    like_count: 39, is_liked: false, is_scrapped: false,
    companies: [{ id: "000660", name: "SK하이닉스" }], sectors: [{ id: "semi", name: "반도체" }],
    published_at: hoursAgo(13.2),
  },
  {
    id: 15, source_name: "머니투데이", title: "LG에너지솔루션, 미국 공장 가동률 상승",
    source_url: "https://news.mt.co.kr/mtview.php?no=2024010100015",
    thumbnail_url: "https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "LG에너지솔루션, 미국 공장 가동률 상승",
    summary_body: "LG에너지솔루션 미국 합작공장의 가동률이 전 분기 대비 개선된 것으로 나타났다. 완성차 업체 수요 회복이 배경으로 꼽힌다.",
    importance_reason: "가동률 개선은 고정비 부담 완화로 이어져 배터리 부문 수익성 회복의 선행 지표가 된다",
    like_count: 27, is_liked: false, is_scrapped: false,
    companies: [{ id: "373220", name: "LG에너지솔루션" }], sectors: [{ id: "battery", name: "2차전지·배터리" }],
    published_at: hoursAgo(6.6),
  },
  {
    id: 16, source_name: "조선비즈", title: "LG에너지솔루션, 유럽 완성차업체 신규 수주 공시",
    source_url: "https://biz.chosun.com/stock/2024/01/01/00016",
    thumbnail_url: "https://images.unsplash.com/photo-1593941707874-ef25b8b4a92b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "LG에너지솔루션, 유럽 완성차업체 신규 수주 공시",
    summary_body: "LG에너지솔루션이 유럽 완성차업체와 배터리 공급 계약을 신규 체결했다고 공시했다. 공급 물량은 2027년부터 순차 반영된다.",
    importance_reason: "신규 수주는 향후 수년간의 매출 가시성을 높이는 요인으로 작용한다",
    like_count: 31, is_liked: false, is_scrapped: false,
    companies: [{ id: "373220", name: "LG에너지솔루션" }], sectors: [{ id: "etc_pub", name: "기타·공시" }],
    published_at: hoursAgo(16.1),
  },
  {
    id: 17, source_name: "한국경제", title: "현대차, 전기차 판매량 반등 조짐",
    source_url: "https://www.hankyung.com/article/2024010100017",
    thumbnail_url: "https://images.unsplash.com/photo-1615829386703-e2bb66a7cb7d?w=400&h=160&fit=crop&auto=format",
    summary_headline: "현대차, 전기차 판매량 반등 조짐",
    summary_body: "현대차의 주요 시장 전기차 판매량이 전월 대비 반등한 것으로 집계됐다. 신차 인센티브 확대가 판매 회복에 영향을 준 것으로 분석된다.",
    importance_reason: "전기차 수요 둔화 우려가 완화되면 관련 부문 실적 눈높이가 상향 조정될 수 있다",
    like_count: 42, is_liked: false, is_scrapped: false,
    companies: [{ id: "005380", name: "현대차" }], sectors: [{ id: "auto", name: "자동차" }],
    published_at: hoursAgo(5.5),
  },
  {
    id: 18, source_name: "조선비즈", title: "NAVER, 클로바 AI 신규 서비스 출시",
    source_url: "https://biz.chosun.com/stock/2024/01/01/00018",
    thumbnail_url: "https://images.unsplash.com/photo-1533577116850-9cc66cad8a9b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "NAVER, 클로바 AI 신규 서비스 출시",
    summary_body: "NAVER가 자체 AI 모델 클로바 기반의 신규 서비스를 공개했다. 검색과 커머스 영역에 우선 적용될 예정이다.",
    importance_reason: "AI 서비스 확대는 광고·커머스 수익 모델 다변화 가능성을 시사한다",
    like_count: 36, is_liked: false, is_scrapped: false,
    companies: [{ id: "035420", name: "NAVER" }], sectors: [{ id: "ai_sw", name: "AI·소프트웨어" }],
    published_at: hoursAgo(8.8),
  },
  {
    id: 19, source_name: "게임조선", title: "NAVER웹툰, 해외 매출 최대치 경신",
    source_url: "https://www.gamechosun.co.kr/article/view/2024/01/01/00019",
    thumbnail_url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&h=160&fit=crop&auto=format",
    summary_headline: "NAVER웹툰, 해외 매출 최대치 경신",
    summary_body: "NAVER웹툰의 분기 해외 매출이 역대 최대치를 기록했다. 북미·유럽 유료 이용자 증가가 주된 요인으로 꼽힌다.",
    importance_reason: "해외 매출 비중 확대는 NAVER 전체 실적에서 웹툰 사업 기여도를 높이는 요인이다",
    like_count: 24, is_liked: false, is_scrapped: false,
    companies: [{ id: "035420", name: "NAVER" }], sectors: [{ id: "game", name: "게임·웹툰" }],
    published_at: hoursAgo(19.3),
  },
];

// ─────────────────────────────────────────────────────────────────────────
// UI 전용 파생 값 — API 응답엔 없고, 프론트에서 규칙에 따라 만들어내는 것들
// ─────────────────────────────────────────────────────────────────────────

// 회사별 아바타 색상: DB에 저장된 값이 아니라 id(ticker)를 해시해서 항상 같은
// 색이 나오게 만든 것. 팔레트에 회사를 추가/제거해도 코드 수정 불필요.
const COMPANY_COLOR_PALETTE = [
  "#1a3a9c", "#9b2020", "#7a1c1c", "#1c3a5e",
  "#14602e", "#6b4a08", "#4a1878", "#0e3272",
];
export function getCompanyColor(companyId: string): string {
  const hash = companyId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return COMPANY_COLOR_PALETTE[hash % COMPANY_COLOR_PALETTE.length];
}

// 회사명 → 아바타 이니셜 (한글은 첫 글자, 영문은 앞 2~3글자)
export function getCompanyInitials(name: string): string {
  if (/^[A-Za-z]/.test(name)) {
    return name.slice(0, name.includes(" ") ? 2 : 3).toUpperCase();
  }
  return name.slice(0, 1);
}

// 분야별 강조색: sector id 해시 기반 (DB에 없는 값)
const SECTOR_COLOR_PALETTE = [
  "#4488ff", "#f59e0b", "#22c55e", "#3b82f6", "#10b981",
  "#f97316", "#ef4444", "#a855f7", "#06b6d4",
];
export function getSectorColor(sectorId: string): string {
  const hash = sectorId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SECTOR_COLOR_PALETTE[hash % SECTOR_COLOR_PALETTE.length];
}

// published_at(ISO 절대시각) → "14분 전" 형태의 상대시간 문자열로 변환.
// 실제 API 연동 후에도 계속 필요한 함수 (서버는 절대시각만 내려주므로).
export function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// 숫자 등락률 → "+5.8%" 형태 문자열
export function formatChangeRate(rate: number): string {
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

// 숫자 가격 → "77,400" 형태 문자열
export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

// ─── 목업: 차트 시세 (GET /companies/{id}/chart 의 price_series 구조) ──────
function seededRand(seed: number, i: number) {
  return Math.sin(seed * 127.1 + i * 311.7) * 0.5 + 0.5;
}
export function generateMockPriceSeries(basePrice: number, points: number, seed: number): ApiPricePoint[] {
  let close = basePrice * 0.96;
  const today = new Date();
  return Array.from({ length: points }, (_, i) => {
    const open = close;
    close += (seededRand(seed, i) - 0.46) * basePrice * 0.008;
    close = Math.max(basePrice * 0.88, Math.min(basePrice * 1.13, close));
    const high = Math.max(open, close) * (1 + seededRand(seed + 1, i) * 0.004);
    const low = Math.min(open, close) * (1 - seededRand(seed + 2, i) * 0.004);
    const volume = Math.round((seededRand(seed + 3, i) * 0.85 + 0.15) * 950 + 50) * 10000;
    const date = new Date(today);
    date.setDate(date.getDate() - (points - i));
    return {
      time: date.toISOString().slice(0, 10),
      open: Math.round(open / 100) * 100,
      high: Math.round(high / 100) * 100,
      low: Math.round(low / 100) * 100,
      close: Math.round(close / 100) * 100,
      volume,
    };
  });
}