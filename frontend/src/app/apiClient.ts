import { DEVICE_ID } from "./deviceId";

// 백엔드 서버 주소. 배포 시 이 값만 실제 서버 주소로 바꾸면 됨.
const API_BASE_URL = "http://localhost:4000/api";

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

export async function fetchCompanyChart(
  ticker: string,
  period: "day" | "week" | "month"
): Promise<ChartResponse> {
  const dbId = await resolveCompanyDbId(ticker);
  return apiFetch<ChartResponse>(`/companies/${dbId}/chart?period=${period}`);
}