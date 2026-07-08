import { DEVICE_ID } from "./deviceId";
import type { ApiArticle, ApiCompany, ApiSectorGroup } from "./mockData";

// 백엔드 서버 주소. 배포 시 이 값만 실제 서버 주소로 바꾸면 됨.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// 모든 API 호출에 X-Device-Id 헤더를 자동으로 붙여주는 공통 fetch 래퍼
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    cache: "no-store", // 브라우저가 예전 응답을 재사용하지 못하게 명시적으로 차단
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": DEVICE_ID,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API 오류 (${res.status})`);
  }
  return res.json();
}

// 앱 최초 실행 시 1회 호출 — 디바이스 등록 (upsert라 여러 번 불러도 안전)
export async function registerDevice(): Promise<void> {
  await apiFetch("/devices", {
    method: "POST",
    body: JSON.stringify({ device_uuid: DEVICE_ID }),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 프론트 Company 객체는 ticker를 id로 쓰고 있는데(예: "005930"), 백엔드
// GET /companies/:id/chart 는 DB의 숫자 id(예: 395)를 요구함. 이 둘을
// 변환해주는 부분 — 한 번 조회한 건 캐시해둬서 매번 다시 검색 안 하게 함.
// ─────────────────────────────────────────────────────────────────────────
const tickerToDbIdCache = new Map<string, number>();

async function resolveCompanyDbId(ticker: string): Promise<number> {
  if (tickerToDbIdCache.has(ticker)) return tickerToDbIdCache.get(ticker)!;

  const data = await apiFetch<{ companies: { id: number; ticker: string }[] }>(
    `/companies?q=${ticker}`
  );
  const match = data.companies.find(c => c.ticker === ticker);
  if (!match) throw new Error(`DB에서 종목을 찾을 수 없습니다: ${ticker}`);

  tickerToDbIdCache.set(ticker, match.id);
  return match.id;
}

// ─── 종목(회사) 조회/구독 ────────────────────────────────────────────────────
// 백엔드 원본 응답 형태 (companies.js) — id는 DB 숫자 id
interface ServerCompany {
  id: number;
  name: string;
  ticker: string;
  logo_url: string | null;
  is_subscribed?: boolean;
  current_price?: number | null;
  change_rate?: number | null;
}

// 서버 응답 -> 프론트 ApiCompany(ticker를 id로 사용, dbId에 DB 숫자 id 보관)로 변환.
// 겸사겸사 ticker->dbId 캐시도 채워서 이후 resolveCompanyDbId 호출이 네트워크를 안 타게 함.
function toApiCompany(c: ServerCompany): ApiCompany {
  tickerToDbIdCache.set(c.ticker, c.id);
  return {
    id: c.ticker,
    dbId: c.id,
    name: c.name,
    ticker: c.ticker,
    logo_url: c.logo_url,
    is_subscribed: c.is_subscribed,
    current_price: c.current_price ?? null,
    change_rate: c.change_rate ?? null,
  };
}

// 기업 검색 (홈 구독추가 검색 / 차트 탭 기업검색 공용) — 가격은 안 붙어서 옴
export async function searchCompanies(query: string): Promise<ApiCompany[]> {
  if (!query.trim()) return [];
  const data = await apiFetch<{ companies: ServerCompany[] }>(
    `/companies?q=${encodeURIComponent(query)}`
  );
  return data.companies.map(toApiCompany);
}

// 내가 구독 중인 종목 목록 (현재가·등락률 포함)
export async function fetchSubscribedCompanies(): Promise<ApiCompany[]> {
  const data = await apiFetch<{ companies: ServerCompany[] }>("/companies/subscriptions");
  return data.companies.map(c => ({ ...toApiCompany(c), is_subscribed: true }));
}

// 여러 종목의 현재가/등락률 일괄 갱신 조회
export async function fetchCompanyPrices(tickers: string[]): Promise<ApiCompany[]> {
  if (tickers.length === 0) return [];
  const data = await apiFetch<{ companies: ServerCompany[] }>(
    `/companies/prices?tickers=${tickers.map(encodeURIComponent).join(",")}`
  );
  return data.companies.map(toApiCompany);
}

// 종목 구독 on/off — ticker를 넘기면 내부에서 dbId로 변환해서 호출
export async function setCompanySubscription(ticker: string, on: boolean): Promise<void> {
  const dbId = await resolveCompanyDbId(ticker);
  await apiFetch(`/companies/${dbId}/subscriptions`, {
    method: on ? "POST" : "DELETE",
  });
}

// ─── 차트 조회 ──────────────────────────────────────────────────────────────
export interface ServerPricePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface ChartResponse {
  company_id: number;
  ticker: string;
  current_price: number;
  change_rate: number;
  price_series: ServerPricePoint[];
}

export async function fetchCompanyChart(ticker: string): Promise<ChartResponse> {
  const dbId = await resolveCompanyDbId(ticker);
  return apiFetch<ChartResponse>(`/companies/${dbId}/chart`);
}

// ─── 기사 조회 (분야별 숏츠 / 기업 스토리) ───────────────────────────────────
// GET /articles?mode=sector 응답 형태
export interface ArticlesSectorResponse {
  articles: ApiArticle[];
  nextCursor: number | null; // 다음 페이지 요청 시 cursor로 그대로 넘기면 됨
  hasMore: boolean;
}

// 분야별 숏츠(메인 피드) — sectorId 생략하면 전체, cursor 생략하면 첫 페이지
export async function fetchArticles(
  sectorId?: number,
  cursor?: number
): Promise<ArticlesSectorResponse> {
  const params = new URLSearchParams({ mode: "sector" });
  if (sectorId != null) params.set("sector_id", String(sectorId));
  if (cursor != null) params.set("cursor", String(cursor));
  return apiFetch<ArticlesSectorResponse>(`/articles?${params.toString()}`);
}

export interface ScrapsResponse {
  articles: ApiArticle[];
  nextCursor: number | null;
  hasMore: boolean;
}

export async function fetchScrappedArticles(cursor?: number): Promise<ScrapsResponse> {
  const params = new URLSearchParams();
  if (cursor != null) params.set("cursor", String(cursor));
  const qs = params.toString();
  return apiFetch<ScrapsResponse>(`/scraps${qs ? `?${qs}` : ""}`);
}

// GET /articles?mode=story 응답 형태 — is_viewed가 기사별로 추가됨
export interface ApiStoryArticle extends ApiArticle {
  is_viewed: boolean;
}
export interface ArticlesStoryResponse {
  articles: ApiStoryArticle[];
  totalCount: number;
  viewedCount: number;
  unviewedCount: number;
}

// 기업 스토리 — companyTicker는 프론트에서 쓰는 티커("005930") 그대로 넘기면 됨
export async function fetchStoryArticles(
  companyTicker: string
): Promise<ArticlesStoryResponse> {
  const dbId = await resolveCompanyDbId(companyTicker);
  return apiFetch<ArticlesStoryResponse>(`/articles?mode=story&company_id=${dbId}`);
}

// ─── 분야(섹터) 조회/구독 ────────────────────────────────────────────────────
// GET /sectors 원본 응답 (camelCase, DB 숫자 id)
interface SectorsApiResponse {
  groups: {
    groupName: string;
    sectors: { id: number; name: string; isOn: boolean }[];
  }[];
}

// mockData.ts의 ApiSectorGroup에는 emoji가 없어서(API엔 없는 값), group_name 기준으로 프론트에서 매핑
const SECTOR_GROUP_EMOJI: Record<string, string> = {
  "기술/성장주 섹터": "💾",
  "제조/중화학/전통산업": "🏗️",
  "소비재/문화/트렌드": "🛍️",
  "보건/바이오/인프라": "🧬",
  "금융/자산/정책": "🏦",
};

// GET /sectors 응답을 ApiSectorGroup[] 형태(mockData와 동일한 형태)로 변환
export async function fetchSectorGroups(): Promise<ApiSectorGroup[]> {
  const data = await apiFetch<SectorsApiResponse>("/sectors");
  return data.groups.map(g => ({
    group_name: g.groupName,
    emoji: SECTOR_GROUP_EMOJI[g.groupName] ?? "📁",
    sectors: g.sectors.map(s => ({
      id: String(s.id), // 프론트는 sector id를 문자열로 다룸 (article.sectors[].id와 동일 규칙)
      name: s.name,
      is_on: s.isOn,
    })),
  }));
}

// 분야 구독 on/off — sectorId는 숫자 DB id (문자열이면 Number()로 변환해서 넘길 것)
export async function setSectorSubscription(sectorId: number, on: boolean): Promise<void> {
  await apiFetch(`/sectors/${sectorId}/subscriptions`, {
    method: on ? "POST" : "DELETE",
  });
}

// ─── 기사 인터랙션 (좋아요/스크랩/열람) ───────────────────────────────────────
export type InteractionType = "LIKED" | "SCRAPPED" | "VIEWED";

export async function postInteraction(articleId: number, type: InteractionType): Promise<void> {
  await apiFetch(`/articles/${articleId}/interactions`, {
    method: "POST",
    body: JSON.stringify({ interactionType: type }),
  });
}

// VIEWED는 취소 불가 (백엔드에서 400) — LIKED/SCRAPPED만 넘길 것
export async function deleteInteraction(articleId: number, type: "LIKED" | "SCRAPPED"): Promise<void> {
  await apiFetch(`/articles/${articleId}/interactions/${type}`, { method: "DELETE" });
}

// 스토리 열람 기록 — 홈 화면 안읽음 표시 해제(Story_view_logs)와, 다음 스토리 조회 시
// is_viewed 계산에 쓰이는 기사 단위 VIEWED 인터랙션을 함께 기록함
export async function markStoryViewed(companyTicker: string, articleId: number): Promise<void> {
  const dbId = await resolveCompanyDbId(companyTicker);
  await Promise.all([
    apiFetch(`/companies/${dbId}/story-views`, {
      method: "POST",
      body: JSON.stringify({ articleId }),
    }),
    postInteraction(articleId, "VIEWED"),
  ]);
}
