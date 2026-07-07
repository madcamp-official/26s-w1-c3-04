import { useState, useRef, useMemo, useCallback, useEffect, useId } from "react";
import {
  Home, Play, BarChart2, Bookmark, Menu, Plus, Heart,
  Share2, X, Search, Check, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import {
  MOCK_ARTICLES, MOCK_COMPANIES, MOCK_SECTOR_GROUPS,
  INIT_RECENT_COMPANY_IDS,
  getCompanyColor, getCompanyInitials, getSectorColor, timeAgo,
  formatChangeRate, formatPrice,
  type ApiArticle, type ApiCompany, type ApiSectorGroup,
} from "./mockData";
import { registerDevice, fetchCompanyChart, type ServerPricePoint } from "./apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────
// NewsItem/Company는 이제 API 응답 타입을 그대로 사용합니다.
// (필드명이 API와 동일하므로, 나중에 fetch 결과를 그대로 넣으면 됩니다)
type NewsItem = ApiArticle;
type Company  = ApiCompany;

type Tab      = "home" | "shorts" | "chart" | "scrap";
type Overlay  = null | "interest" | "companySearch" | "companySelect";
type Timeframe = "day" | "week" | "month";
type TSt      = "on" | "off" | "partial";
type ChartMode =
  | { type: "single"; companyId: string }
  | { type: "dual";   companyIds: [string, string] };

const TAB_ORDER: Tab[] = ["home", "shorts", "chart", "scrap"];

// ─── 초기 상태 계산 (mockData 기준) ────────────────────────────────────────────
const INIT_STOCK_SUBS = new Set(MOCK_COMPANIES.filter(c => c.is_subscribed).map(c => c.id));
const INIT_RECENT     = INIT_RECENT_COMPANY_IDS;

// sectors 구조(그룹>세부분야, is_on)에서 "세부분야id → on/off" 플랫 맵 생성
function buildInitSectorSubs(groups: ApiSectorGroup[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  groups.forEach(g => g.sectors.forEach(s => { map[s.id] = s.is_on; }));
  return map;
}
const INIT_SUBS = buildInitSectorSubs(MOCK_SECTOR_GROUPS);

// ─── Utilities ────────────────────────────────────────────────────────────────
function isUp(company: Company) { return company.change_rate >= 0; }

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
function HomeTab({ news, subCompanies, unreadIds, onMenuPress, onAddCompany, onCompanyPress, onNewsPress }: {
  news: NewsItem[]; subCompanies: Company[]; unreadIds: Set<string>;
  onMenuPress: () => void; onAddCompany: () => void;
  onCompanyPress: (id: string) => void; onNewsPress: (id: number) => void;
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
        <div style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, background: "linear-gradient(135deg,#1a3a9c,#4466cc)" }}>이</div>
      </div>
      <div style={{ display: "flex", gap: 14, padding: "8px 20px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
        <button onClick={onAddCompany} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, background: "transparent", border: "none", cursor: "pointer" }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", border: "2px dashed #2a3352", background: "#0f1420", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} color="#404870" strokeWidth={2} /></div>
          <span style={{ color: "#404870", fontSize: 10, width: 54, textAlign: "center" }}>추가</span>
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
              <span style={{ color: "#7080a8", fontSize: 10, width: 54, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
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
              <div style={{ color: "#404870", fontSize: 9, fontWeight: 600, letterSpacing: "0.03em", marginBottom: 2 }}>{label}</div>
              <div style={{ color: up ? "#f43f5e" : "#3b82f6", fontSize: 19, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 1 }}>{pct}</div>
              <div style={{ color: up ? "rgba(244,63,94,0.5)" : "rgba(59,130,246,0.5)", fontSize: 10, marginBottom: 8 }}>{val}</div>
              <Sparkline data={[...data]} up={up} />
            </div>
          ))}

          {/* Company cards — sorted by |change_rate| desc, top 5 */}
          {[...subCompanies]
            .sort((a, b) => Math.abs(b.change_rate) - Math.abs(a.change_rate))
            .slice(0, 5)
            .map(c => {
              const up = isUp(c);
              const color = getCompanyColor(c.id);
              const initials = getCompanyInitials(c.name);
              const seed = c.id.charCodeAt(0) * 7 + c.id.charCodeAt(1) * 3;
              // deterministic sparkline: slight trend matching up/down, ends at current price
              const sparkData = Array.from({ length: 8 }, (_, i) => {
                const r = Math.sin((seed + 5) * 127.1 + i * 311.7) * 0.5 + 0.5;
                const trend = up ? (i / 7) * 0.05 : -(i / 7) * 0.05;
                return Math.round(c.current_price * (0.975 + trend + (r - 0.5) * 0.018));
              });
              sparkData[7] = c.current_price; // anchor last point to current price
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
          const firstSector = item.sectors[0];
          return (
            <button key={item.id} onClick={() => onNewsPress(item.id)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", borderBottom: idx < recentHeadlines.length - 1 ? "1px solid #111828" : "none", padding: "11px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: "#252e46", fontSize: 11, fontWeight: 600, paddingTop: 1, width: 14, flexShrink: 0 }}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#a8b8d8", fontSize: 13, lineHeight: 1.45, textDecoration: "underline", textDecorationColor: "#1e2a40", textUnderlineOffset: 3 }}>{item.summary_headline}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ color: "#2e3d5a", fontSize: 10 }}>{item.source_name}</span>
                    <span style={{ color: "#1e2840", fontSize: 10 }}>·</span>
                    <span style={{ color: "#2e3d5a", fontSize: 10 }}>{timeAgo(item.published_at)}</span>
                    {item.companies.length > 1 && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: "rgba(255,170,0,0.12)", color: "#ffaa44" }}>2종목</span>}
                    {firstSector && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: item.companies.length > 0 ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.04)", color: item.companies.length > 0 ? "#f87096" : "#404870" }}>{firstSector.name}</span>}
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
  if (!item) return null; // 방어 코드: 빈 배열/범위 밖 인덱스로 화면이 꺼지는 것 방지 (부모에서 빈 상태 화면을 대신 보여줌)
  const firstSector = item.sectors[0];
  const isSectorSub = firstSector ? (sectorSubs[firstSector.id] ?? false) : false;
  const isDual      = item.companies.length > 1;
  const accentColor = getSectorColor(firstSector?.id ?? "etc_pub");
  const firstCompany = item.companies[0];
  const fromCompanyInitials = firstCompany ? getCompanyInitials(firstCompany.name) : null;
  const fromCompanyColor    = firstCompany ? getCompanyColor(firstCompany.id) : null;

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
        <div style={{ borderRadius: 18, overflow: "hidden", marginBottom: 8, height: 130, position: "relative", flexShrink: 0, border: "1px solid #1a2240" }}>
          <img src={item.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.42) saturate(0.75)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(7,9,15,0.88) 0%,transparent 55%)" }} />
          <div style={{ position: "absolute", top: 10, left: 12, display: "flex", gap: 6, alignItems: "center" }}>
            {firstSector && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(7,9,15,0.7)", backdropFilter: "blur(8px)", border: `1px solid ${accentColor}50`, color: accentColor, letterSpacing: "0.03em" }}>{firstSector.name}</span>}
            {isDual && <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 20, background: "rgba(255,170,0,0.15)", border: "1px solid rgba(255,170,0,0.3)", color: "#ffaa44" }}>2종목</span>}
          </div>
          {/* Headline — tap to open source URL (source_url) */}
          <button
            onClick={e => { e.stopPropagation(); window.open(item.source_url, "_blank", "noopener"); }}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 12px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ color: "#e8f0ff", fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{item.summary_headline}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 3, letterSpacing: "0.03em" }}>↗ 원문 보기</div>
          </button>
        </div>

        {/* Summary — text on left, action icons on right */}
        <div style={{ background: "#0d1220", borderRadius: 18, padding: "12px 14px", marginBottom: 8, flex: 1, minHeight: 0, overflow: "hidden", border: "1px solid #1a2240", display: "flex", gap: 10 }}>
          {/* Text column */}
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{ color: "#2e4060", fontSize: 9, letterSpacing: "0.12em", fontWeight: 600, textTransform: "uppercase", marginBottom: 7 }}>요약</div>
            <div style={{ color: "#8fa8cc", fontSize: 14, lineHeight: 1.65 }}>{item.summary_body}</div>
          </div>
          {/* Action icons — vertically centered in summary box */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {[
              { icon: <Heart size={18} color={item.is_liked ? "#f43f5e" : "rgba(255,255,255,0.4)"} fill={item.is_liked ? "#f43f5e" : "none"} />, bg: item.is_liked ? "rgba(244,63,94,0.13)" : "rgba(255,255,255,0.06)", fn: (e: React.MouseEvent) => { e.stopPropagation(); onLike(item.id); } },
              { icon: <Bookmark size={18} color={item.is_scrapped ? "#3b82f6" : "rgba(255,255,255,0.4)"} fill={item.is_scrapped ? "#3b82f6" : "none"} />, bg: item.is_scrapped ? "rgba(59,130,246,0.13)" : "rgba(255,255,255,0.06)", fn: (e: React.MouseEvent) => { e.stopPropagation(); onScrap(item.id); } },
              { icon: <Share2 size={18} color="rgba(255,255,255,0.4)" />, bg: "rgba(255,255,255,0.06)", fn: (e: React.MouseEvent) => { e.stopPropagation(); } },
            ].map(({ icon, bg, fn }, i) => (
              <button key={i} onClick={fn} style={{ width: 34, height: 34, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Important reason */}
        <div style={{ background: "#0e0a1a", borderRadius: 18, padding: "12px 14px", marginBottom: 10, flexShrink: 0, border: "1px solid #2a1845" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 11 }}>⚠️</span>
            <span style={{ color: "#6a42a8", fontSize: 9, letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>중요한 이유</span>
          </div>
          <div style={{ color: "#b890e8", fontSize: 14, lineHeight: 1.6 }}>{item.importance_reason}</div>
        </div>

        {/* Footer tags */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: "#283248", fontSize: 10, marginBottom: 7 }}>{item.source_name} · {timeAgo(item.published_at)}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {item.companies.map(company => (
              <button
                key={company.id}
                onClick={e => { e.stopPropagation(); onToggleStockSub(company.id); }}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "#0d1220", borderRadius: 20, padding: "5px 10px", border: "1px solid #1a2240", cursor: "pointer" }}
              >
                <span style={{ color: "#c8d4f0", fontSize: 11, fontWeight: 500 }}>{company.name}</span>
                {stockSubs.has(company.id) ? <Check size={9} color="#4488ff" strokeWidth={2.5} /> : <Plus size={9} color="#404870" strokeWidth={2} />}
              </button>
            ))}
            {firstSector && (
              <button
                onClick={e => { e.stopPropagation(); onToggleSectorSub(firstSector.id); }}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "#0d1220", borderRadius: 20, padding: "5px 10px", border: "1px solid #1a2240", cursor: "pointer" }}
              >
                <span style={{ color: "#c8d4f0", fontSize: 11 }}>{firstSector.name}</span>
                {isSectorSub ? <Check size={9} color="#4488ff" strokeWidth={2.5} /> : <Plus size={9} color="#404870" strokeWidth={2} />}
              </button>
            )}
          </div>
        </div>
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

      {/* Swipe hint */}
      {item.companies.length > 0 && (
        <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none" }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.04em", background: "rgba(255,255,255,0.04)", borderRadius: 20, padding: "3px 10px", border: "1px solid rgba(255,255,255,0.06)" }}>
            {isDual ? "← 스와이프하면 2종목 비교 →" : "← 스와이프하면 차트 →"}
          </span>
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
  const [series, setSeries] = useState<ServerPricePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 종목 바뀔 때마다 실제 KIS 연동 API 호출 (일별 고정)
  useEffect(() => {
    let cancelled = false;
    setSeries(null);
    setError(null);
    fetchCompanyChart(c.id, "day")
      .then(res => { if (!cancelled) setSeries(res.price_series); })
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
        <div style={{ color: "#404870", fontSize: 11, textAlign: "center" }}>{error}</div>
      </div>
    );
  }
  if (!series || series.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#404870", fontSize: 13 }}>차트 불러오는 중...</span>
      </div>
    );
  }

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

  const up  = last >= first;
  const pct = ((last - first) / first * 100).toFixed(2);
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
          <div style={{ color: "#304060", fontSize: 12, marginTop: 2 }}>{c.ticker}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ color: "#e2e8f8", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>{last.toLocaleString()}</div>
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
            <div style={{ color: "#304060", fontSize: 9, marginBottom: 4 }}>{label}</div>
            <div style={{ color: clr, fontSize: 11, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mini Chart Card (for Dual View) ─────────────────────────────────────────
function MiniChartCard({ company: c, onPress }: { company: Company; onPress: () => void }) {
  const [series, setSeries] = useState<ServerPricePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSeries(null);
    setError(null);
    fetchCompanyChart(c.id, "day")
      .then(res => { if (!cancelled) setSeries(res.price_series); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "불러오기 실패"); });
    return () => { cancelled = true; };
  }, [c.id]);

  const color = getCompanyColor(c.id);
  const initials = getCompanyInitials(c.name);

  if (error || !series || series.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1220", borderRadius: 20, border: "1px solid #1a2240", minHeight: 0 }}>
        <span style={{ color: "#404870", fontSize: 12 }}>{error ?? "차트 불러오는 중..."}</span>
      </div>
    );
  }

  const data = series.map((p, i) => ({ i, price: p.close }));
  const first = series[0].open, last = series[series.length - 1].close;
  const up = last >= first, pct = ((last - first) / first * 100).toFixed(2), lc = up ? "#f43f5e" : "#3b82f6";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0d1220", borderRadius: 20, border: "1px solid #1a2240", overflow: "hidden", minHeight: 0 }}>
      {/* Company info — tappable: navigates to single view per spec */}
      <button onClick={onPress} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px", flexShrink: 0, background: "transparent", border: "none", borderBottom: "1px solid #141c2e", cursor: "pointer", textAlign: "left", width: "100%" }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e2e8f8", fontWeight: 700, fontSize: 15 }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
            <span style={{ color: "#304060", fontSize: 10 }}>{c.ticker}</span>
            <ChevronRight size={10} color="#304060" strokeWidth={2} />
            <span style={{ color: "#4060a0", fontSize: 10 }}>상세 차트</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#e2e8f8", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>{last.toLocaleString()}</div>
          <div style={{ color: lc, fontSize: 13, fontWeight: 700 }}>{up ? "+" : ""}{pct}%</div>
        </div>
      </button>

      {/* Sparkline — non-interactive div so horizontal swipe on chart area still navigates tabs */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
            <Line type="monotone" dataKey="price" stroke={lc} strokeWidth={2.5}
              dot={false} isAnimationActive={false} />
          </LineChart>
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
          <span style={{ marginLeft: "auto", color: "#304060", fontSize: 11 }}>{getC(chartMode.companyId)?.ticker}</span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {!chartMode ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: "0 32px" }}>
            <BarChart2 size={44} color="#1a2240" />
            <div style={{ color: "#c8d4f0", fontSize: 14, fontWeight: 600, textAlign: "center" }}>아직 본 종목이 없어요</div>
            <div style={{ color: "#404870", fontSize: 12, textAlign: "center", lineHeight: 1.65 }}>숏츠 카드에서 좌우 스와이프하거나{"\n"}검색으로 종목을 추가해보세요</div>
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
        <span style={{ background: "#0d1220", border: "1px solid #1a2240", borderRadius: 10, padding: "2px 8px", color: "#404870", fontSize: 11, fontWeight: 600 }}>{news.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", scrollbarWidth: "none" }}>
        {news.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <Bookmark size={38} color="#1a2240" />
            <span style={{ color: "#304060", fontSize: 13 }}>저장된 뉴스가 없습니다</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {news.map(item => {
              const firstCompany = item.companies[0];
              const firstSector  = item.sectors[0];
              const accentColor  = getSectorColor(firstSector?.id ?? "etc_pub");
              const companyColor = firstCompany ? getCompanyColor(firstCompany.id) : null;
              const companyInitials = firstCompany ? getCompanyInitials(firstCompany.name) : null;
              return (
                <button key={item.id} onClick={() => onPress(item.id)} style={{ textAlign: "left", background: "#0d1220", borderRadius: 18, overflow: "hidden", border: "1px solid #1a2240", cursor: "pointer" }}>
                  <div style={{ position: "relative", height: 68 }}>
                    <img src={item.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.38) saturate(0.65)" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right,rgba(13,18,32,0.7) 0%,transparent 55%)" }} />
                    <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
                      {companyColor && <div style={{ width: 20, height: 20, borderRadius: "50%", background: companyColor, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 8, fontWeight: 700 }}>{companyInitials}</div>}
                      {firstSector && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 12, background: `${accentColor}20`, border: `1px solid ${accentColor}35`, color: accentColor }}>{firstSector.name}</span>}
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px 12px" }}>
                    <div style={{ color: "#c8d4f0", fontSize: 13, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.summary_headline}</div>
                    <div style={{ color: "#2e3d5a", fontSize: 10, marginTop: 5 }}>{item.source_name} · {timeAgo(item.published_at)}</div>
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
function InterestPanel({ groups, subs, onToggleSub, onClose, onSectorPress }: {
  groups: ApiSectorGroup[]; subs: Record<string, boolean>; onToggleSub: (id: string, val: boolean) => void;
  onClose: () => void; onSectorPress: (subId: string) => void;
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
                  <button onClick={() => onSectorPress(sub.id)} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                    <span style={{ color: "#7080a8", fontSize: 12 }}>{sub.name}</span>
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
          <Search size={13} color="#304060" />
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} placeholder="기업명 또는 종목코드" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f8", fontSize: 13, caretColor: "#4488ff" }} />
          {query && <button onClick={() => onQueryChange("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={12} color="#304060" /></button>}
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
                <div style={{ color: "#2e3d5a", fontSize: 11, marginTop: 1 }}>{c.ticker}</div>
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
          <Search size={13} color="#304060" />
          <input type="text" value={query} onChange={e => onQueryChange(e.target.value)} placeholder="기업명 검색" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f8", fontSize: 13, caretColor: "#4488ff" }} />
          {query && <button onClick={() => onQueryChange("")} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={12} color="#304060" /></button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
        {!query && recentCompanies.length > 0 && (
          <>
            <div style={{ color: "#283248", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase", padding: "4px 0 8px" }}>최근 본 항목</div>
            {recentCompanies.map(c => <SelectRow key={c.id} company={c} onSelect={onSelect} />)}
          </>
        )}
        {list.length > 0 && (
          <>
            <div style={{ color: "#283248", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase", padding: `${!query && recentCompanies.length > 0 ? "12px" : "4px"} 0 8px` }}>
              {query ? "검색 결과" : "구독 중인 기업"}
            </div>
            {list.map(c => <SelectRow key={c.id} company={c} onSelect={onSelect} />)}
          </>
        )}
        {list.length === 0 && query && <div style={{ color: "#404870", fontSize: 12, padding: "20px 0", textAlign: "center" }}>검색 결과가 없습니다</div>}
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
        <div style={{ color: "#2e3d5a", fontSize: 11, marginTop: 1 }}>{formatPrice(c.current_price)}원</div>
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

  // Chart: mode-based (single or dual), no more card stack
  const [chartMode, setChartMode]           = useState<ChartMode | null>({ type: "single", companyId: "005930" });
  const [recentIds, setRecentIds]           = useState<string[]>(INIT_RECENT);

  // Data — mockData.ts에서 API 응답 구조 그대로 초기화
  const [news, setNews]             = useState<NewsItem[]>(MOCK_ARTICLES);
  const [stockSubs, setStockSubs]   = useState(new Set(INIT_STOCK_SUBS));
  const [sectorSubs, setSectorSubs] = useState(INIT_SUBS);

  // Overlay search
  const [companyQ, setCompanyQ] = useState("");
  const [chartQ, setChartQ]     = useState("");

  const subCompanies = MOCK_COMPANIES.filter(c => stockSubs.has(c.id));

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

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addRecentMultiple = useCallback((codes: string[]) => {
    setRecentIds(prev => {
      const filtered = prev.filter(id => !codes.includes(id));
      return [...codes, ...filtered].slice(0, 10);
    });
  }, []);
  const addRecent = useCallback((id: string) => addRecentMultiple([id]), [addRecentMultiple]);

  // 홈/스크랩에서 특정 기사로 바로 이동 — 새로고침으로 이미 숨겨진 기사여도 그 기사만 다시 노출시켜서 정확히 이동
  const goToArticleInFeed = (id: number) => {
    setStoryMode(null);
    setShortsFrom(null);
    setTab("shorts");
    setViewedArticleIds(prev => {
      const nextViewed = prev.has(id) ? new Set([...prev].filter(v => v !== id)) : prev;
      const resultDisplay = sortedFeed.filter(a => !nextViewed.has(a.id));
      const idx = resultDisplay.findIndex(a => a.id === id);
      setShortsIdx(idx >= 0 ? idx : 0);
      return nextViewed;
    });
  };

  // 스토리 진입: 그 기업 태깅 + 24시간 이내 기사만, 오래된 순으로 고정 정렬(최신이 맨 아래)
  const goFromCompany = (cId: string) => {
    const company = MOCK_COMPANIES.find(x => x.id === cId);
    const cutoff  = Date.now() - 24 * 60 * 60 * 1000;
    const storyArticles = news
      .filter(n => n.companies.some(c => c.id === cId) && new Date(n.published_at).getTime() >= cutoff)
      .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());

    if (storyArticles.length === 0) return; // 24시간 내 기사가 없으면 진입 안 함

    // 이어보기: 마지막으로 본 기사 다음(안 본 것)부터 시작
    const lastViewedId = storyProgress[cId];
    const lastIdx = lastViewedId != null ? storyArticles.findIndex(a => a.id === lastViewedId) : -1;
    const startIdx = lastIdx >= 0 ? Math.min(lastIdx + 1, storyArticles.length - 1) : 0;

    setStoryMode({ companyId: cId, articles: storyArticles });
    setStoryIdx(startIdx);
    setShortsFrom(company?.name ?? null);
    setTab("shorts");
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
        return { ...prev, [storyMode.companyId]: currentArticle.id };
      }
      return prev;
    });
  }, [storyIdx, storyMode]);

  const toggleLike      = (id: number)   => setNews(p => p.map(n => n.id === id ? { ...n, is_liked: !n.is_liked } : n));
  const toggleScrap     = (id: number)   => setNews(p => p.map(n => n.id === id ? { ...n, is_scrapped: !n.is_scrapped } : n));
  const toggleStockSub  = (code: string) => setStockSubs(p => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleSectorSub = (id: string)   => setSectorSubs(p => ({ ...p, [id]: !p[id] }));
  const setSectorSubVal = (id: string, val: boolean) => setSectorSubs(p => ({ ...p, [id]: val }));

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

  const filteredForSearch = MOCK_COMPANIES.filter(c => !companyQ || c.name.includes(companyQ) || c.ticker.includes(companyQ));
  const filteredForSelect = MOCK_COMPANIES.filter(c => !chartQ  || c.name.includes(chartQ)  || c.ticker.includes(chartQ));

  return (
    <div style={{ minHeight: "100vh", background: "#020406", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Inter',system-ui,sans-serif" }}>
      <div
        style={{ width: 390, height: 844, flexShrink: 0, position: "relative", background: "#07090f", borderRadius: 50, overflow: "hidden", border: "1px solid #151d30", boxShadow: "0 0 0 8px #0c0f1a,0 50px 120px rgba(0,0,0,0.95),inset 0 0 0 1px rgba(255,255,255,0.035)" }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerLeave={onPtrLeave}
      >
        <StatusBar />

        <div style={{ position: "absolute", top: 44, bottom: 64, left: 0, right: 0, overflow: "hidden" }}>
          {tab === "home" && (
            <HomeTab news={news} subCompanies={subCompanies} unreadIds={unreadCompanyIds}
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
                  <div style={{ color: "#404870", fontSize: 12, textAlign: "center", lineHeight: 1.65 }}>새로운 뉴스가 올라오면{"\n"}이어서 보여드릴게요</div>
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
            <ChartTab chartMode={chartMode} allCompanies={MOCK_COMPANIES}
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
                  // 이미 분야별 숏츠를 보고 있는 상태에서 탭을 다시 누르면: 지금까지 본 것 숨기고 맨 위(최신)로
                  const viewedNow = mainFeedDisplay.slice(0, shortsIdx + 1).map(a => a.id);
                  setViewedArticleIds(prev => new Set([...prev, ...viewedNow]));
                  setShortsIdx(0);
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
                <InterestPanel groups={MOCK_SECTOR_GROUPS} subs={sectorSubs} onToggleSub={setSectorSubVal} onClose={() => setOverlay(null)} onSectorPress={() => { setOverlay(null); exitStory(); setTab("shorts"); }} />
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
