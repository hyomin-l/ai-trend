# PRD — AI Trend

> 이름: **AI Trend**. 일반 명사 조합이라 상표 충돌 부담이 없다. 제호는 마젠타 'AI' + 잉크 세리프 'Trend'. 사이트는 `hyomin-l.github.io/ai-trend`.

> 월·수·금 아침, 흩어진 AI 트렌드를 한 장의 신문으로 묶어 주는 개인 브리핑 웹앱.
> Next.js(정적 export) + JSON 스냅샷 + `claude -p`(구독 Claude, 별도 API 키 없음) + GitHub Actions/Pages.
> 이 문서는 프로젝트 전체를 규정하며, **Features**의 각 항목이 구현·테스트 단위다.

## Problem Statement

그룹 AX 업무를 하는 실무자는 AI 트렌드를 계속 팔로우해야 한다. 지금은 GitHub, Hacker News, Reddit, 국내외 기사, Threads·인스타그램 피드가 내 알고리즘에 우연히 뜨기를 기다리는 방식이다. 그래서 세 가지 문제가 생긴다.

- **누락:** 중요한 레포와 이슈가 알고리즘에 안 뜨면 그냥 놓친다.
- **분산:** 소스마다 앱과 사이트를 오가며 확인해야 한다.
- **휘발:** 지난주에 본 내용을 다시 찾기 어렵고, 팀 공유나 보고용으로 재활용하기 어렵다.

메신저 요약 봇은 텍스트 나열이라 한눈에 들어오지 않는다. 우리 업종(건설·소재, 금융, 물류, 유통, 미디어)의 AX 사례는 일반 AI 뉴스에 묻혀 따로 찾아야 한다.

## Solution

**월·수·금 새벽(05:17 KST)에 자동으로 발행되는 AI 신문.**

1. 수집기가 공개 API와 RSS로 원천을 모아 중복을 제거한다.
2. 구독 중인 Claude(`claude -p`)를 **1회만** 호출해 섹션 분류, 선별, 한/영 1~2문장 요약을 받는다.
3. 그날 판을 JSON 스냅샷으로 저장하고 정적 사이트로 배포한다.

사용자는 아침에 사이트 한 장을 5분 안에 훑고, 관심 기사의 원문으로 이동한다. 지난 호는 날짜별로 그대로 남아 다시 볼 수 있다(스냅샷 아카이브). Phase 2에서는 바탕화면을 걸어 다니는 미니 캐릭터(Desk Pet)가 새 판 발행을 말풍선으로 알려 준다.

대상 사용자: 본인 1인. 팀 공유는 URL 전달 수준이며 로그인은 없다.

### 지면 구성 (섹션)

| key | EN | KO | 담는 것 | 원천 |
|---|---|---|---|---|
| `front` | Front Page | 1면 | 그날 가장 중요한 3건(리드 1 + 서브 2). 전 섹션에서 선별 | (curate 결과) |
| `repos` | Rising Repos | 급상승 레포 | 최근 생성됐거나 스타가 급증한 AI 레포 | GitHub Search API |
| `pulse` | Community Pulse | 커뮤니티 펄스 | 개발자·커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News(Algolia), Reddit RSS, GeekNews |
| `newsroom` | Newsroom | 뉴스룸 | 국내외 AI·빅테크 주요 뉴스 | TechCrunch AI, The Verge AI, AI타임스 |
| `ax` | AX in the Field | 현장의 AX | 산업별 AI 도입·전환 사례(국내외) | Google News RSS: 업종 키워드 × AI |
| `playbook` | Playbook | 플레이북 | AI 작업 방식, 에이전트 활용법, UI/UX 인사이트 | Simon Willison, UX Collective, NN/g |

`ax` 업종 키워드(`config/sources.ts`, 편집 가능): 건설·건자재·시멘트 / 금융·증권 / 물류 / 유통·리테일 / 미디어·방송. 국문 쿼리와 영문 쿼리를 함께 수집한다. 기사 속 회사명은 그대로 노출하고, 카드에 업종 태그를 붙인다.

## Features

1. **collector**: 원천 수집과 전처리.
   - 소스 어댑터(GitHub, HN, RSS 공용)가 병렬로 수집하고, 정규화 `RawItem{id, source, section, title, url, snippet, publishedAt, metrics}`으로 변환한다.
   - 전처리: URL 정규화 중복 제거 → 기간 필터(최근 72h, 레포는 30일) → **이전 판 중복 제거** → 소스별 상위 N개 → 전체 약 80건.
   - 이전 판 중복 제거: 최근 10개 판에 실린 id(URL 해시)는 후보에서 제외한다. 레포만 예외로, 마지막 등장 대비 ★가 +50% 이상 늘었으면 "재등장"으로 다시 후보에 넣는다.
   - 레포 순위는 ★ 속도(stars ÷ 생성 후 일수)로 매긴다.
   - 소스 하나가 실패해도 나머지로 계속 진행하고, 실패한 소스를 `failedSources`에 기록한다.
2. **curator**: `claude -p` 1회 호출.
   - 입력: 약 80건의 `{id, source, section 후보, title, snippet ≤200자}` + 직전 3개 판의 헤드라인 목록.
   - 지시: 같은 사건은 1건으로 합치고, 직전 판에서 다룬 사건은 새로운 진전이 없으면 제외한다.
   - 출력: JSON `{front:[id×3], items:[{id, section, region, industry?, title{ko,en}, summary{ko,en}, takeaway{ko,en}}]}` 약 30건.
     - `summary`: 2~3문장. 지면 카드에서는 2줄로 자르고, 모달에서는 전문을 보여 준다.
     - `takeaway`: 실무 시사점 1문장.
     - 레포의 `summary`에는 "무엇을 하는 도구인지"를 쓴다.
   - 호출 옵션: `claude -p --model sonnet --system-prompt <큐레이터 지침> --tools "" --strict-mcp-config --no-session-persistence --output-format json`.
     - Claude Code 기본 시스템 프롬프트와 도구, MCP 정의를 싣지 않아 입력 토큰을 최소화한다.
   - **URL·지표는 원천 데이터에서만 가져온다.** LLM이 만든 링크는 쓰지 않는다(환각 차단). 원천에 없는 id는 버린다.
   - 실패 시(프로세스 오류, JSON 파싱 실패, 시간 초과) 원문 제목·스니펫으로 `curated:false` 판을 발행한다.
3. **snapshot-store**: `data/snapshots/YYYY-MM-DD.json` 저장, 목록, 조회.
   - 호수(issue)는 스냅샷 개수 + 1이다.
   - 재등장 레포는 마지막 등장 판 대비 `starsDelta`(★ 증가량)를 계산한다.
   - 같은 날 재실행하면 덮어쓴다.
4. **edition-web**: 지면 화면.
   - 경로: `/` = 최신판(ko), `/[lang]/[date]` = 특정 판, `/latest.json` = 최신판 원본(Desk Pet용).
   - **랜딩(`/`)은 곧 최신판 지면이다.** 별도 소개 페이지는 두지 않는다.
   - 상단바(스크롤 시 고정): 제호 로고, 섹션 바로가기, 검색, 지난 호, KO/EN. 좁은 화면에서는 메뉴 버튼으로 접고 펼친다.
   - 마스트헤드: 제호, 날짜, 호수.
   - **한 화면 지면:** 데스크톱(1440×900 기준)에서 스크롤 없이 전 섹션이 보인다.
     - 3단 그리드: 1면(리드 + 서브 2) | 뉴스룸 + 현장의 AX | ★ 시세표(레포) + 커뮤니티 펄스 + 플레이북.
     - 섹션당 표시 개수는 고정하고, 나머지는 섹션 머리를 눌러 목록 모달로 본다. 모바일에서는 1단으로 흐른다.
   - 항목: 헤드라인 + 2줄 요약 + 출처·상대시간. `repos`는 시세표 행(이름, 한 줄 설명, ★, ★/일, 등락)이다.
   - **상세 모달**(네이티브 `<dialog>`): 항목을 누르면 전체 요약, 시사점, 지표, 출처, 원문 보기(새 탭)가 뜬다. Esc와 바깥 클릭으로 닫힌다.
   - **일자 변경:** 상단바의 ‹ 날짜 › 버튼과 발행일 목록(select)으로 지난 호로 이동한다.
   - UI 문구 사전(ko/en)은 한 파일로 관리한다.
   - 빈 상태(스냅샷 0개), 일부 소스 실패 표기, 미요약 판(`curated:false`) 배지를 둔다.
5. **globe**: 마스트헤드 옆 점묘 지구본(`cobe`).
   - 그날 기사의 지역(KR/US/EU/CN/JP/GLOBAL)에 마커를 표시한다.
   - 지역 칩(button)을 클릭하면 해당 지역 기사만 강조한다. 키보드로도 조작할 수 있다.
   - `prefers-reduced-motion`이면 회전하지 않는다.
6. **schedule-deploy**: GitHub Actions.
   - cron `17 20 * * 0,2,4`(UTC) = 월·수·금 05:17 KST. 06:20 출근 전 발행이 목표이며, 정각 혼잡을 피해 17분에 둔다. 수동 실행(`workflow_dispatch`)도 지원한다.
   - 순서: collect → 스냅샷 commit → `next build`(static export) → GitHub Pages 배포.
   - 인증: `claude setup-token`으로 발급한 구독 OAuth 토큰을 `CLAUDE_CODE_OAUTH_TOKEN` 시크릿으로 둔다(사용자가 직접 등록).
7. **search**: 사이트 내 검색.
   - 빌드할 때 전체 호의 기사를 `search-index.json` 하나로 묶는다(날짜, 섹션, 제목·요약 ko/en, 출처, URL).
   - `/[lang]/search`에서 브라우저가 바로 거르고, 결과는 날짜별로 묶어 "지난 호 스크랩"처럼 보여 준다. 섹션 필터를 함께 제공한다.
   - 서버나 검색 API는 쓰지 않는다. 1년 기준 약 4.7k건, 약 2MB.
8. **desk-pet** (Phase 2): macOS 데스크톱 캐릭터.
   - Swift 단일 파일을 `swiftc`로 빌드한다. 투명 always-on-top 창 위에 미니멀 봇이 떠 있다.
   - 봇 디자인: 마젠타 바디에 알약형 눈 2개, 원형이 아닌 출렁이는 실루엣(시안 A/B/C 중 선택). 그라데이션 하이라이트와 그림자로 입체감을 주고, 둥실 떠다니며 가끔 눈을 깜빡인다. 드래그로 위치를 옮길 수 있다.
   - 30분마다 `/latest.json`을 확인해 새 판이면 리드 헤드라인을 말풍선으로 띄운다.
   - 클릭하면 사이트를 연다. 메뉴바 아이콘으로 종료하거나 숨길 수 있다.

## Scope & Priorities

**코어(이게 없으면 제품이 아님)**
- `collector` → `curator` → `snapshot-store` → `edition-web` → `schedule-deploy`

**보강**
- `globe`(시각적 인상과 지역 필터): edition-web 직후
- `search`(지난 호 검색): globe 다음
- `desk-pet`(알림 채널): 웹 배포 이후 Phase 2

권장 빌드 순서: 위 Features 번호 순서.

## Out of Scope

- **Instagram·Threads 직접 수집**
  - Instagram은 키워드·트렌드 API가 없다.
  - Threads 키워드 검색은 Meta 개발자 앱 + 테스터 권한(`threads_keyword_search`)으로 가능하지만, 토큰을 60일마다 갱신해야 해서 v2로 미룬다.
  - 대신 크리에이터들이 주로 인용하는 원천(HN·Reddit·GitHub·GeekNews·공식 블로그)을 직접 수집한다.
- **Claude가 웹을 직접 검색하는 에이전트 방식:** 토큰이 10배 이상 들고 링크 환각 위험이 있다.
- **DB(SQLite 등):** 하루 1파일 JSON 스냅샷으로 충분하다.
- **웹 검색 API(Tavily 등):** 현재 원천은 모두 링크를 직접 주고, 키워드 검색이 필요한 `ax`는 Google News RSS가 무료로 대신한다. 뉴스가 아닌 웹 자료(백서, 사례 리포트)가 필요해지면 키가 있을 때만 켜지는 선택형 원천으로 추가한다.
- **로그인·멀티유저, 메신저 푸시, md 내보내기, Hugging Face 등 추가 원천:** 필요가 확인되면 추가한다.

## Further Notes

**토큰 예산**
- 1회 실행 = `claude -p` 1회. 기본 모델은 `sonnet`(항상 최신 Sonnet)이고 `config`에서 바꿀 수 있다.
- 모델 선택 근거: 기사 선별, 같은 사건 병합, 한국어 요약, JSON 형식 안정성의 균형. Haiku는 판단과 한국어 뉘앙스가 약하고, Opus는 Pro 한도 대비 과하다.
- 입력 약 10k tokens 이하(80건 × 제목 + 200자 스니펫), 출력 약 6k tokens 이하(30건 × 한/영 1~2문장).
- 주 3회 기준 Pro 한도에 거의 영향이 없다.

**아키텍처**
```
config/sources.ts      원천·업종 키워드·한도(N, 기간) — 코드와 분리된 설정
lib/rss.ts             RSS/Atom 파서(순수 함수)
lib/sources.ts         소스 어댑터 → RawItem[]
lib/prep.ts            중복 제거·필터·상한(순수 함수)
lib/curate.ts          프롬프트 생성, claude -p 실행, 응답 검증, 폴백
lib/snapshots.ts       저장·목록·조회·starsDelta
scripts/collect.ts     파이프라인 진입점 (npm run collect)
app/                   정적 지면 (Server Components), components/ = 지면 부품
types/index.ts         타입 단일 관리
```

**스냅샷 스키마**
```json
{
  "date": "2026-10-13",
  "issue": 1,
  "generatedAt": "ISO",
  "curated": true,
  "failedSources": [],
  "front": ["id"],
  "items": [{
    "id": "sha1(url)",
    "section": "repos|pulse|newsroom|ax|playbook",
    "source": "GitHub",
    "url": "https://...",
    "publishedAt": "ISO",
    "region": "KR|US|EU|CN|JP|GLOBAL",
    "industry": "construction|finance|logistics|retail|media",
    "title": {"ko": "", "en": ""},
    "summary": {"ko": "", "en": ""},
    "takeaway": {"ko": "", "en": ""},
    "metrics": {"stars": 0, "starsPerDay": 0, "starsDelta": 0, "points": 0, "comments": 0, "language": ""},
    "returning": false
  }]
}
```

**테스트 (vitest, 네트워크·LLM은 고정 응답)**
- RSS/Atom 파싱(CDATA, Atom link href)
- 전처리(중복 URL, 기간 밖 제외, 이전 판 중복 제외와 레포 재등장 규칙, 소스별 상한)
- curate 응답 검증(없는 id 제거, 깨진 JSON → 폴백)
- ★ 속도·starsDelta 계산, 호수 증가

**디자인 방향:** NYT풍 모노톤 에디토리얼에 마젠타 포인트.
- **색:** 노란기 없는 뉴트럴 페이퍼(#F7F7F5)에 아주 옅은 노이즈 종이 질감, 잉크(#121212)와 회색 단계를 쓴다. 마젠타(#C2186F)는 섹션 표식, 등락 ▲, 링크 호버, 활성 내비, 지구본 마커에만 쓴다. 다크 모드는 "야간판"(잉크 바탕 + 종이색 글자)이다.
- **서체:** 제호는 절제된 크기(Instrument Serif), 헤드라인은 Noto Serif KR / Newsreader, 본문·요약은 Pretendard, 숫자·메타는 IBM Plex Mono. 본문 가독성을 우선한다(14~15px, 행간 1.6).
- **구성:** 제목을 과하게 키우지 않는다. 위계는 크기보다 굵기, 괘선, 여백으로 만든다. 카드와 그림자 없이 괘선으로 구획하고, 밀도는 적당히 높게 잡는다. 사진은 쓰지 않는다.
- **모션:** 지구본 회전과 모달 전환만 둔다(`prefers-reduced-motion` 존중).
- **접근성:** 대비 AA, 포커스 링, 키보드로 모달과 날짜 조작이 가능해야 한다.
