# PRD — AI Trend

월·수·금 아침, 흩어진 AI 트렌드를 한 장의 지면으로 묶어 발행하는 정적 웹앱의 현행 제품 사양.
Next.js(정적 export) + JSON 스냅샷 + `claude -p`(구독 Claude, 별도 API 키 없음) + GitHub Actions/Pages.

## 1. 목적과 대상 독자

- **문제:** AI 트렌드(레포, 커뮤니티 토론, 기사, 업종별 사례)가 여러 채널에 흩어져 있어 누락·분산·휘발이 생긴다.
- **해결:** 정해진 원천을 코드가 수집하고, LLM이 선별·요약해 하루 한 장으로 발행한다. 지난 호는 날짜별로 보존해 다시 찾아볼 수 있다.
- **대상 독자:** 기업 AI 전환(AX) 실무자. 아침에 5분 안에 훑고 관심 기사의 원문으로 이동하는 사용 패턴을 가정한다. 로그인·계정은 없다.

## 2. 발행 주기

- 월·수·금 05:17 KST(cron `17 20 * * 0,2,4`, UTC). 정각 혼잡을 피해 17분에 둔다.
- 수동 실행(`workflow_dispatch`)을 지원한다.
- 호수(issue)는 스냅샷 개수 기준으로 증가한다. 날짜 기준은 KST.

## 3. 지면 구성

### 3.1 오늘의 3줄

전 섹션에서 고른 그날의 핵심 3건(`front`, 첫 번째가 리드). 헤드라인, 요약, "왜 중요한가"를 보여 준다.

### 3.2 지역 + 지구본

기사의 `region`(KR/US/EU/CN/JP/GLOBAL; 한국·미국·유럽·중국·일본·글로벌)을 지구본(`cobe`)에 마커로 표시한다. 지역 패널에서 지역을 고르면 해당 기사만 모아 본다.

### 3.3 섹션 (지면 순서)

섹션당 4건을 표시하고(`DISPLAY`), 나머지는 섹션 머리를 눌러 목록 모달로 본다.

| 순서 | key | KO | EN | 정의 | 원천 |
|---|---|---|---|---|---|
| 1 | `newsroom` | 뉴스룸 | Newsroom | 국내외 AI·빅테크 주요 뉴스 | 언론: TechCrunch AI, The Verge AI, AI타임스(국내는 AI타임스만). 공식 발표: OpenAI, Google AI, Google DeepMind, Anthropic(community 미러 피드). 큐레이터는 section이 newsroom인 소스만 뉴스룸에 둔다. 기간은 언론과 같은 72시간 |
| 2 | `playbook` | AI 플레이북 | AI Playbook | AI 작업 방식, 에이전트 활용법, UI/UX 인사이트 | Simon Willison, Latent Space, One Useful Thing, UX Collective, NN/g, Hamel Husain, Interconnects, Anthropic Engineering(미러), Hugging Face Blog |
| 3 | `ax` | 현장의 AX | AX in the Field | 업종별 AI 도입·전환 사례 | Google News RSS: 일반 기업 AX 쿼리 + 업종(건설·금융·물류·유통·미디어) 키워드, 국문·영문 |
| 4 | `repos` | 급상승 레포 | Rising Repos | 최근 일주일간 스타가 가장 많이 늘어난 AI 레포(생성일 무관) + Hugging Face 트렌딩 모델(좋아요·다운로드, 최대 5건, 4번째 자리마다 끼워 넣음) | Hugging Face Hub API(`sort=trendingScore`, GGUF·양자화·uncensored 등 재패키징 모델 제외). GitHub Trending 주간(전체·python·typescript, 비공식 HTML) + 생성일 조회 GitHub REST. 트렌딩 소스가 3건 미만이면 GitHub Search(토픽 llm, ai-agents, mcp, generative-ai, 최근 30일 생성)로 대체. OSS Insight 트렌드 API는 2026-03부터 데이터 품질 문제로 비어 있어 제외 |
| 5 | `pulse` | 커뮤니티 | Community Pulse | 개발자 커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News(검색어 "AI"), Reddit(r/LocalLLaMA+ClaudeAI+MachineLearning 주간 top), GeekNews |

원천은 `config/sources.ts` 기준 36개 피드·쿼리. 업종 태그(`industry`)는 `ax` 항목에만 붙는다.

### 3.4 수집 규칙

- 소스 어댑터(GitHub, Hacker News, RSS)가 병렬로 수집해 `RawItem`으로 정규화한다. 소스 하나가 실패해도 나머지로 진행하고 `failedSources`에 기록한다.
- 전처리: URL 정규화 중복 제거(`utm_*`, `fbclid`, `gclid`, `ref` 제거) -> 기간 필터(기본 72시간, 소스별 재정의 가능, 레포는 생성일 무관) -> 이전 판 중복 제거(최근 10개 판의 id) -> 소스별 상한 -> 전체 상한 110건.
- 이전 판에 실린 레포라도 마지막 등장 대비 스타가 +50% 이상 늘었으면 `returning`으로 후보에 다시 넣는다. 레포 순위는 주간 스타 증가량(`starsGained`, 구 판은 `starsPerDay`)이고, AI 관련 여부는 이름·설명의 키워드(`AI_REPO_KEYWORDS`)로 가른다.
- 큐레이션 후 신선도 가드: 최종 섹션이 newsroom·ax·pulse인 항목은 72시간을 넘으면 버린다(큐레이터가 오래된 Reddit 글을 옮겨 놓아도 차단). playbook·repos는 제외. 버려진 id는 `front`에서 빼고 남은 항목으로 채운다.

## 4. 큐레이션 규칙

`lib/curate.ts`의 `SYSTEM_PROMPT`와 응답 검증이 기준이다.

**호출:** `claude -p` 1회. Claude Code 기본 시스템 프롬프트·도구·MCP를 싣지 않고 큐레이터 지침만 사용한다. 입력은 후보 목록(`id|source|section|title|snippet`, 스니펫 140자)과 직전 3개 판의 헤드라인. 기본 모델은 `sonnet`, 제한 시간 180초(`config/sources.ts`).

**선별:**
- 전체 18~22건, 섹션마다 3~4건(`front` 3건도 해당 섹션 몫). 후보가 적은 섹션은 있는 만큼만.
- 같은 사건은 1건으로 합치고 1차 출처에 가까운 id를 쓴다.
- 직전 판에서 다룬 사건은 실질적 진전이 있을 때만 포함한다.
- 실무 가치(구체 수치가 있는 도입 사례, 도구·업무 방식 변화, AX 시사점)를 우선하고 홍보성·내용 없는 글은 뺀다.
- 후보의 section은 힌트이며 내용에 맞게 다섯 섹션 중 하나로 바로잡을 수 있다.

**항목 작성:** 제목(ko/en, 신문 헤드라인, 고유명사 원문 유지), 요약(ko 3~4문장, en 2~3문장, 전문용어는 그 자리에서 풀이), 시사점 1문장, 지역, 업종(`ax`만). 후보에 없는 사실을 지어내지 않으며 URL은 출력하지 않는다.

**용어 풀이:** 판당 최대 8개. 비전문가가 모를 만한 기술 개념과 새 모델·서비스·프로젝트 이름이 대상이고, 누구나 아는 이름은 제외한다. 용어는 본문 표기와 일치해야 하고 지면에서는 점선 밑줄 툴팁, 모달에서는 "용어" 블록으로 보인다.

**검증과 폴백:**
- URL·출처·발행일·지표는 항상 수집기의 후보에서 가져오며 모델 출력은 쓰지 않는다. 원천에 없는 id, 중복 id, 잘못된 section, 제목(ko/en)이 빈 항목은 버린다.
- 잘못된 region은 제목에 한글이 있으면 KR, 아니면 GLOBAL로 대체한다. `front`가 3건 미만이면 남은 항목으로 채운다.
- 용어는 40자 이하, ko/en 설명이 모두 있는 항목만 받는다(중복 제외, 최대 8개).
- 호출 실패·시간 초과·JSON 파싱 실패 시 원문 제목·스니펫으로 `curated: false` 판을 만든다(섹션당 약 4건). 화면에 미요약 판 표시가 붙는다. 단, CI에서는 구독 토큰이 없으면 수집 자체를 건너뛰고 미큐레이션 판을 발행하지 않는다.

## 5. 데이터 모델

`types/index.ts` 기준.

- **Snapshot:** `date`(YYYY-MM-DD, KST), `issue`, `generatedAt`, `model`, `curated`, `failedSources[]`, `stats{collected, published}`, `front[]`(item id, 리드 먼저), `items[]`, `glossary?[]`.
- **Item:** `id`(URL 해시), `section`, `source`, `url`, `publishedAt`, `region`, `industry?`, `title`/`summary`/`takeaway`(각 `{ko,en}`), `metrics?`, `returning?`.
- **Metrics:** `stars`, `forks`(포크 수 도입 이전 판에는 없음), `starsGained`+`period`(주간 증가), `starsPerDay`(구 판), `starsDelta`(이전 등장 대비 증가량), `points`, `comments`, `language`.
- **GlossaryEntry:** `term`, `desc{ko,en}`.
- 스냅샷은 `data/snapshots/YYYY-MM-DD.json`에 날짜별로 저장되며 같은 날 재실행하면 덮어쓴다.

## 6. 화면과 상호작용

- **상단바(한 줄):** 왼쪽에 로고와 메뉴(지면 / 지난 호 / 기사), 가운데에 날짜 스테퍼, 인라인 검색, 테마 토글, KO/EN 전환.
- **날짜 스테퍼:** 가운데 정렬. 이전·다음 호 버튼과, 내용 폭에 맞춘 호 카드(`10월 13일 (화) · 제N호`)를 누르면 전체 발행일 목록(네이티브 popover, 링크 목록)이 열린다. 판 주소는 `/<lang>/<date>/`.
- **검색:** 상단바에 인라인. 입력과 함께 실시간으로 거르고, 오타(삽입·삭제·치환·인접 교환 1회)와 띄어쓰기·구두점 차이를 허용한다(`lib/search.ts`). 결과를 누르면 이동 없이 그 자리에서 기사 모달이 열리며, 실패 시 스토리 페이지 딥링크로 폴백한다. "모든 결과 보기"는 `/<lang>/stories/?q=`로 이동한다.
- **기사 목록:** `/<lang>/archive/`는 발행일별 목록과 헤드라인 검색, `/<lang>/stories/`는 전 호의 기사 목록(섹션 필터).
- **지구본:** 드래그로 회전·상하 기울임(기울임은 놓으면 기본 각도로 복귀, 극이 뒤집히지 않도록 제한). 마커·지역 패널 클릭으로 지역 필터. 화면 밖·백그라운드 탭에서는 애니메이션을 멈춘다.
- **다이얼로그:** 네이티브 `<dialog>`. 기사 모달(요약, 왜 중요한가, 지표, 용어, 원문 링크)과 섹션 목록 모달. Esc와 바깥 클릭으로 닫힌다.
- **전환:** 페이지 이동은 View Transition 크로스페이드(상단바는 전환 대상 밖). 모달 열림·닫힘에 애니메이션이 있다.
- **모션 줄이기:** `prefers-reduced-motion`이면 전환 애니메이션과 지구본 자동 회전·관성을 끈다.
- **UI 문구:** `lib/i18n.ts`의 ko/en 사전 한 곳에서 관리한다. 브랜드 문자열도 같은 파일(`BRAND`).
- **빈 상태/오류:** 스냅샷이 없으면 안내 화면, 일부 소스 실패와 미요약 판은 표기한다.

## 7. 엔드포인트

정적 export로 생성된다.

| 경로 | 내용 |
|---|---|
| `/` | 최신 호(한국어) |
| `/<lang>/`, `/<lang>/<date>/` | 최신 호, 특정 호 (`lang` = `ko`/`en`) |
| `/<lang>/archive/`, `/<lang>/stories/` | 지난 호 목록, 기사 목록 |
| `/latest.json` | 최신 판 전체 (데스크 펫용) |
| `/search-index.json` | 전 호의 압축 검색 인덱스 |
| `/editions/<date>/data.json` | 판 하나의 전체 데이터 |
| `/<lang>/stories/?open=<date>/<id>` | 해당 기사 모달이 열린 딥링크 |
| `/<lang>/<date>/?open=<id>` (`/`, `/<lang>/`도 최신 지면) | 해당 지면에서 기사 모달이 열린 딥링크(데스크 펫 말풍선) |

## 8. 수집·배포 파이프라인

`.github/workflows/dispatch.yml`, job 두 개.

- **build:** checkout -> Node 22 -> `npm ci` -> 수집 여부 판단 -> (수집 시) Claude CLI 설치 -> `npm run collect` -> 스냅샷 커밋(`edition: <date>`) -> `npm test` -> `actions/configure-pages` -> `npm run build` -> Pages 아티팩트 업로드.
- **deploy:** `actions/deploy-pages`로 배포.
- **트리거:** 예약, 수동, `main` push(`data/snapshots/**`, `desk-pet/**`, `docs/**`만 바뀐 push는 제외).
- **건너뛰기 규칙:**
  - `main` push는 수집하지 않고 재배포만 한다.
  - 예약 실행에서 그날(KST) 스냅샷이 이미 있으면 수집하지 않는다.
  - `CLAUDE_CODE_OAUTH_TOKEN`이 없으면 수집하지 않고 기존 스냅샷으로 배포한다.
- **시크릿 분리:** CLI 설치 단계는 시크릿 없이 별도로 실행하고(버전 고정), 토큰은 수집 단계에만 주입한다. 액션은 커밋 SHA로 고정한다.
- **URL:** `BASE_PATH`는 `configure-pages` 출력에서 받아 빌드에 전달한다. 포크도 자신의 Pages 주소로 빌드된다. 로컬 빌드의 `BASE_PATH`는 빈 값.
- 동시 실행은 `concurrency` 그룹으로 직렬화한다(진행 중 취소 안 함).

## 9. 데스크 펫

macOS 메뉴바 상주 캐릭터(Swift 단일 파일, 외부 패키지 없음). 30분마다 `<DISPATCH_URL>/latest.json`을 확인해 새 판이면 리드 헤드라인을 말풍선으로 알리고, 클릭하면 해당 기사 딥링크를 연다. 펫 클릭 시 이번 판의 무작위 기사를 보여 준다. 유휴 시 프레임 루프 없이 저전력으로 동작한다. 상세는 `desk-pet/README.md`.

## 10. 보안 원칙

- 토큰·키는 환경 변수와 Actions 시크릿으로만 다루며 커밋하지 않는다.
- 외부 링크는 절대 `http`/`https` URL만 렌더링한다(`lib/format.ts`).
- LLM 출력의 URL은 쓰지 않는다. URL·지표는 수집 데이터에서만 가져온다.
- CI 액션은 SHA로, CLI는 버전으로 고정한다. 설치 단계는 시크릿과 분리한다.
- 데스크 펫의 `DISPATCH_URL`은 `https://`, `http://localhost`, `http://127.0.0.1`, `file://`만 허용한다.

## 11. 비목표와 향후 과제

**비목표**
- 로그인·멀티유저, 서버 측 검색 API, DB(날짜별 JSON 스냅샷으로 충분).
- Claude가 웹을 직접 검색하는 에이전트 방식(토큰 비용과 링크 환각 위험).
- Instagram·Threads 직접 수집(공개 키워드 API 제약).
- 메신저 푸시, Markdown 내보내기.

**향후 과제 (필요가 확인되면)**
- 뉴스가 아닌 웹 자료(백서, 사례 리포트)용 선택형 원천.
- 데스크 펫의 다른 플랫폼 지원.
