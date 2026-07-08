# API 명세서 — 관심 종목 중심 경제 뉴스 요약 서비스

## 공통 사항

- **Base URL**: `/api/v1`
- **인증 방식**: 로그인 없음. 클라이언트가 최초 실행 시 생성한 UUID를 모든 요청 헤더에 실어 보냅니다.
  - 헤더: `X-Device-Id: {device_uuid}`
  - 디바이스 등록 API(`POST /devices`) 제외한 모든 API에서 필수
- **응답 포맷**: JSON, 성공 시 `200/201`, 실패 시 아래 공통 에러 포맷

```json
{
  "error_code": "RESOURCE_NOT_FOUND",
  "message": "해당 기사를 찾을 수 없습니다."
}
```

### 공통 에러 코드

| 에러 코드 | HTTP Status | 상황 |
|---|---|---|
| DEVICE_ID_MISSING | 400 | `X-Device-Id` 헤더가 없음 |
| DEVICE_NOT_FOUND | 404 | 헤더의 device_uuid가 등록되지 않음 |
| RESOURCE_NOT_FOUND | 404 | 요청한 기사/종목/분야 등이 존재하지 않음 |
| VALIDATION_ERROR | 400 | 요청 파라미터 형식/값 오류 |
| DUPLICATE_ACTION | 409 | 이미 처리된 구독/좋아요/스크랩을 중복 요청 |
| EXTERNAL_API_ERROR | 502 | KIS Open API 등 외부 연동 실패 |
| INTERNAL_ERROR | 500 | 서버 내부 오류 |

---

## 1. 디바이스

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| POST | /devices | 앱 최초 실행 시 디바이스 등록 (이미 있으면 조회만 하고 그대로 반환 — upsert) | `{ "device_uuid": "string(36)" }` | `{ "device_id": 1, "device_uuid": "...", "created_at": "2026-07-05T10:00:00Z" }` | VALIDATION_ERROR |

---

## 2. 홈

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /home | 홈 화면 데이터 일괄 조회 (스토리 레일 + 지수/관심종목 요약카드 + 최근 뉴스 헤드라인) | 없음 (헤더만) | 아래 예시 참고 | DEVICE_ID_MISSING, DEVICE_NOT_FOUND |

```json
{
  "stories": [
    { "company_id": 1, "name": "삼성전자", "has_unread": true }
  ],
  "summary_cards": [
    { "type": "index", "name": "KOSPI", "price": 2650.3, "change_rate": 0.8, "sparkline": [2610,2630,2650] }
  ],
  "recent_headlines": [
    { "article_id": 101, "summary_headline": "...", "published_at": "..." }
  ]
}
```

> **`top_headlines` → `recent_headlines`로 이름 변경.** 스코어링을 폐지하면서 "중요도순 상위 N개"가 아니라 **`published_at` 내림차순(최신순) 상위 5~10개**(기본 8개)로 의미가 바뀌어 필드명도 맞춤. 기사 목록(`GET /articles`)의 필드명과 통일하기 위해 `headline` → `summary_headline`으로 변경.
>
> `has_unread` 판단 기준은 아래 "6. 종목" 섹션 각주 참고 (동일한 기준을 씀).

---

## 3. 숏츠 피드 (기사)

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /articles | 기사 목록 조회 — 아래 두 가지 모드로 동작 | query: `sector_id?`, `company_id?`, `cursor?`, `limit?`(기본 10) | 아래 참고 | DEVICE_ID_MISSING, VALIDATION_ERROR(잘못된 cursor) |
| GET | /articles/{article_id} | 기사 단건 조회 (딥링크/스크랩 진입용, VIEWED 여부 무관하게 항상 조회 가능) | path: `article_id` | 아래 articles 배열의 원소 하나와 동일한 객체 | RESOURCE_NOT_FOUND |

### 3-1. 기본 모드 (`company_id` 없음) — 분야별 숏츠

- **필터**: 안 본 기사만(`VIEWED` 기록 없는 것)
- **정렬**: `published_at` 내림차순(최신순, 최신이 맨 앞)
- **페이지네이션**: `cursor` 기반 무한스크롤
- 스코어링 폐지로 `final_influence_score` 필드 삭제 (아래 응답 예시에 없음)

> **바닥 도달 시**: 더 이상 보여줄(안 본) 기사가 없으면 `"exhausted": true`와 함께 `"message": "지금은 여기까지예요, 새로운 뉴스를 기다려주세요"`를 같이 내려줌. (예전의 "5점 미만 비노출" 동적 임계값 로직은 스코어링 폐지로 함께 삭제됨)

### 3-2. 스토리 모드 (`company_id` 있음) — 기업별 스토리

- **필터**: 그 기업이 태깅된 기사 중 **최근 24시간 이내** 전체 (`VIEWED` 여부 무관 — 이미 본 것도 포함)
- **정렬**: `published_at` **오름차순**(오래된 것부터, 최신이 배열 맨 끝)으로 **고정** — 순서가 절대 안 바뀜
- **페이지네이션 없음**: 24시간 이내 전체를 한 번에 반환 (`cursor` 무시)
- 이어보기는 클라이언트가 응답 배열 안에서 `Story_view_logs.last_viewed_article_id`의 위치를 찾아 그 다음부터 표시 (서버는 배열만 주고, "어디부터 볼지" 판단은 클라이언트가 함)

```json
{
  "articles": [
    {
      "id": 101,
      "source_name": "한국경제",
      "title": "...",
      "source_url": "https://...",
      "thumbnail_url": "...",
      "summary_headline": "...",
      "summary_body": "...",
      "importance_reason": "...",
      "like_count": 12,
      "is_liked": false,
      "is_scrapped": false,
      "companies": [{ "id": 5, "name": "삼성전자" }],
      "sectors": [{ "id": 3, "name": "반도체" }],
      "published_at": "..."
    }
  ],
  "next_cursor": "abc123",
  "has_more": true,
  "exhausted": false
}
```

> `next_cursor`, `has_more`, `exhausted`는 **기본 모드(3-1)에서만 의미 있음**. 스토리 모드(3-2)는 페이지네이션이 없으므로 이 필드들은 응답에서 생략하거나 무시.

---

## 4. 기사 액션 (열람 / 좋아요 / 스크랩)

`Device_Article_Interaction` 테이블의 `interaction_type`(VIEWED/LIKED/SCRAPPED)을 그대로 사용합니다.

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| POST | /articles/{article_id}/interactions | 열람/좋아요/스크랩 기록 | body: `{ "interaction_type": "VIEWED" \| "LIKED" \| "SCRAPPED" }` | `{ "article_id":101, "interaction_type":"LIKED", "created_at":"..." }` | RESOURCE_NOT_FOUND, VALIDATION_ERROR(잘못된 type 값), DUPLICATE_ACTION(이미 같은 type 존재) |
| DELETE | /articles/{article_id}/interactions/{interaction_type} | 좋아요/스크랩 취소 (VIEWED는 취소 불가) | path | `{ "deleted": true }` | RESOURCE_NOT_FOUND, VALIDATION_ERROR(VIEWED 삭제 시도) |

> **분야별 숏츠(3-1)에서 "새로고침 시 본 것 숨기기"는 이 `VIEWED` 인터랙션을 기준으로 필터링됨.** 프론트가 새로고침 시점에 그동안 지나온 기사들에 대해 이 API로 `VIEWED`를 기록하면, 다음 조회부터 자동으로 제외됨.

---

## 5. 스크랩

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /scraps | 스크랩한 기사 목록 (최신순, 썸네일/태그/헤드라인 포함) | query: `cursor?`, `limit?` | `{ "articles": [{ "id":101, "thumbnail_url":"...", "summary_headline":"...", "companies":[...], "sectors":[...], "scrapped_at":"..." }], "next_cursor":"...", "has_more": false }` | DEVICE_ID_MISSING |

---

## 6. 종목 (Companies)

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /companies | 종목 검색 (구독 추가 화면, 차트 검색 패널 공용) | query: `q`(검색어), `limit?` | `{ "companies": [{ "id":5, "name":"삼성전자", "ticker":"005930", "is_subscribed": true }] }` | VALIDATION_ERROR(q 누락) |
| GET | /companies/subscriptions | 내가 구독 중인 종목 목록 (스토리 레일 / 워치리스트 / 차트 패널 "구독 중인 기업"에 공용) | 없음 | `{ "companies": [{ "id":5, "name":"삼성전자", "ticker":"005930", "has_unread": true }] }` | DEVICE_ID_MISSING |
| POST | /companies/{company_id}/subscriptions | 종목 구독 추가 | path | `{ "company_id":5, "subscribed_at":"..." }` | RESOURCE_NOT_FOUND, DUPLICATE_ACTION |
| DELETE | /companies/{company_id}/subscriptions | 종목 구독 해제 | path | `{ "deleted": true }` | RESOURCE_NOT_FOUND |
| GET | /companies/recent-views | 차트 탭 "최근 본 항목" 목록 (최근 조회순) | query: `limit?` | `{ "companies": [{ "id":5, "name":"삼성전자", "ticker":"005930", "last_viewed_at":"..." }] }` | DEVICE_ID_MISSING |

> **`has_unread` 판단 기준** (홈 `stories`, 여기 `subscriptions` 둘 다 동일하게 적용):
> 그 기업의 **최근 24시간 이내 기사** 중, `id`가 `Story_view_logs.last_viewed_article_id`보다 **큰(=더 최신인)** 기사가 하나라도 있으면 `true`. 24시간 내 기사가 아예 없으면 `false`. 한 번도 스토리를 안 봐서 `last_viewed_article_id`가 없으면, 24시간 내 기사가 하나라도 있는 이상 `true`.

---

## 7. 차트

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /companies/{company_id}/chart | 종목 단일 상세 시세 조회 (KIS Open API 프록시). 조회 즉시 `Device_Company_View_Logs`에 최근 본 항목으로 기록 | path: `company_id`, query: `period=day\|week\|month` | `{ "company_id":5, "ticker":"005930", "current_price":72000, "change_rate":1.2, "price_series": [{ "time":"2026-07-04","open":71000,"high":72500,"low":70800,"close":72000,"volume":1234000 }] }` | RESOURCE_NOT_FOUND, VALIDATION_ERROR(잘못된 period), EXTERNAL_API_ERROR |
| GET | /companies/chart/compare | 기사에 종목이 2개 태깅된 경우 복합 뷰 — 두 종목 병렬 조회. 조회 즉시 두 종목 모두 최근 본 항목으로 기록 | query: `company_ids=5,7`, `period=day\|week\|month` | `{ "companies": [{ "company_id":5, ... }, { "company_id":7, ... }] }` (각 원소는 단일 상세와 동일 구조) | VALIDATION_ERROR(company_ids 개수 ≠ 2), RESOURCE_NOT_FOUND, EXTERNAL_API_ERROR |

---

## 8. 분야 (Sectors)

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| GET | /sectors | 대분류(5개) + 하위 분야 전체 목록, 디바이스별 스위치 on/off 상태 포함 | 없음 | `{ "groups": [{ "group_name": "소비재/문화/트렌드", "sectors": [{ "id":12, "name":"엔터테인먼트", "is_on": true }, { "id":13, "name":"뷰티", "is_on": false }] }] }` | DEVICE_ID_MISSING |
| POST | /sectors/{sector_id}/subscriptions | 하위 분야 스위치 켜기 | path | `{ "sector_id":12, "on": true }` | RESOURCE_NOT_FOUND, DUPLICATE_ACTION |
| DELETE | /sectors/{sector_id}/subscriptions | 하위 분야 스위치 끄기 | path | `{ "sector_id":12, "on": false }` | RESOURCE_NOT_FOUND |
| POST | /sectors/groups/{group_name}/subscriptions | 대분류 일괄 켜기 (그룹 내 모든 하위 분야 on — "전체선택" 로직) | path: `group_name` | `{ "group_name":"소비재/문화/트렌드", "sector_ids":[12,13,14] }` | RESOURCE_NOT_FOUND(없는 그룹명) |
| DELETE | /sectors/groups/{group_name}/subscriptions | 대분류 일괄 끄기 | path: `group_name` | `{ "group_name":"소비재/문화/트렌드", "deleted_count":3 }` | RESOURCE_NOT_FOUND |

---

## 9. 스토리

| Method | Endpoint | 설명 | 요청 | 응답 | 에러 |
|---|---|---|---|---|---|
| POST | /companies/{company_id}/story-views | 스토리 열람 시 마지막으로 본 기사 갱신 — `last_viewed_article_id` 갱신 (안읽음 빨간 테두리 → 회색 전환 판단에 쓰임) | path: `company_id`, body: `{ "article_id": 101 }` | `{ "company_id":5, "last_viewed_article_id":101 }` | RESOURCE_NOT_FOUND, VALIDATION_ERROR(article_id 누락 또는 그 기업 기사가 아님) |

> **예전(`last_viewed_at` 시각 기록)과의 차이**: 이전엔 "지금 몇 시인지"만 저장하면 됐지만, 지금은 **클라이언트가 정확히 어느 기사까지 봤는지를 `article_id`로 알려줘야** 서버가 저장할 수 있음. 클라이언트는 스토리 안에서 더 앞으로(최신 쪽으로) 나아갈 때마다 이 API를 호출해서 진행 상황을 갱신함 — 단, 뒤로 돌려서 과거 기사를 다시 봐도 `article_id`가 이전 값보다 작으면 갱신하지 않음(진행도가 거꾸로 줄어들지 않게).

---

## 참고 — 명세서 항목과 API 매핑

| 기능 명세 항목 | 관련 API |
|---|---|
| 뉴스 자동 수집/요약 (백그라운드 배치, 클라이언트에 노출되는 API 아님. 스코어링 없음 — 경제신문 증권 파트 수집 후 그대로 저장) | 내부 파이프라인 — 별도 API 없음 |
| 종목/분야 태깅 표시, 탭하면 구독 토글 | GET /articles, POST/DELETE /companies/{id}/subscriptions, POST/DELETE /sectors/{id}/subscriptions |
| 구독 시스템 | 6. 종목, 8. 분야 |
| 홈 | 2. 홈 |
| 분야별 숏츠 (최신순, 새로고침 시 본 것 숨김) | 3-1. 숏츠 피드(기본 모드), 4. 기사 액션(VIEWED) |
| 기업별 스토리 (24시간 고정순서, 이어보기) | 3-2. 숏츠 피드(스토리 모드), 9. 스토리 |
| 차트 | 7. 차트 |
| 스크랩 | 5. 스크랩 |
| 스토리 아바타 레일 (안읽음 빨간 테두리) | 2. 홈(stories), 6. 종목(has_unread 기준) |
