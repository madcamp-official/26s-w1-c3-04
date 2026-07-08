const PRICE_REFRESH_INTERVAL_MS = 20000;
import { useState, useRef, useMemo, useCallback, useEffect, useId } from "react";
import {
  Home, Play, BarChart2, Bookmark, Menu, Plus, Heart,
  X, Search, Check, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import {
  getCompanyColor, getCompanyInitials, getSectorColor, timeAgo,
  formatChangeRate, formatPrice,
  type ApiArticle, type ApiCompany, type ApiSectorGroup,
} from "./mockData";
import {
  registerDevice, fetchCompanyChart, fetchArticles, fetchStoryArticles,
  fetchSectorGroups, setSectorSubscription, postInteraction, deleteInteraction, markStoryViewed,
  searchCompanies, fetchSubscribedCompanies, fetchCompanyPrices, setCompanySubscription, fetchScrappedArticles,
  type ChartResponse, type ServerPricePoint,
} from "./apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────
// NewsItem/Company는 이제 API 응답 타입을 그대로 사용합니다.
// (필드명이 API와 동일하므로, 나중에 fetch 결과를 그대로 넣으면 됩니다)
type NewsItem = ApiArticle;
type Company  = ApiCompany;

type Tab      = "home" | "shorts" | "chart" | "scrap";
type Overlay  = null | "interest" | "companySearch" | "companySelect";
type TSt      = "on" | "off" | "partial";
type ChartMode =
  | { type: "single"; companyId: string }
  | { type: "dual";   companyIds: [string, string] };

const TAB_ORDER: Tab[] = ["home", "shorts", "chart", "scrap"];

// sectors 구조(그룹>세부분야, is_on)에서 "세부분야id → on/off" 플랫 맵 생성
function buildInitSectorSubs(groups: ApiSectorGroup[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  groups.forEach(g => g.sectors.forEach(s => { map[s.id] = s.is_on; }));
  return map;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
// change_rate는 KIS 조회 실패 시 null일 수 있어서(구조 변경분), null이면 일단 상승(빨강)으로 취급
function isUp(company: Company) { return (company.change_rate ?? 0) >= 0; }

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const uid = useId().replace(/:/g, "");
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const W = 80, H = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 6)}`).join(" ");
  const c = up ? "#f43f5e" : "#3b82f6";
  const gid = `sparkgrad-${uid}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity={0.2} />
          <stop offset="100%" stopColor={c} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Three-State Toggle ───────────────────────────────────────────────────────
function ThreeTgl({ state, onToggle }: { state: TSt; onToggle: () => void }) {
  const bg = state === "on" ? "#f43f5e" : state === "partial" ? "#6b2030" : "#1a2240";
  return (
    <button onClick={onToggle} style={{ width: 44, height: 24, borderRadius: 12, background: bg, position: "relative", flexShrink: 0, border: "none", cursor: "pointer", transition: "background 0.2s", boxShadow: state === "on" ? "0 0 6px rgba(244,63,94,0.35)" : "none" }}>
      <div style={{ position: "absolute", top: 3, left: state === "on" ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.45)" }} />
      {state === "partial" && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 10, height: 2, background: "rgba(255,255,255,0.5)", borderRadius: 1, pointerEvents: "none" }} />}
    </button>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function StatusBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 32px 6px", position: "relative", zIndex: 40, flexShrink: 0 }}>
      <span style={{ color: "white", fontSize: 13, fontWeight: 700 }}>9:41</span>
      <div style={{ position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)", width: 110, height: 28, background: "#000", borderRadius: 14 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
          {[3, 4, 5, 6].map((h, i) => <div key={i} style={{ width: 3, height: h, background: "white", borderRadius: 1 }} />)}
        </div>
        <div style={{ width: 22, height: 12, borderRadius: 3, border: "1.5px solid rgba(255,255,255,0.5)", position: "relative" }}>
          <div style={{ position: "absolute", top: 1.5, left: 1.5, right: 5, bottom: 1.5, background: "white", borderRadius: 1.5 }} />
          <div style={{ position: "absolute", right: -3, top: 3, width: 2, height: 6, background: "rgba(255,255,255,0.4)", borderRadius: 1 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────
function HomeTab({ news, subCompanies, unreadIds, stockSubs, sectorSubs, onMenuPress, onAddCompany, onCompanyPress, onNewsPress }: {
  news: NewsItem[]; subCompanies: Company[]; unreadIds: Set<string>;
  stockSubs: Set<string>; sectorSubs: Record<string, boolean>;
  onMenuPress: () => void; onAddCompany: () => void;
  onCompanyPress: (id: string) => void; onNewsPress: (id: number, article: NewsItem) => void;
}) {
  // 최근 뉴스: 스코어링 폐지 결정으로, 최신순 상위 8개 헤드라인만 표시
  const recentHeadlines = useMemo(
    () => [...news].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()).slice(0, 8),
    [news]
  );

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#07090f", scrollbarWidth: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 8px" }}>
        <button onClick={onMenuPress} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "transparent", border: "none", cursor: "pointer" }}>
          <Menu size={20} color="rgba(255,255,255,0.7)" strokeWidth={1.9} />
        </button>
        <span style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>StockShorts</span>
        <div style={{ width: 36, height: 36 }} />
      </div>
      <div style={{ display: "flex", gap: 14, padding: "8px 20px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
        <button onClick={onAddCompany} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, background: "transparent", border: "none", cursor: "pointer" }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", border: "2px dashed #2a3352", background: "#0f1420", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} color="#c8d4f0" strokeWidth={2} /></div>
          <span style={{ color: "#c8d4f0", fontSize: 10, width: 54, textAlign: "center" }}>추가</span>
        </button>
        {subCompanies.map(c => {
          const unread = unreadIds.has(c.id);
          const color = getCompanyColor(c.id);
          const initials = getCompanyInitials(c.name);
          return (
            <button key={c.id} onClick={() => onCompanyPress(c.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, background: "transparent", border: "none", cursor: "pointer" }}>
              <div style={{ padding: 2.5, borderRadius: "50%", background: unread ? "linear-gradient(135deg,#f43f5e,#ef4444)" : "rgba(255,255,255,0.1)", boxShadow: unread ? "0 0 10px rgba(244,63,94,0.3)" : "none" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13 }}>{initials}</div>
              </div>
              <span style={{ color: "#c8d4f0", fontSize: 10, width: 54, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </button>
          );
        })}
      </div>
      {/* ── Summary card row: 2 index cards + up-to-5 company cards, horizontal scroll */}
      <div style={{ overflowX: "auto", scrollbarWidth: "none", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, padding: "0 20px", width: "max-content" }}>

          {/* Index cards — 코스피/코스닥. 실제 연동 시 별도 지수 API 응답으로 교체 */}
          {([
            { label: "코스피", pct: "+0.4%", val: "2,628.4pt", up: true,  data: [2618,2622,2619,2625,2624,2630,2628,2628] },
            { label: "코스닥", pct: "-1.8%", val: "793.2pt",  up: false, data: [812,808,815,805,800,795,798,793] },
          ] as const).map(({ label, pct, val, up, data }) => (
            <div key={label} style={{ width: 124, flexShrink: 0, background: "#0d1220", borderRadius: 16, padding: "11px 12px 8px", border: "1px solid #1a2240" }}>
              <div style={{ color: "#c8d4f0", fontSize: 9, fontWeight: 600, letterSpacing: "0.03em", marginBottom: 2 }}>{label}</div>
              <div style={{ color: up ? "#f43f5e" : "#3b82f6", fontSize: 19, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 1 }}>{pct}</div>
              <div style={{ color: up ? "rgba(244,63,94,0.5)" : "rgba(59,130,246,0.5)", fontSize: 10, marginBottom: 8 }}>{val}</div>
              <Sparkline data={[...data]} up={up} />
            </div>
          ))}

          {/* Company cards — sorted by |change_rate| desc, top 5 */}
          {[...subCompanies]
            .sort((a, b) => Math.abs(b.change_rate ?? 0) - Math.abs(a.change_rate ?? 0))
            .slice(0, 5)
            .map(c => {
              const up = isUp(c);
              const color = getCompanyColor(c.id);
              const initials = getCompanyInitials(c.name);
              const price = c.current_price ?? 0;
              const seed = c.id.charCodeAt(0) * 7 + c.id.charCodeAt(1) * 3;
              // deterministic sparkline: slight trend matching up/down, ends at current price
              const sparkData = Array.from({ length: 8 }, (_, i) => {
                const r = Math.sin((seed + 5) * 127.1 + i * 311.7) * 0.5 + 0.5;
                const trend = up ? (i / 7) * 0.05 : -(i / 7) * 0.05;
                return Math.round(price * (0.975 + trend + (r - 0.5) * 0.018));
              });
              sparkData[7] = price; // anchor last point to current price
              return (
                <div key={c.id} style={{ width: 124, flexShrink: 0, background: "#0d1220", borderRadius: 16, padding: "11px 12px 8px", border: "1px solid #1a2240" }}>
                  {/* Company avatar + name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 6.5, fontWeight: 700, flexShrink: 0 }}>
                      {initials}
                    </div>
                    <span style={{ color: "#c8d4f0", fontSize: 10, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {c.name}
                    </span>
                  </div>
                  <div style={{ color: up ? "#f43f5e" : "#3b82f6", fontSize: 19, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 1 }}>{formatChangeRate(c.change_rate)}</div>
                  <div style={{ color: up ? "rgba(244,63,94,0.5)" : "rgba(59,130,246,0.5)", fontSize: 10, marginBottom: 8 }}>{formatPrice(c.current_price)}원</div>
                  <Sparkline data={sparkData} up={up} />
                </div>
              );
            })
          }
        </div>
      </div>
      <div style={{ padding: "0 20px 32px" }}>
        <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>최근 뉴스</div>
        {recentHeadlines.map((item, idx) => {
          return (
            <button key={item.id} onClick={() => onNewsPress(item.id, item)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", borderBottom: idx < recentHeadlines.length - 1 ? "1px solid #111828" : "none", padding: "11px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: "#c8d4f0", fontSize: 11, fontWeight: 600, paddingTop: 1, width: 14, flexShrink: 0 }}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#f0f4ff", fontSize: 13, fontWeight: 600, lineHeight: 1.45, textDecoration: "underline", textDecorationColor: "#1e2a40", textUnderlineOffset: 3 }}>{item.summary_headline}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ color: "#7488b8", fontSize: 10 }}>{item.source_name}</span>
                    <span style={{ color: "#7488b8", fontSize: 10 }}>·</span>
                    <span style={{ color: "#7488b8", fontSize: 10 }}>{timeAgo(item.published_at)}</span>
                    {/* 기업 뱃지 — 그 기업을 구독 중일 때만 강조색 (다른 뱃지 상태랑 무관하게 자기 자신만 판단) */}
                    {item.companies.map(c => {
                      const isRelevant = stockSubs.has(c.id);
                      return (
                        <span key={c.id} style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: isRelevant ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.04)", color: isRelevant ? "#f87096" : "#c0c8dc" }}>{c.name}</span>
                      );
                    })}
                    {/* 분야 뱃지 — 그 분야를 관심분야로 켜놨을 때만 강조색 (기업 구독 여부랑은 무관) */}
                    {item.sectors.map(s => {
                      const isRelevant = sectorSubs[s.id] ?? false;
                      return (
                        <span key={s.id} style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: isRelevant ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.04)", color: isRelevant ? "#f87096" : "#c0c8dc" }}>{s.name}</span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shorts Tab ───────────────────────────────────────────────────────────────
function ShortsTab({ news, currentIndex, fromCompany, storyViewedIndex, visualOffset, stockSubs, sectorSubs, onLike, onScrap, onMenuPress, onToggleStockSub, onToggleSectorSub }: {
  news: NewsItem[]; currentIndex: number; fromCompany: string | null;
  storyViewedIndex?: number; // 스토리 모드일 때만 전달 — 여기까지 인덱스는 "이미 봄" 표시
  visualOffset: number;
  stockSubs: Set<string>; sectorSubs: Record<string, boolean>;
  onLike: (id: number) => void; onScrap: (id: number) => void; onMenuPress: () => void;
  onToggleStockSub: (code: string) => void; onToggleSectorSub: (id: string) => void;
}) {
  const item = news[currentIndex];
  // 썸네일이 없거나(null) 로드 자체가 실패하면(핫링크 차단 등) 깨진 이미지 아이콘 대신
  // 언론사 이름이 적힌 그라디언트 플레이스홀더를 보여줌 — 기사가 바뀔 때마다 리셋되게 item.id로 키를 둠
  const [imgFailedId, setImgFailedId] = useState<number | null>(null);
  const isDual      = item ? item.companies.length > 1 : false;
  const firstCompany = item?.companies[0];
  const fromCompanyInitials = firstCompany ? getCompanyInitials(firstCompany.name) : null;
  const fromCompanyColor    = firstCompany ? getCompanyColor(firstCompany.id) : null;
  if (!item) return null; // 방어 코드: 빈 배열/범위 밖 인덱스로 화면이 꺼지는 것 방지 (부모에서 빈 상태 화면을 대신 보여줌)
  const showThumbnail = !!item.thumbnail_url && imgFailedId !== item.id;

  return (
    <div style={{ height: "100%", position: "relative", background: "#07090f", overflow: "hidden" }}>
      {/* Top gradient */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 70, background: "linear-gradient(to bottom,rgba(7,9,15,0.92) 0%,transparent 100%)", zIndex: 10, pointerEvents: "none" }} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px" }}>
        <button onClick={e => { e.stopPropagation(); onMenuPress(); }} style={{ padding: 6, borderRadius: 10, background: "transparent", border: "none", cursor: "pointer" }}>
          <Menu size={20} color="rgba(255,255,255,0.65)" strokeWidth={1.9} />
        </button>
        {fromCompany && fromCompanyInitials && (
          <>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: fromCompanyColor ?? "#1e2840", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 8, fontWeight: 700 }}>{fromCompanyInitials}</div>
            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 600 }}>{fromCompany}</span>
          </>
        )}
        {storyViewedIndex !== undefined && (
          <div style={{ marginLeft: "auto" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{currentIndex + 1}</span>
            <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 11 }}> / {news.length}</span>
          </div>
        )}
      </div>

      {/* Card */}
      <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "52px 16px 8px", transform: `translateY(${visualOffset}px)`, transition: visualOffset !== 0 ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)" }}>

        {/* Image header — headline is tappable, opens source article */}
        <div style={{ borderRadius: 18, overflow: "hidden", marginBottom: 8, height: 155, position: "relative", flexShrink: 0, border: "1px solid #1a2240" }}>
          {showThumbnail ? (
            <img
              src={item.thumbnail_url}
              alt=""
              onError={() => setImgFailedId(item.id)}
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.42) saturate(0.75)" }}
            />
          ) : (
            // 썸네일이 없거나 로드 실패 시 — 언론사 이름을 넣은 그라디언트 플레이스홀더
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1a2240,#0d1220)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>{item.source_name}</span>
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(7,9,15,0.88) 0%,transparent 55%)" }} />
          <div style={{ position: "absolute", top: 10, left: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {/* 기사에 태깅된 분야 전부 표시 — 2개 분야에 걸친 기사인지 한눈에 보이게 함 */}
            {item.sectors.map(s => (
              <span key={s.id} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(7,9,15,0.7)", backdropFilter: "blur(8px)", border: `1px solid ${getSectorColor(s.id)}50`, color: getSectorColor(s.id), letterSpacing: "0.03em" }}>{s.name}</span>
            ))}
            {isDual && <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 20, background: "rgba(255,170,0,0.15)", border: "1px solid rgba(255,170,0,0.3)", color: "#ffaa44" }}>2종목</span>}
          </div>
          {/* Headline — tap to open source URL (source_url) */}
          <button
            onClick={e => { e.stopPropagation(); window.open(item.source_url, "_blank", "noopener"); }}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 12px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ color: "#e8f0ff", fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>{item.title}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 3, letterSpacing: "0.03em" }}>↗ 원문 보기</div>
          </button>
        </div>

        {/* Summary — text on left, action icons on right.
            높이를 고정해서(3문장 요약이 잘리지 않게 넉넉히 잡음) 기사마다
            칸 크기/하트·스크랩 위치가 흔들리지 않게 함 — 남는 여백은 카드 맨 아래 스페이서가 흡수 */}
        <div style={{ background: "#0d1220", borderRadius: 18, padding: "12px 14px", marginBottom: 6, height: 300, minHeight: 0, overflow: "hidden", border: "1px solid #1a2240", display: "flex", gap: 10, flexShrink: 0 }}>
          {/* Text column */}
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{ color: "#c8d4f0", fontSize: 9, letterSpacing: "0.12em", fontWeight: 600, textTransform: "uppercase", marginBottom: 7 }}>요약</div>
            <div style={{ color: "#e2e8f8", fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 12 }}>{item.summary_headline}</div>
            <div style={{ color: "#8fa8cc", fontSize: 14, lineHeight: 1.65 }}>{item.summary_body}</div>
          </div>
          {/* Action icons — vertically centered in summary box */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {[
              { icon: <Heart size={18} color={item.is_liked ? "#f43f5e" : "rgba(255,255,255,0.4)"} fill={item.is_liked ? "#f43f5e" : "none"} />, bg: item.is_liked ? "rgba(244,63,94,0.13)" : "rgba(255,255,255,0.06)", fn: (e: React.MouseEvent) => { e.stopPropagation(); onLike(item.id); } },
              { icon: <Bookmark size={18} color={item.is_scrapped ? "#3b82f6" : "rgba(255,255,255,0.4)"} fill={item.is_scrapped ? "#3b82f6" : "none"} />, bg: item.is_scrapped ? "rgba(59,130,246,0.13)" : "rgba(255,255,255,0.06)", fn: (e: React.MouseEvent) => { e.stopPropagation(); onScrap(item.id); } },
            ].map(({ icon, bg, fn }, i) => (
              <button key={i} onClick={fn} style={{ width: 34, height: 34, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Important reason */}
        <div style={{ background: "#0e0a1a", borderRadius: 18, padding: "12px 14px", marginBottom: 11, flexShrink: 0, border: "1px solid #2a1845" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 11 }}>💡</span>
            <span style={{ color: "#6a42a8", fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>중요한 이유</span>
          </div>
          <div style={{ color: "#b890e8", fontSize: 14, lineHeight: 1.6 }}>{item.importance_reason}</div>
        </div>

        {/* Footer tags */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
            <span style={{ color: "#c8d4f0", fontSize: 10 }}>{item.source_name} · {timeAgo(item.published_at)}</span>
            {item.companies.length > 0 && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.02em", flexShrink: 0 }}>
                {isDual ? "스와이프해서 두 종목 비교 →" : "스와이프해서 차트 확인 →"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {item.companies.map(company => {
              const subbed = stockSubs.has(company.id);
              return (
                <button
                  key={company.id}
                  onClick={e => { e.stopPropagation(); onToggleStockSub(company.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: subbed ? "rgba(68,136,255,0.18)" : "#0d1220", borderRadius: 20, padding: "5px 10px", border: `1px solid ${subbed ? "#4488ff" : "#1a2240"}`, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                >
                  <span style={{ color: subbed ? "#4488ff" : "#c8d4f0", fontSize: 11, fontWeight: subbed ? 700 : 500 }}>{company.name}</span>
                </button>
              );
            })}
            {/* 태깅된 분야 전부에 대해 구독 토글 버튼 표시 (2개 분야에 걸친 기사면 2개 다) */}
            {item.sectors.map(s => {
              const subbed = sectorSubs[s.id] ?? false;
              return (
                <button
                  key={s.id}
                  onClick={e => { e.stopPropagation(); onToggleSectorSub(s.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: subbed ? "rgba(68,136,255,0.18)" : "#0d1220", borderRadius: 20, padding: "5px 10px", border: `1px solid ${subbed ? "#4488ff" : "#1a2240"}`, cursor: "pointer", transition: "background 0.15s, border-color 0.15s" }}
                >
                  <span style={{ color: subbed ? "#4488ff" : "#c8d4f0", fontSize: 11, fontWeight: subbed ? 700 : 500 }}>{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 위쪽 요소들이 다 고정 크기라 남는 세로 공간은 여기로 몰아서 카드 맨 아래 여백으로만 남게 함 */}
        <div style={{ flex: 1, minHeight: 0 }} />
      </div>

      {/* Progress dots — 스토리 모드일 때만 표시 (분야별 숏츠엔 안 뜸) */}
      {storyViewedIndex !== undefined && (
        <div style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 4, zIndex: 10, pointerEvents: "none" }}>
          {news.map((_, i) => {
            const isCurrent = i === currentIndex;
            const isViewed = i <= storyViewedIndex && !isCurrent;
            return (
              <div key={i} style={{
                width: 2, borderRadius: 1, transition: "all 0.2s",
                height: isCurrent ? 20 : 4,
                background: isCurrent ? "rgba(255,255,255,0.8)" : isViewed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)",
              }} />
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Candlestick shape (양봉/음봉 몸통+꼬리) ─────────────────────────────────
// Recharts엔 봉차트 컴포넌트가 따로 없어서, Bar의 커스텀 shape으로 직접 그림.
// dataKey="range"(=[저가,고가])를 Bar에 주면, Recharts가 y/height를 그 값
// 범위에 맞게 이미 픽셀로 계산해서 넘겨주므로, 그 안에서 시가/종가 위치만
// 비례식으로 다시 계산해서 몸통 사각형을 그리면 됨.
function Candle(props: any) {
  const { x, width, y, height, payload } = props;
  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? "#f43f5e" : "#3b82f6";

  const range = high - low || 1;
  const pxPerUnit = height / range;
  const openY = y + (high - open) * pxPerUnit;
  const closeY = y + (high - close) * pxPerUnit;
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1.5); // 시가=종가(도지)여도 최소 두께 보장
  const bodyWidth = Math.max(width * 0.62, 2);
  const bodyX = x + (width - bodyWidth) / 2;
  const wickX = x + width / 2;

  return (
    <g>
      {/* 꼬리 — 고가~저가 전체 */}
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1.4} />
      {/* 몸통 — 시가~종가 */}
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} fill={color} rx={1} />
    </g>
  );
}

// 캔들 전용 툴팁 — OHLC 네 값을 한 번에 보여줌
function CandleTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const isUp = d.close >= d.open;
  const color = isUp ? "#f43f5e" : "#3b82f6";
  return (
    <div style={{ background: "#1a2240", border: "1px solid #2a3460", borderRadius: 10, fontSize: 11, color: "#e2e8f8", padding: "7px 11px", lineHeight: 1.7 }}>
      <div style={{ color: "#7488b8", fontWeight: 700, marginBottom: 2 }}>{d.time}</div>
      <div>시가 {d.open.toLocaleString()}</div>
      <div>고가 {d.high.toLocaleString()}</div>
      <div>저가 {d.low.toLocaleString()}</div>
      <div style={{ color, fontWeight: 700 }}>종가 {d.close.toLocaleString()}</div>
    </div>
  );
}

// ─── Single Chart View (price + volume) ──────────────────────────────────────
function SingleChartView({ company: c }: { company: Company }) {
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 종목 바뀔 때마다 실제 KIS 연동 API 호출 (일별 고정)
  useEffect(() => {
    let cancelled = false;
    setChart(null);
    setError(null);
    fetchCompanyChart(c.id)
      .then(res => { if (!cancelled) setChart(res); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "차트를 불러오지 못했어요."); });
    return () => { cancelled = true; };
  }, [c.id]);

  const color = getCompanyColor(c.id);
  const initials = getCompanyInitials(c.name);

  // 로딩/에러 상태 — 아래 실제 차트 렌더링보다 먼저 처리
  if (error) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 32px" }}>
        <span style={{ fontSize: 28 }}>⚠️</span>
        <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 600, textAlign: "center" }}>차트를 불러오지 못했어요</div>
        <div style={{ color: "#c8d4f0", fontSize: 11, textAlign: "center" }}>{error}</div>
      </div>
    );
  }
  if (!chart || chart.price_series.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#c8d4f0", fontSize: 13 }}>차트 불러오는 중...</span>
      </div>
    );
  }

  const series = chart.price_series;
  const { data, volData, hi, lo, first, last } = (() => {
    const d = series.map((p, i) => ({
      i, time: p.time, open: p.open, high: p.high, low: p.low, close: p.close, range: [p.low, p.high],
    }));
    const vd = series.map((p, i) => ({
      i,
      time: p.time,
      vol: Math.round(p.volume / 10000), // 만주 단위로 환산
      up: i === 0 ? true : p.close >= series[i - 1].close,
    }));
    return {
      data: d,
      volData: vd,
      first: series[0].open,
      last: series[series.length - 1].close,
      hi: Math.max(...series.map(p => p.high)),
      lo: Math.min(...series.map(p => p.low)),
    };
  })();

  // 날짜 라벨이 너무 빽빽하지 않도록 몇 개 건너뛰며 표시 (대략 6개 안팎만 노출)
  const dateTickInterval = Math.max(Math.floor(data.length / 6), 0);
  const formatDateTick = (iso: string) => {
    const [, m, dd] = iso.split("-");
    return `${m}/${dd}`;
  };

  const displayedPrice = chart.current_price || last;
  const displayedChangeRate = chart.change_rate ?? ((last - first) / first * 100);
  const up  = displayedChangeRate >= 0;
  const pct = displayedChangeRate.toFixed(2);
  const lc  = up ? "#f43f5e" : "#3b82f6";

  const ttStyle = {
    background: "#1a2240", border: "1px solid #2a3460",
    borderRadius: 10, fontSize: 11, color: "#e2e8f8", padding: "5px 10px",
  };
  const cursorStyle = { stroke: lc, strokeWidth: 1, strokeDasharray: "3 3", opacity: 0.35 };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "0 20px 20px" }}>
      {/* Company header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0 14px", flexShrink: 0, borderBottom: "1px solid #141c2e" }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 16 }}>{c.name}</div>
          <div style={{ color: "#c8d4f0", fontSize: 12, marginTop: 2 }}>{c.ticker}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ color: "#e2e8f8", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>{displayedPrice.toLocaleString()}</div>
          <div style={{ color: lc, fontSize: 14, fontWeight: 700 }}>{up ? "+" : ""}{pct}%</div>
        </div>
      </div>

      {/* Timeframe toggle 제거 — 일별 차트만 사용 */}

      {/* Charts: 70% price + 30% volume, syncId keeps cursor aligned */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* ── Price candlestick chart (70%) */}
        <div style={{ flex: 6, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              syncId={`stock-${c.id}`}
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis dataKey="i" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={<CandleTooltip />}
                cursor={cursorStyle}
              />
              <ReferenceLine y={first} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
              <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Divider */}
        <div style={{ height: 1, background: "#111828", flexShrink: 0, margin: "0 0 0 0" }} />

        {/* ── Volume bar chart (30%) */}
        <div style={{ flex: 4, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              syncId={`stock-${c.id}`}
              data={volData}
              margin={{ top: 4, right: 8, left: 0, bottom: 14 }}
              barCategoryGap="20%"
            >
              <XAxis
                dataKey="time"
                tickFormatter={formatDateTick}
                interval={dateTickInterval}
                tick={{ fill: "#5a6890", fontSize: 9 }}
                axisLine={{ stroke: "#1a2240" }}
                tickLine={false}
              />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                contentStyle={ttStyle}
                formatter={(v: number) => [`${v.toLocaleString()}만주`, "거래량"]}
                labelFormatter={() => ""}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
              />
              <Bar dataKey="vol" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {volData.map((d, i) => (
                  <Cell
                    key={`vol-${c.id}-${i}`}
                    fill={d.up ? "#f43f5e" : "#3b82f6"}
                    fillOpacity={0.9}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats row — PER은 아직 API 범위 밖이라 플레이스홀더 유지 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 10, flexShrink: 0 }}>
        {[
          ["시가", first.toLocaleString(), "#c8d4f0"],
          ["고가", hi.toLocaleString(), "#f43f5e"],
          ["저가", lo.toLocaleString(), "#3b82f6"],
          ["PER",  "14.2배", "#c8d4f0"],
        ].map(([label, val, clr]) => (
          <div key={label} style={{ background: "#0d1220", borderRadius: 12, padding: 10, border: "1px solid #1a2240" }}>
            <div style={{ color: "#c8d4f0", fontSize: 9, marginBottom: 4 }}>{label}</div>
            <div style={{ color: clr, fontSize: 11, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mini Chart Card (for Dual View) ─────────────────────────────────────────
function MiniChartCard({ company: c, onPress, onPriceUpdate }: {
  company: Company; onPress: () => void;
  onPriceUpdate?: (id: string, current_price: number, change_rate: number) => void;
}) {
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchCompanyChart(c.id) // 일봉 고정에 맞춰 period 인자 제거
        .then(res => {
          if (cancelled) return;
          setChart(res);
          onPriceUpdate?.(c.id, res.current_price, res.change_rate);
        })
        .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "불러오기 실패"); });
    };

    setChart(null);
    setError(null);
    load();
    const interval = setInterval(load, PRICE_REFRESH_INTERVAL_MS);

    return () => { cancelled = true; clearInterval(interval); };
  }, [c.id, onPriceUpdate]);

  const color = getCompanyColor(c.id);
  const initials = getCompanyInitials(c.name);

  if (error || !chart || !chart.price_series || chart.price_series.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1220", borderRadius: 20, border: "1px solid #1a2240", minHeight: 0 }}>
        <span style={{ color: "#c8d4f0", fontSize: 12 }}>{error ?? "차트 불러오는 중..."}</span>
      </div>
    );
  }

  const series = chart.price_series;
  
  // OHLC 데이터 구조 만들기 및 lo, hi 도메인 계산
  const { data, first, last, lo, hi } = (() => {
    const d = series.map((p, i) => ({
      i, time: p.time, open: p.open, high: p.high, low: p.low, close: p.close, range: [p.low, p.high]
    }));
    return {
      data: d,
      first: series[0].open,
      last: series[series.length - 1].close,
      lo: Math.min(...series.map(p => p.low)),
      hi: Math.max(...series.map(p => p.high)),
    };
  })();

  const currentPrice = c.current_price ?? chart.current_price ?? last;
  const isRateUp = (c.change_rate ?? chart.change_rate ?? 0) >= 0;
  const pctStr = Math.abs(c.change_rate ?? chart.change_rate ?? 0).toFixed(2);
  const lc = isRateUp ? "#f43f5e" : "#3b82f6";

  // 🚀 에러의 원인: 이 줄이 빠져 있었습니다!
  const domain = [lo * 0.98, hi * 1.02];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0d1220", borderRadius: 20, border: "1px solid #1a2240", overflow: "hidden", minHeight: 0 }}>
      <button onClick={onPress} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px", flexShrink: 0, background: "transparent", border: "none", borderBottom: "1px solid #141c2e", cursor: "pointer", textAlign: "left", width: "100%" }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15 }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
            <span style={{ color: "#c8d4f0", fontSize: 10 }}>{c.ticker}</span>
            <ChevronRight size={10} color="#c8d4f0" strokeWidth={2} />
            <span style={{ color: "#4060a0", fontSize: 10 }}>상세 차트</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#e2e8f8", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>{currentPrice.toLocaleString()}</div>
          <div style={{ color: lc, fontSize: 13, fontWeight: 700 }}>{isRateUp ? "+" : ""}{pctStr}%</div>
        </div>
      </button>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={domain} />
            <ReferenceLine y={first} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Dual Chart View ──────────────────────────────────────────────────────────
function DualChartView({ companies, onSelectSingle }: { companies: Company[]; onSelectSingle: (id: string) => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8, padding: "4px 16px 16px" }}>
      {companies.map(c => (
        <MiniChartCard key={c.id} company={c} onPress={() => onSelectSingle(c.id)} />
      ))}
    </div>
  );
}

// ─── Chart Tab ────────────────────────────────────────────────────────────────
function ChartTab({ chartMode, allCompanies, onMenuPress, onSelectSingle }: {
  chartMode: ChartMode | null; allCompanies: Company[];
  onMenuPress: () => void; onSelectSingle: (id: string) => void;
}) {
  const getC = (id: string) => allCompanies.find(c => c.id === id);
  const isDual = chartMode?.type === "dual";
  const headerLabel = chartMode?.type === "single"
    ? (getC(chartMode.companyId)?.name ?? "차트")
    : isDual ? "2종목 비교" : "차트";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#07090f" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px 6px", flexShrink: 0 }}>
        <button onClick={onMenuPress} style={{ padding: 6, borderRadius: 10, background: "transparent", border: "none", cursor: "pointer" }}>
          <Menu size={20} color="rgba(255,255,255,0.65)" strokeWidth={1.9} />
        </button>
        <span style={{ color: "#e2e8f8", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>{headerLabel}</span>
        {isDual && chartMode?.type === "dual" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
            {chartMode.companyIds.map(id => {
              const c = getC(id);
              return c ? (
                <div key={id} style={{ width: 24, height: 24, borderRadius: "50%", background: getCompanyColor(c.id), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9, fontWeight: 700 }}>{getCompanyInitials(c.name)}</div>
              ) : null;
            })}
          </div>
        )}
        {!isDual && chartMode?.type === "single" && (
          <span style={{ marginLeft: "auto", color: "#c8d4f0", fontSize: 11 }}>{getC(chartMode.companyId)?.ticker}</span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {!chartMode ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: "0 32px" }}>
            <BarChart2 size={44} color="#1a2240" />
            <div style={{ color: "#c8d4f0", fontSize: 14, fontWeight: 600, textAlign: "center" }}>아직 본 종목이 없어요</div>
            <div style={{ color: "#c8d4f0", fontSize: 12, textAlign: "center", lineHeight: 1.65 }}>숏츠 카드에서 좌우 스와이프하거나{"\n"}검색으로 종목을 추가해보세요</div>
            <button onClick={onMenuPress} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 20, background: "#1a2240", border: "1px solid #2a3460", cursor: "pointer" }}>
              <Search size={13} color="#6888cc" />
              <span style={{ color: "#6888cc", fontSize: 12, fontWeight: 600 }}>종목 검색</span>
            </button>
          </div>
        ) : chartMode.type === "single" ? (
          (() => {
            const c = getC(chartMode.companyId);
            return c ? <SingleChartView company={c} /> : null;
          })()
        ) : (
          <DualChartView
            companies={chartMode.companyIds.map(id => getC(id)).filter((c): c is Company => !!c)}
            onSelectSingle={onSelectSingle}
          />
        )}
      </div>
    </div>
  );
}

// ─── Scrap Tab ────────────────────────────────────────────────────────────────
function ScrapTab({ news, onPress }: { news: NewsItem[]; onPress: (id: number) => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#07090f" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px 12px", flexShrink: 0 }}>
        <span style={{ color: "#e2e8f8", fontSize: 15, fontWeight: 700 }}>스크랩</span>
        <span style={{ background: "#0d1220", border: "1px solid #1a2240", borderRadius: 10, padding: "2px 8px", color: "#c8d4f0", fontSize: 11, fontWeight: 600 }}>{news.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", scrollbarWidth: "none" }}>
        {news.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <Bookmark size={38} color="#1a2240" />
            <span style={{ color: "#c8d4f0", fontSize: 13 }}>저장된 뉴스가 없습니다</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {news.map(item => {
              return (
                <button key={item.id} onClick={() => onPress(item.id)} style={{ textAlign: "left", background: "#0d1220", borderRadius: 18, overflow: "hidden", border: "1px solid #1a2240", cursor: "pointer" }}>
                  <div style={{ position: "relative", height: 68 }}>
                    <img src={item.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.38) saturate(0.65)" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right,rgba(13,18,32,0.7) 0%,transparent 55%)" }} />
                    {/* 태깅된 기업/분야 전부 표시 (기사 하나가 최대 2개씩 가질 수 있음) */}
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", maxWidth: "75%" }}>
                      {item.companies.map(c => {
                        const color = getCompanyColor(c.id);
                        return (
                          <span key={c.id} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: `${color}25`, border: `1px solid ${color}50`, color }}>{c.name}</span>
                        );
                      })}
                      {item.sectors.map(s => {
                        const color = getSectorColor(s.id);
                        return (
                          <span key={s.id} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: `${color}20`, border: `1px solid ${color}35`, color }}>{s.name}</span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px 12px" }}>
                    <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.summary_headline}</div>
                    <div style={{ color: "#c8d4f0", fontSize: 10, marginTop: 5 }}>{item.source_name} · {timeAgo(item.published_at)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Interest Panel ───────────────────────────────────────────────────────────
function InterestPanel({ groups, subs, onToggleSub, onClose }: {
  groups: ApiSectorGroup[]; subs: Record<string, boolean>; onToggleSub: (id: string, val: boolean) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([groups[0]?.group_name, groups[1]?.group_name].filter(Boolean) as string[]));
  const getGroupState = useCallback((group: ApiSectorGroup): TSt => {
    const vals = group.sectors.map(s => subs[s.id] ?? false);
    return vals.every(v => v) ? "on" : vals.every(v => !v) ? "off" : "partial";
  }, [subs]);
  const getAllState = useCallback((): TSt => {
    const sts = groups.map(g => getGroupState(g));
    return sts.every(s => s === "on") ? "on" : sts.every(s => s === "off") ? "off" : "partial";
  }, [groups, getGroupState]);
  const toggleAll = () => { const nv = getAllState() !== "on"; groups.forEach(g => g.sectors.forEach(s => onToggleSub(s.id, nv))); };
  const toggleGroup = (group: ApiSectorGroup) => { const nv = getGroupState(group) !== "on"; group.sectors.forEach(s => onToggleSub(s.id, nv)); };
  const toggleExpand = (name: string) => setExpanded(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0a0e18" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 14px", borderBottom: "1px solid #141c2e", flexShrink: 0 }}>
        <span style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15 }}>관심 분야</span>
        <button onClick={onClose} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer" }}><X size={17} color="rgba(255,255,255,0.4)" /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #0f1526" }}>
          <span style={{ color: "#e2e8f8", fontSize: 14, fontWeight: 700, flex: 1 }}>전체</span>
          <ThreeTgl state={getAllState()} onToggle={toggleAll} />
        </div>
        {groups.map(group => {
          const groupSt = getGroupState(group);
          const isOpen = expanded.has(group.group_name);
          return (
            <div key={group.group_name} style={{ borderBottom: "1px solid #0f1526" }}>
              <div style={{ display: "flex", alignItems: "center", padding: "11px 20px", gap: 8 }}>
                <button onClick={() => toggleExpand(group.group_name)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                  <span style={{ fontSize: 16 }}>{group.emoji}</span>
                  <span style={{ color: "#b8c8e8", fontSize: 13, fontWeight: 600 }}>{group.group_name}</span>
                  <div style={{ marginLeft: "auto", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s", display: "flex" }}><ChevronDown size={14} color="#3a4870" /></div>
                </button>
                <ThreeTgl state={groupSt} onToggle={() => toggleGroup(group)} />
              </div>
              {isOpen && group.sectors.map(sub => (
                <div key={sub.id} style={{ display: "flex", alignItems: "center", padding: "9px 20px 9px 50px", borderTop: "1px solid #0c1220" }}>
                  <button onClick={() => onToggleSub(sub.id, !(subs[sub.id] ?? false))} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                    <span style={{ color: "#c8d4f0", fontSize: 12 }}>{sub.name}</span>
                  </button>
                  <ThreeTgl state={subs[sub.id] ? "on" : "off"} onToggle={() => onToggleSub(sub.id, !(subs[sub.id] ?? false))} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Company Search Panel ─────────────────────────────────────────────────────
function CompanySearchPanel({ query, onQueryChange, companies, stockSubs, onToggle, onClose }: {
  query: string; onQueryChange: (q: string) => void; companies: Company[];
  stockSubs: Set<string>; onToggle: (id: string) => void; onClose: () => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0a0e18" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "52px 16px 12px", borderBottom: "1px solid #141c2e", flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer" }}><X size={17} color="rgba(255,255,255,0.4)" /></button>
        <span style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15 }}>기업 검색</span>
      </div>
      <div style={{ padding: "12px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d1220", borderRadius: 12, padding: "10px 12px", border: "1px solid #1a2240" }}>
          <Search size={13} color="#c8d4f0" />
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} placeholder="기업명 또는 종목코드" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f8", fontSize: 13, caretColor: "#4488ff" }} />
          {query && <button onClick={() => onQueryChange("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={12} color="#c8d4f0" /></button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {companies.map(c => {
          const sub = stockSubs.has(c.id);
          const color = getCompanyColor(c.id);
          const initials = getCompanyInitials(c.name);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid #0f1526" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13 }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: "#c8d4f0", fontSize: 11, marginTop: 1 }}>{c.ticker}</div>
              </div>
              <button onClick={() => onToggle(c.id)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer", background: sub ? "rgba(59,130,246,0.1)" : "rgba(244,63,94,0.08)", border: sub ? "1px solid rgba(59,130,246,0.25)" : "1px solid rgba(244,63,94,0.15)", color: sub ? "#60a0f0" : "#f87096" }}>{sub ? "구독중" : "구독"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Company Select Panel ─────────────────────────────────────────────────────
function CompanySelectPanel({ query, onQueryChange, allCompanies, subCompanies, recentIds, onSelect, onClose }: {
  query: string; onQueryChange: (q: string) => void; allCompanies: Company[];
  subCompanies: Company[]; recentIds: string[];
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const recentCompanies = recentIds.map(id => allCompanies.find(c => c.id === id)).filter((c): c is Company => !!c);
  const notInRecent     = subCompanies.filter(c => !recentIds.includes(c.id));
  const filtered        = allCompanies.filter(c => !query || c.name.includes(query) || c.ticker.includes(query));
  const list            = query ? filtered : notInRecent;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0a0e18" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "52px 16px 12px", borderBottom: "1px solid #141c2e", flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: 5, background: "transparent", border: "none", cursor: "pointer" }}><X size={17} color="rgba(255,255,255,0.4)" /></button>
        <span style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15 }}>기업 선택</span>
      </div>
      <div style={{ padding: "12px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0d1220", borderRadius: 12, padding: "10px 12px", border: "1px solid #1a2240" }}>
          <Search size={13} color="#c8d4f0" />
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} placeholder="기업명 검색" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f8", fontSize: 13, caretColor: "#4488ff" }} />
          {query && <button onClick={() => onQueryChange("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={12} color="#c8d4f0" /></button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
        {!query && recentCompanies.length > 0 && (
          <>
            <div style={{ color: "#c8d4f0", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase", padding: "4px 0 8px" }}>최근 본 항목</div>
            {recentCompanies.map(c => <SelectRow key={c.id} company={c} onSelect={onSelect} />)}
          </>
        )}
        {list.length > 0 && (
          <>
            <div style={{ color: "#c8d4f0", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase", padding: `${!query && recentCompanies.length > 0 ? "12px" : "4px"} 0 8px` }}>
              {query ? "검색 결과" : "구독 중인 기업"}
            </div>
            {list.map(c => <SelectRow key={c.id} company={c} onSelect={onSelect} />)}
          </>
        )}
        {list.length === 0 && query && <div style={{ color: "#c8d4f0", fontSize: 12, padding: "20px 0", textAlign: "center" }}>검색 결과가 없습니다</div>}
      </div>
    </div>
  );
}
function SelectRow({ company: c, onSelect }: { company: Company; onSelect: (id: string) => void }) {
  const color = getCompanyColor(c.id);
  const initials = getCompanyInitials(c.name);
  const up = isUp(c);
  return (
    <button onClick={() => onSelect(c.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 0", background: "transparent", border: "none", borderBottom: "1px solid #0f1526", cursor: "pointer", textAlign: "left" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 12 }}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 600 }}>{c.name}</div>
        <div style={{ color: "#c8d4f0", fontSize: 11, marginTop: 1 }}>{formatPrice(c.current_price)}원</div>
      </div>
      <span style={{ color: up ? "#f43f5e" : "#3b82f6", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{formatChangeRate(c.change_rate)}</span>
    </button>
  );
}

// ─── Tab bar items ────────────────────────────────────────────────────────────
const TABS = [
  { id: "home"   as Tab, Icon: Home      },
  { id: "shorts" as Tab, Icon: Play      },
  { id: "chart"  as Tab, Icon: BarChart2 },
  { id: "scrap"  as Tab, Icon: Bookmark  },
];

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]       = useState<Tab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);

  // 앱 최초 실행 시 디바이스 등록 (X-Device-Id 헤더로 쓸 UUID를 백엔드에 upsert)
  useEffect(() => {
    registerDevice().catch(err => console.error("디바이스 등록 실패:", err));
  }, []);

  // Shorts
  const [shortsIdx, setShortsIdx]       = useState(0);
  const [shortsFrom, setShortsFrom]     = useState<string | null>(null);
  const [shortsOffset, setShortsOffset] = useState(0);

  // Story mode — 기업별 스토리(24시간 이내, 고정 시간순, 메인 피드와 동일한 스와이프 방향)
  const [storyMode, setStoryMode] = useState<{ companyId: string; articles: NewsItem[] } | null>(null);
  const [storyIdx, setStoryIdx]   = useState(0);
  // companyId -> 마지막으로 본 기사 id (Story_view_logs.last_viewed_article_id에 대응)
  const [storyProgress, setStoryProgress] = useState<Record<string, number>>({});

  // Chart: mode-based (single or dual), no more card stack. 미리 정해둔 종목이 없으므로
  // 빈 상태로 시작 — 사용자가 검색/스와이프로 종목을 선택하면 채워짐
  const [chartMode, setChartMode]           = useState<ChartMode | null>(null);
  // 최근 본 종목 — 서버에 저장되는 값이 아니라(조회용 API가 따로 없음) 세션 동안만 유지
  const [recentIds, setRecentIds]           = useState<string[]>([]);

  // Data — 처음엔 빈 배열로 시작, 마운트 시 실제 API에서 채움 (아래 loadMoreArticles 참고)
  const [news, setNews]             = useState<NewsItem[]>([]);
  // 홈 화면 "최근 뉴스" 전용 — 숏츠 피드(news)는 관심분야 토글 필터가 걸리지만,
  // 홈의 "최근 뉴스"는 필터와 무관하게 진짜 전체 최신 기사를 보여줘야 해서 완전히 분리된 상태로 관리
  const [homeRecentNews, setHomeRecentNews] = useState<NewsItem[]>([]);
  // 회사 데이터 사전(dictionary) — ticker(id) 기준. 구독 목록/검색 결과/기사에 태깅된 회사가
  // 조회되는 대로 계속 병합돼서, "지금까지 화면에 등장한 모든 회사"의 캐시 역할을 함
  // (백엔드에 "전체 회사 목록" API가 없어서, MOCK_COMPANIES를 대체할 단일 소스가 없음)
  const [companiesById, setCompaniesById] = useState<Record<string, ApiCompany>>({});
  const [stockSubs, setStockSubs]   = useState<Set<string>>(new Set());
  const [sectorSubs, setSectorSubs] = useState<Record<string, boolean>>({});

  // companiesById에 새 회사 정보를 병합 — 이미 있는 필드(예: 구독 목록에서 온 가격)를
  // 기사 태깅처럼 정보가 적은 소스가 덮어쓰지 않도록, 기존 값 위에 새 값을 얹는 방식으로 병합
  const mergeCompanies = useCallback((list: ApiCompany[]) => {
    if (list.length === 0) return;
    setCompaniesById(prev => {
      const next = { ...prev };
      list.forEach(c => { next[c.id] = { ...next[c.id], ...c }; });
      return next;
    });
  }, []);

  // 기사에 태깅된 회사 참조({id, name})만으로도 아바타/이름 정도는 표시할 수 있게,
  // 아직 companiesById에 없는 회사는 최소 정보로 채워둠 (가격 등은 null)
  const mergeCompanyRefs = useCallback((refs: { id: string; name: string }[]) => {
    setCompaniesById(prev => {
      let changed = false;
      const next = { ...prev };
      refs.forEach(ref => {
        if (!next[ref.id]) {
          next[ref.id] = {
            id: ref.id, name: ref.name, ticker: ref.id,
            logo_url: null, current_price: null, change_rate: null,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  // 앱 최초 실행 시 구독 중인 종목 목록을 실제 API에서 채움
  useEffect(() => {
    fetchSubscribedCompanies()
      .then(list => {
        mergeCompanies(list);
        setStockSubs(new Set(list.map(c => c.id)));
      })
      .catch(err => console.error("구독 종목 목록 불러오기 실패:", err));
  }, [mergeCompanies]);

  // 🚀 새로 추가할 부분: 최근 본 항목 & 구독 목록 가격 즉시/주기적 갱신
  useEffect(() => {
    const tickers = Array.from(new Set([...stockSubs, ...recentIds]));
    if (tickers.length === 0) return;

    let cancelled = false;
    const fetchPrices = () => {
      fetchCompanyPrices(tickers)
        .then(res => { if (!cancelled) mergeCompanies(res); })
        .catch(err => console.error("가격 갱신 실패:", err));
    };

    fetchPrices(); // 추가되자마자 즉시 1회 갱신 (이게 없어서 -원이 떴음)
    const interval = setInterval(fetchPrices, PRICE_REFRESH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [stockSubs, recentIds, mergeCompanies]);

  // 분야 목록 — 처음엔 빈 배열로 시작, 마운트 시 실제 GET /sectors로 채움
  const [sectorGroups, setSectorGroups] = useState<ApiSectorGroup[]>([]);
  useEffect(() => {
    fetchSectorGroups()
      .then(groups => {
        setSectorGroups(groups);
        const initSubs = buildInitSectorSubs(groups); // 디바이스별로 이미 저장된 on/off 상태 그대로 반영
        setSectorSubs(initSubs);
        // 앱을 처음 켰을 때는 저장된 관심 분야를 그대로 피드 필터에 적용해서 시작함
        setAppliedSectorIds(Object.entries(initSubs).filter(([, v]) => v).map(([id]) => Number(id)));
      })
      .catch(err => console.error("분야 목록 불러오기 실패:", err));
  }, []);

  // 홈 화면 "최근 뉴스" — 관심분야 필터와 무관하게 항상 전체 최신 기사 기준으로 별도 조회
  useEffect(() => {
    let cancelled = false;
    fetchArticles(undefined, undefined)
      .then(res => { if (!cancelled) setHomeRecentNews(res.articles); })
      .catch(err => console.error("최근 뉴스 불러오기 실패:", err));
    return () => { cancelled = true; };
  }, []);

  // 분야별 숏츠(메인 피드) 커서 페이지네이션 상태
  const [feedCursor, setFeedCursor]     = useState<number | null>(null);
  const [feedHasMore, setFeedHasMore]   = useState(true);
  const [feedLoading, setFeedLoading]   = useState(false);
  // 메인 피드 분야 필터 — "관심 분야" 패널/숏츠 카드 태그에서 토글 on 해놓은 분야들.
  // 하나도 안 켜져 있으면(초기 상태 포함) 전체 분야 필터 없이 보여줌.
  const onSectorIds = useMemo(
    () => Object.entries(sectorSubs).filter(([, v]) => v).map(([id]) => Number(id)),
    [sectorSubs]
  );
  // 실제로 숏츠 피드에 "적용된" 필터. onSectorIds는 토글하는 즉시 바뀌지만,
  // 숏츠를 보던 중에 태그를 눌러서 구독을 추가/해제해도 피드가 바로 바뀌면 읽던 흐름이
  // 끊기므로, 여기엔 명시적으로 리셋(하단 숏츠 탭 재클릭 등)할 때만 최신 값을 반영한다.
  const [appliedSectorIds, setAppliedSectorIds] = useState<number[]>([]);
  const appliedSectorIdsKey = useMemo(
    () => [...appliedSectorIds].sort((a, b) => a - b).join(","),
    [appliedSectorIds]
  );
  // 숏츠 피드 필터를 지금 시점의 관심 분야 상태로 다시 맞추고 처음부터 새로 로드.
  const resetFeedToCurrentSectors = useCallback(() => {
    setAppliedSectorIds(onSectorIds);
  }, [onSectorIds]);

  // 다음 페이지 로드 — 이미 로딩 중이거나 더 가져올 게 없으면 아무것도 안 함
  const loadMoreArticles = useCallback(async () => {
    if (feedLoading || !feedHasMore) return;
    setFeedLoading(true);
    try {
      const res = await fetchArticles(
        appliedSectorIds.length > 0 ? appliedSectorIds : undefined,
        feedCursor ?? undefined
      );
      setNews(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const merged = [...prev, ...res.articles.filter(a => !existingIds.has(a.id))];
        return merged;
      });
      setFeedCursor(res.nextCursor);
      setFeedHasMore(res.hasMore);
    } catch (err) {
      console.error("기사 목록 불러오기 실패:", err);
    } finally {
      setFeedLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedCursor, feedHasMore, feedLoading, appliedSectorIdsKey]);

  // 앱 최초 실행 시(그리고 appliedSectorIds가 명시적으로 리셋될 때마다) 피드를 처음부터 새로 로드.
  // loadMoreArticles의 feedCursor/feedHasMore 클로저에 기대지 않고 직접 첫 페이지를 받아온다.
  useEffect(() => {
    let cancelled = false;
    setNews([]);
    setViewedArticleIds(new Set());
    setShortsIdx(0);
    setFeedCursor(null);
    setFeedHasMore(true);
    setFeedLoading(true);
    fetchArticles(appliedSectorIds.length > 0 ? appliedSectorIds : undefined, undefined)
      .then(res => {
        if (cancelled) return;
        setNews(res.articles);
        setFeedCursor(res.nextCursor);
        setFeedHasMore(res.hasMore);
      })
      .catch(err => console.error("기사 목록 불러오기 실패:", err))
      .finally(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSectorIdsKey]);

  // 기사에 태깅된 회사들을 companiesById에 계속 병합 — 스와이프로 차트 진입 시(allCompanies
  // 조회) 이름/아바타 정도는 바로 보여줄 수 있게 함 (가격은 구독/검색/prices 조회에서만 붙음)
  useEffect(() => {
    const refs = news.flatMap(a => a.companies);
    if (refs.length > 0) mergeCompanyRefs(refs);
  }, [news, mergeCompanyRefs]);

  // Overlay search
  const [companyQ, setCompanyQ] = useState("");
  const [chartQ, setChartQ]     = useState("");

  // 기업 검색(홈 구독추가 패널) — 입력 디바운스 후 실제 API 조회, 결과는 companiesById에도 병합
  useEffect(() => {
    if (!companyQ.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchCompanies(companyQ)
        .then(results => { if (!cancelled) mergeCompanies(results); })
        .catch(err => console.error("기업 검색 실패:", err));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [companyQ, mergeCompanies]);

  // 기업 검색(차트 탭 종목 선택 패널) — 동일하게 디바운스 후 조회
  useEffect(() => {
    if (!chartQ.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchCompanies(chartQ)
        .then(results => { if (!cancelled) mergeCompanies(results); })
        .catch(err => console.error("기업 검색 실패:", err));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [chartQ, mergeCompanies]);

  // 이름 가나다순 — companiesById는 여러 API 응답이 섞여 병합되는 사전이라 순서가 들쭉날쭉해서,
  // 구독 목록만큼은 예측 가능한 기준(이름순)으로 고정함
  const subCompanies = useMemo(
    () => Object.values(companiesById).filter(c => stockSubs.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [companiesById, stockSubs]
  );

  // 홈 화면 스토리 아바타 안읽음(빨간 테두리) 여부 —
  // "오늘(24시간 이내) 기사 중 하나라도 안 본 게 남아있으면 안읽음"으로 판단.
  // 예전엔 스토리 한 번만 들어가도 전체가 읽음 처리되는 버그가 있어서, storyProgress
  // 기준으로 다시 계산하도록 변경함.
  const unreadCompanyIds = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const result = new Set<string>();
    subCompanies.forEach(c => {
      const arts = news
        .filter(n => n.companies.some(x => x.id === c.id) && new Date(n.published_at).getTime() >= cutoff)
        .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
      if (arts.length === 0) return; // 24시간 내 기사 없으면 안읽음 표시 대상 아님
      const lastViewedId = storyProgress[c.id];
      const lastIdx = lastViewedId != null ? arts.findIndex(a => a.id === lastViewedId) : -1;
      if (lastIdx < arts.length - 1) result.add(c.id); // 아직 최신까지 못 봤으면 안읽음
    });
    return result;
  }, [news, storyProgress, subCompanies]);

  // 홈 화면 스토리 아바타 줄 전용 정렬 — 안 읽은 스토리가 있는 기업을 앞으로, 이미 다 본 건 뒤로.
  // (구독 검색 패널 등 다른 곳에서 쓰는 subCompanies는 이름순 그대로 두고, 여기서만 별도로 재정렬)
  const storyRowCompanies = useMemo(
    () => [...subCompanies].sort((a, b) => {
      const aUnread = unreadCompanyIds.has(a.id);
      const bUnread = unreadCompanyIds.has(b.id);
      if (aUnread === bUnread) return 0; // 같은 그룹 안에서는 원래(이름순) 순서 유지
      return aUnread ? -1 : 1;
    }),
    [subCompanies, unreadCompanyIds]
  );

  // 메인 숏츠 피드 표시 순서 — published_at 내림차순(최신이 맨 앞=위쪽).
  // news 상태 자체는 원본 순서 그대로 두고, 화면에 보여줄 때만 정렬해서 사용.
  const sortedFeed = useMemo(
    () => [...news].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()),
    [news]
  );

  // 분야별 숏츠(메인 피드)에서 "본 기사" 기록 — 숏츠 탭 재클릭 시 여기 쌓인 것들은 화면에서 제외됨
  const [viewedArticleIds, setViewedArticleIds] = useState<Set<number>>(new Set());
  const mainFeedDisplay = useMemo(
    () => sortedFeed.filter(a => !viewedArticleIds.has(a.id)),
    [sortedFeed, viewedArticleIds]
  );

  // 숏츠 스와이프가 피드 끝에서 3개 이내로 가까워지면 다음 페이지 미리 로드
  // (스토리 모드에서는 무한스크롤 대상이 아니라서 storyMode가 없을 때만 동작)
  useEffect(() => {
    if (storyMode) return;
    if (!feedHasMore || feedLoading) return;
    if (shortsIdx >= mainFeedDisplay.length - 3) {
      loadMoreArticles();
    }
  }, [shortsIdx, mainFeedDisplay.length, storyMode, feedHasMore, feedLoading, loadMoreArticles]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addRecentMultiple = useCallback((codes: string[]) => {
    setRecentIds(prev => {
      const filtered = prev.filter(id => !codes.includes(id));
      return [...codes, ...filtered].slice(0, 10);
    });
  }, []);
  const addRecent = useCallback((id: string) => addRecentMultiple([id]), [addRecentMultiple]);

  // 홈("최근 뉴스")/스크랩에서 특정 기사로 바로 이동.
  // 홈의 "최근 뉴스"는 관심분야 필터 없이 별도로 불러온 목록(homeRecentNews)이라, 지금
  // 관심분야 필터가 걸린 news(mainFeedDisplay)엔 그 기사가 없을 수 있음 — 그럴 땐 news에
  // 먼저 끼워넣고, mainFeedDisplay가 갱신된 다음에(아래 effect) 실제 인덱스로 이동시킴.
  const [pendingFeedTarget, setPendingFeedTarget] = useState<number | null>(null);
  const goToArticleInFeed = (id: number, article?: NewsItem) => {
    setStoryMode(null);
    setShortsFrom(null);
    setTab("shorts");
    if (article) {
      setNews(prev => (prev.some(a => a.id === id) ? prev : [article, ...prev]));
    }
    setViewedArticleIds(prev => (prev.has(id) ? new Set([...prev].filter(v => v !== id)) : prev));
    setPendingFeedTarget(id);
  };

  // pendingFeedTarget이 mainFeedDisplay에 실제로 나타나면(주입 직후 리렌더) 그 인덱스로 이동
  useEffect(() => {
    if (pendingFeedTarget == null) return;
    const idx = mainFeedDisplay.findIndex(a => a.id === pendingFeedTarget);
    if (idx >= 0) {
      setShortsIdx(idx);
      setPendingFeedTarget(null);
    }
  }, [pendingFeedTarget, mainFeedDisplay]);

  // 스토리 진입: 그 기업 태깅 + 24시간 이내 기사 실시간 조회 (오래된 순 고정 정렬/24시간 필터는 백엔드가 처리)
  const goFromCompany = async (cId: string) => {
    const company = companiesById[cId];
    try {
      const res = await fetchStoryArticles(cId);
      if (res.articles.length === 0) return; // 24시간 내 기사가 없으면 진입 안 함
      mergeCompanyRefs(res.articles.flatMap(a => a.companies));

      // 이어보기: 서버가 내려준 is_viewed 기준으로, 마지막으로 본 기사 다음(안 본 것)부터 시작
      const lastViewedIdx = res.articles.reduce((acc, a, i) => (a.is_viewed ? i : acc), -1);
      const startIdx = lastViewedIdx >= 0 ? Math.min(lastViewedIdx + 1, res.articles.length - 1) : 0;

      setStoryMode({ companyId: cId, articles: res.articles });
      setStoryIdx(startIdx);
      setShortsFrom(company?.name ?? null);
      setTab("shorts");
    } catch (err) {
      console.error("스토리 조회 실패:", err);
    }
  };

  // 스토리 모드에서 벗어날 때(다른 탭으로 이동 등) 호출
  const exitStory = () => { setStoryMode(null); setShortsFrom(null); };

  // 스토리 진행 상황 기록 — 더 앞으로 나아갈 때만 갱신 (뒤로 돌려봐도 진행도는 안 줄어듦)
  useEffect(() => {
    if (!storyMode) return;
    const currentArticle = storyMode.articles[storyIdx];
    if (!currentArticle) return;
    setStoryProgress(prev => {
      const existingId  = prev[storyMode.companyId];
      const existingIdx = existingId != null ? storyMode.articles.findIndex(a => a.id === existingId) : -1;
      if (storyIdx > existingIdx) {
        markStoryViewed(storyMode.companyId, currentArticle.id).catch(err => {
          console.error("스토리 열람 기록 실패:", err); // 실패해도 로컬 진행도는 유지 (재시도는 다음 진입 시)
        });
        return { ...prev, [storyMode.companyId]: currentArticle.id };
      }
      return prev;
    });
  }, [storyIdx, storyMode]);

  // 낙관적 업데이트: 화면은 즉시 바뀌고, 실패하면 롤백
  const toggleLike = (id: number) => {
    const article = news.find(n => n.id === id);
    if (!article) return;
    const wasLiked = article.is_liked;
    setNews(p => p.map(n => n.id === id ? { ...n, is_liked: !n.is_liked } : n));
    (wasLiked ? deleteInteraction(id, "LIKED") : postInteraction(id, "LIKED"))
      .catch(err => {
        console.error("좋아요 처리 실패:", err);
        setNews(p => p.map(n => n.id === id ? { ...n, is_liked: wasLiked } : n));
      });
  };

  const toggleScrap = (id: number) => {
    const article = news.find(n => n.id === id);
    if (!article) return;
    const wasScrapped = article.is_scrapped;
    setNews(p => p.map(n => n.id === id ? { ...n, is_scrapped: !n.is_scrapped } : n));
    (wasScrapped ? deleteInteraction(id, "SCRAPPED") : postInteraction(id, "SCRAPPED"))
      .catch(err => {
        console.error("스크랩 처리 실패:", err);
        setNews(p => p.map(n => n.id === id ? { ...n, is_scrapped: wasScrapped } : n));
      });
  };
  // 낙관적 업데이트로 구독 on/off, 실패하면 롤백. 새로 구독한 종목은 검색 결과엔 가격이
  // 안 붙어서 오므로(companies.js 주석 참고), 성공하면 별도로 현재가를 한 번 더 받아옴
  const toggleStockSub = (ticker: string) => {
    const wasSub = stockSubs.has(ticker);
    setStockSubs(p => { const n = new Set(p); wasSub ? n.delete(ticker) : n.add(ticker); return n; });
    setCompanySubscription(ticker, !wasSub)
      .then(() => { if (!wasSub) fetchCompanyPrices([ticker]).then(mergeCompanies).catch(() => {}); })
      .catch(err => {
        console.error("종목 구독 처리 실패:", err);
        setStockSubs(p => { const n = new Set(p); wasSub ? n.add(ticker) : n.delete(ticker); return n; }); // 롤백
      });
  };
  const setSectorSubVal = (id: string, val: boolean) => {
    const prevVal = sectorSubs[id] ?? false;
    setSectorSubs(p => ({ ...p, [id]: val }));
    setSectorSubscription(Number(id), val).catch(err => {
      console.error("분야 구독 처리 실패:", err);
      setSectorSubs(p => ({ ...p, [id]: prevVal })); // 실패 시 롤백
    });
  };
  const toggleSectorSub = (id: string) => setSectorSubVal(id, !(sectorSubs[id] ?? false));

  // Panel → single chart (always single mode)
  const handleSelectChartCompany = (id: string) => {
    addRecent(id);
    setChartMode({ type: "single", companyId: id });
    setOverlay(null);
    setChartQ("");
  };

  // Dual view → drill into single
  const handleChartSelectSingle = (id: string) => {
    setChartMode({ type: "single", companyId: id });
  };

  // ── Unified gesture handler ────────────────────────────────────────────────
  const ptrRef = useRef<{ sx: number; sy: number; lx: number; ly: number } | null>(null);

  const onPtrDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button,input,a")) return;
    ptrRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY };
    if (tab === "shorts") {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };
  const onPtrMove = (e: React.PointerEvent) => {
    if (!ptrRef.current) return;
    ptrRef.current.lx = e.clientX;
    ptrRef.current.ly = e.clientY;
    if (tab === "shorts") {
      const dy = e.clientY - ptrRef.current.sy, dx = e.clientX - ptrRef.current.sx;
      if (Math.abs(dy) > Math.abs(dx)) setShortsOffset(dy * 0.16);
    }
  };
  const processGesture = () => {
    if (!ptrRef.current) return;
    const { sx, sy, lx, ly } = ptrRef.current;
    ptrRef.current = null;
    setShortsOffset(0);
    const dx = lx - sx, dy = ly - sy;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      const ci = TAB_ORDER.indexOf(tab);
      if (dx < 0) {
        if (tab === "shorts") {
          const cur = storyMode ? storyMode.articles[storyIdx] : mainFeedDisplay[shortsIdx];
          const codes = cur.companies.map(c => c.id);
          if (codes.length > 0) {
            addRecentMultiple(codes);
            if (codes.length === 1) {
              setChartMode({ type: "single", companyId: codes[0] });
            } else {
              setChartMode({ type: "dual", companyIds: [codes[0], codes[1]] });
            }
          }
          setTab("chart");
        } else if (ci < TAB_ORDER.length - 1) {
          setTab(TAB_ORDER[ci + 1]);
        }
      } else {
        if (ci > 0) { setTab(TAB_ORDER[ci - 1]); exitStory(); }
      }
    } else if (tab === "shorts" && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 48) {
      if (storyMode) {
        // 스토리 모드도 메인 피드와 동일한 방향으로 통일: 위로 스와이프(dy<0)=다음, 아래로(dy>0)=이전
        const len = storyMode.articles.length;
        if (dy < 0 && storyIdx < len - 1) setStoryIdx(i => i + 1);
        else if (dy > 0 && storyIdx > 0)  setStoryIdx(i => i - 1);
      } else {
        if (dy < 0 && shortsIdx < mainFeedDisplay.length - 1) setShortsIdx(i => i + 1);
        else if (dy > 0 && shortsIdx > 0)           setShortsIdx(i => i - 1);
      }
    }
  };
  const onPtrUp    = () => processGesture();
  const onPtrLeave = () => { if (ptrRef.current) processGesture(); };

  // 마우스 휠 스크롤로도 숏츠를 한 개씩 넘길 수 있게 (웹 배포 시 트랙패드/휠 사용자 대응).
  // 휠 이벤트는 한 번 스크롤에도 여러 번 연달아 발생하므로, 짧은 잠금 구간을 둬서
  // "한 번 넘김"이 여러 개로 씹히지 않게 함.
  const wheelLockRef = useRef(false);
  const onWheel = (e: React.WheelEvent) => {
    if (tab !== "shorts") return;
    if ((e.target as HTMLElement).closest("button,input,a")) return;
    if (Math.abs(e.deltaY) < 16) return; // 아주 작은 휠 흔들림은 무시
    if (wheelLockRef.current) return;
    wheelLockRef.current = true;
    setTimeout(() => { wheelLockRef.current = false; }, 450);

    if (storyMode) {
      const len = storyMode.articles.length;
      if (e.deltaY > 0 && storyIdx < len - 1) setStoryIdx(i => i + 1);
      else if (e.deltaY < 0 && storyIdx > 0) setStoryIdx(i => i - 1);
    } else {
      if (e.deltaY > 0 && shortsIdx < mainFeedDisplay.length - 1) setShortsIdx(i => i + 1);
      else if (e.deltaY < 0 && shortsIdx > 0) setShortsIdx(i => i - 1);
    }
  };

  // CompanySearchPanel은 자체 필터링을 안 하므로 여기서 직접 필터링.
  // 검색어가 없을 땐 "전체 목록" 대신 이미 구독 중인 기업들을 기본으로 보여줌
  // (백엔드 GET /companies는 q 파라미터 없이는 호출 불가능해서, 검색어 입력 전엔
  // 어차피 전체 종목 목록 자체를 알 수 없음 — 대신 구독 목록은 항상 갖고 있으니 그걸 기본값으로 사용)
  const filteredForSearch = companyQ
    ? Object.values(companiesById).filter(c => c.name.includes(companyQ) || c.ticker.includes(companyQ))
    : subCompanies;
  // CompanySelectPanel은 내부에서 query 기준으로 다시 필터링하므로, 여기선 지금까지 알고 있는
  // 회사 전체(companiesById)를 그대로 넘기면 됨 — 디바운스 검색 결과가 들어오는 대로 반영됨
  const filteredForSelect = Object.values(companiesById);

  return (
    <div style={{ minHeight: "100vh", background: "#020406", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Inter',system-ui,sans-serif" }}>
      <div
        style={{ width: 390, height: 844, flexShrink: 0, position: "relative", background: "#07090f", borderRadius: 50, overflow: "hidden", border: "1px solid #151d30", boxShadow: "0 0 0 8px #0c0f1a,0 50px 120px rgba(0,0,0,0.95),inset 0 0 0 1px rgba(255,255,255,0.035)" }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerLeave={onPtrLeave}
        onWheel={onWheel}
      >

        <div style={{ position: "absolute", top: 12, bottom: 64, left: 0, right: 0, overflow: "hidden" }}>
          {tab === "home" && (
            <HomeTab news={homeRecentNews} subCompanies={storyRowCompanies} unreadIds={unreadCompanyIds}
              stockSubs={stockSubs} sectorSubs={sectorSubs}
              onMenuPress={() => setOverlay("interest")}
              onAddCompany={() => setOverlay("companySearch")}
              onCompanyPress={goFromCompany}
              onNewsPress={goToArticleInFeed} />
          )}
          {tab === "shorts" && (() => {
            const displayedNews = storyMode ? storyMode.articles : mainFeedDisplay;
            const displayedIdx  = storyMode ? storyIdx : shortsIdx;
            const viewedIndex   = storyMode
              ? (() => {
                  const lastId = storyProgress[storyMode.companyId];
                  return lastId != null ? storyMode.articles.findIndex(a => a.id === lastId) : -1;
                })()
              : undefined;

            if (displayedNews.length === 0) {
              // 안 본 기사가 하나도 안 남은 상태 — 빈 배열 인덱싱으로 화면이 꺼지는 대신 안내문구 표시
              return (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#07090f", padding: "0 32px" }}>
                  <span style={{ fontSize: 32 }}>📭</span>
                  <div style={{ color: "#c8d4f0", fontSize: 14, fontWeight: 600, textAlign: "center" }}>지금은 여기까지예요</div>
                  <div style={{ color: "#c8d4f0", fontSize: 12, textAlign: "center", lineHeight: 1.65 }}>새로운 뉴스가 올라오면{"\n"}이어서 보여드릴게요</div>
                </div>
              );
            }

            return (
              <ShortsTab news={displayedNews} currentIndex={displayedIdx} fromCompany={shortsFrom}
                storyViewedIndex={viewedIndex}
                visualOffset={shortsOffset} stockSubs={stockSubs} sectorSubs={sectorSubs}
                onLike={toggleLike} onScrap={toggleScrap}
                onMenuPress={() => setOverlay("interest")}
                onToggleStockSub={toggleStockSub} onToggleSectorSub={toggleSectorSub} />
            );
          })()}
          {tab === "chart" && (
            <ChartTab chartMode={chartMode} allCompanies={filteredForSelect}
              onMenuPress={() => setOverlay("companySelect")}
              onSelectSingle={handleChartSelectSingle} />
          )}
          {tab === "scrap" && (
            <ScrapTab news={news.filter(n => n.is_scrapped)}
              onPress={goToArticleInFeed} />
          )}
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: "rgba(7,9,15,0.97)", backdropFilter: "blur(24px)", borderTop: "1px solid #141c2e", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 20px", zIndex: 30 }}>
          {TABS.map(({ id, Icon }) => (
            <button key={id} onClick={() => {
              if (id === "shorts") {
                if (storyMode) {
                  exitStory(); // 스토리 보던 중이면 메인 피드로 복귀
                } else if (tab === "shorts") {
                  // 이미 분야별 숏츠를 보고 있는 상태에서 탭을 다시 누르면: 지금까지 본 것 숨기고 맨 위(최신)로,
                  // 그리고 그 사이에 관심 분야를 새로 토글했다면 이 시점에만 필터를 최신으로 반영
                  const viewedNow = mainFeedDisplay.slice(0, shortsIdx + 1).map(a => a.id);
                  setViewedArticleIds(prev => new Set([...prev, ...viewedNow]));
                  setShortsIdx(0);
                  resetFeedToCurrentSectors();
                }
                setTab("shorts");
              } else {
                setTab(id);
                exitStory();
              }
            }} style={{ width: 48, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, border: "none", cursor: "pointer", transition: "all 0.15s", background: tab === id ? "rgba(255,255,255,0.06)" : "transparent", color: tab === id ? "white" : "#283248" }}>
              <Icon size={22} strokeWidth={tab === id ? 2.5 : 1.7} style={tab === id ? { filter: "drop-shadow(0 0 5px rgba(255,255,255,0.22))" } : undefined} />
            </button>
          ))}
        </div>

        {overlay && (
          <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)" }} onClick={() => setOverlay(null)}>
            <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 305, background: "#0a0e18", borderRight: "1px solid #141c2e", overflow: "hidden", animation: "slideL 0.28s cubic-bezier(0.22,1,0.36,1)" }} onClick={e => e.stopPropagation()}>
              {overlay === "interest" && (
                <InterestPanel groups={sectorGroups} subs={sectorSubs} onToggleSub={setSectorSubVal} onClose={() => setOverlay(null)} />
              )}
              {overlay === "companySearch" && (
                <CompanySearchPanel query={companyQ} onQueryChange={setCompanyQ} companies={filteredForSearch} stockSubs={stockSubs} onToggle={toggleStockSub} onClose={() => { setOverlay(null); setCompanyQ(""); }} />
              )}
              {overlay === "companySelect" && (
                <CompanySelectPanel query={chartQ} onQueryChange={setChartQ} allCompanies={filteredForSelect} subCompanies={subCompanies} recentIds={recentIds} onSelect={handleSelectChartCompany} onClose={() => { setOverlay(null); setChartQ(""); }} />
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideL { from { transform:translateX(-100%); } to { transform:translateX(0); } }
        * { -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
        ::placeholder { color:#283248; }
        input { font-family:inherit; }
      `}</style>
    </div>
  );
}
