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

### 3.1 이번 호 핵심

전 섹션에서 고른 그날의 핵심 3건(`front`, 첫 번째가 리드). 헤드라인, 요약, "왜 중요한가"를 보여 준다.

### 3.2 지역 + 지구본

기사의 `region`(KR/US/EU/CN/JP/GLOBAL; 한국·미국·유럽·중국·일본·글로벌)을 지구본(`cobe`)에 마커로 표시한다. 지역 패널에서 지역을 고르면 해당 기사만 모아 본다.

### 3.3 섹션 (지면 순서)

섹션당 4건을 표시하고(`DISPLAY`), 나머지는 섹션 머리를 눌러 목록 모달로 본다.

| 순서 | key | KO | EN | 정의 | 원천 |
|---|---|---|---|---|---|
| 1 | `newsroom` | 뉴스룸 | Newsroom | 국내외 AI·빅테크 주요 뉴스 | 언론: TechCrunch AI, The Verge AI, AI타임스(국내는 AI타임스만). 공식 발표: OpenAI, Google AI, Google DeepMind, Anthropic(community 미러 피드). Anthropic 미러는 호스트 허용 목록(anthropic.com)과 다른 링크를 버린다. 큐레이터가 newsroom으로 옮겨도 소스 설정이 newsroom이 아니면 원래 섹션으로 되돌린다. 기간은 언론과 같은 72시간 |
| 2 | `playbook` | AI 플레이북 | AI Playbook | AI 작업 방식, 에이전트 활용법, UI/UX 인사이트 | Simon Willison, Latent Space, One Useful Thing, UX Collective, NN/g, Hamel Husain, Interconnects, Anthropic Engineering(미러), Hugging Face Blog, Hugging Face Daily Papers(`hfpapers`: `api/daily_papers?limit=50`, 추천 수 순, 최소 추천 20(`minUpvotes`)·소스 상한 3, 링크 `huggingface.co/papers/<arXiv id>`, 날짜는 Daily Papers 게재일. 큐레이션 기준으로 판 전체 최대 2편) |
| 3 | `ax` | 현장의 AX | AX in the Field | 업종별 AI 도입·전환 사례 | Google News RSS: 일반 기업 AX 쿼리 + 업종(건설·금융·물류·유통·미디어) 키워드, 국문·영문 |
| 4 | `repos` | 급상승 레포 | Rising Repos | 최근 일주일간 스타가 가장 많이 늘어난 AI 레포(생성일 무관, 지면에는 생성일 병기) + Hugging Face 트렌딩 모델(최대 5건, 4번째 자리마다 끼워 넣음) | Hugging Face Hub API(`sort=trendingScore`, GGUF·양자화·uncensored 등 재패키징 모델 제외). GitHub Trending 주간(전체·python·typescript, 비공식 HTML; "stars this week"를 `starsGained`로 쓰고 이름·설명을 AI 키워드로 거르며, 비정상 수치는 상한 검사로 버림) + 생성일 조회 GitHub REST. 트렌딩 레포가 3건 미만이면 GitHub Search(토픽 llm, ai-agents, mcp, generative-ai, 최근 30일 생성)로 대체. HF 모델은 `HF_SKIP`으로 재패키징 모델을 거른다. OSS Insight 트렌드 API는 2026-03부터 데이터 품질 문제로 비어 있어 제외 |
| 5 | `pulse` | 커뮤니티 | Community Pulse | 개발자 커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News(검색어 "AI"), Reddit(r/LocalLLaMA+ClaudeAI+MachineLearning 주간 top), GeekNews |

원천은 `config/sources.ts` 기준 피드·쿼리. 업종 태그(`industry`)는 `ax` 항목에만 붙는다.

**지표 표기:** 아이콘 + 숫자로 보인다. 레포는 스타, 포크, 주간 증가(`+N/주`), HF 모델은 좋아요, 다운로드. 1,000 이상은 `1.3k` 형식으로 줄인다.

**시간 표기(`lib/format.ts` `fmtWhen`, `WhenTime`):** 항상 KST 절대 시각으로 보인다("10월 14일 14:05" / "Oct 14, 14:05", 24시간제). 판의 `generatedAt`과 연도가 다를 때만 연도를 붙인다("2025년 10월 14일 14:05"). 현재 시각을 쓰지 않아 서버와 브라우저가 같은 결과를 낸다. `<time>` 요소의 툴팁에 정확한 KST 시각(분 단위)을 담는다. 레포 행은 생성일만 "10월 4일 생성"으로 보인다.

### 3.4 수집 규칙

- 소스 어댑터(GitHub, Hacker News, RSS)가 병렬로 수집해 `RawItem`으로 정규화한다. 소스 하나가 실패해도 나머지로 진행하고 `failedSources`에 기록한다.
- 전처리: URL 정규화 중복 제거(`utm_*`, `fbclid`, `gclid`, `ref` 제거) -> 기간 필터(기본 72시간, 소스별 재정의 가능(AI 플레이북 소스 대부분 168시간), 레포는 생성일 무관) -> 이전 판 중복 제거(전 섹션 최근 10개 판의 id. 레포·HF 모델은 최근 4개 판만 제외하고, 5~10개 판 전에 실린 것은 다시 오르면 `returning`("재등장")으로 재게재. 직전 게재 대비 별 증가 `starsDelta`를 병기하고, 총 별이 1.5배 이상 늘었으면 4개 판 이내여도 재게재) (이전 판 항목의 `related`(다른 출처) URL도 같은 id 규칙으로 함께 제외하므로, 발행된 사건의 다른 출처판이 다음 판에 새 후보로 돌아오지 않는다) -> 소스별 상한 -> 전체 상한 110건.
- 레포 순위는 주간 스타 증가량(`starsGained`)이고, AI 관련 여부는 이름·설명의 키워드(`AI_REPO_KEYWORDS`)로 가른다. 레포는 생성일로 거르지 않는다.
- 큐레이션 후 신선도 가드: 최종 섹션이 `fresh` 플래그(`config/sections.ts`; 현재 newsroom·ax·pulse)인 항목은 큐레이션 후 72시간을 넘으면 버린다(큐레이터가 오래된 Reddit 글을 옮겨 놓아도 차단). playbook은 수집 단계에서 소스별 최대 168시간까지 허용하고, repos는 생성일로 거르지 않는다. 버려진 id는 `front`에서 빼고 남은 항목으로 채운다.

## 4. 큐레이션 규칙

`lib/curate.ts`의 `SYSTEM_PROMPT`와 응답 검증이 기준이다.

**호출:** `claude -p` 1회. Claude Code 기본 시스템 프롬프트·도구·MCP를 싣지 않고 큐레이터 지침만 사용한다. 입력은 후보 목록(`id|source|section|title|snippet`, 스니펫 140자)과 직전 3개 판의 헤드라인. 기본 모델은 `sonnet`, 제한 시간 180초(`config/sources.ts`).

**선별:**
- 전체 18~22건, 섹션마다 3~4건(`front` 3건도 해당 섹션 몫). 후보가 적은 섹션은 있는 만큼만.
- 같은 사건은 1건으로 합치고 1차 출처에 가까운 id를 쓴다.
- 직전 판에서 다룬 사건은 실질적 진전이 있을 때만 포함한다.
- 실무 가치(구체 수치가 있는 도입 사례, 도구·업무 방식 변화, AX 시사점)를 우선하고 홍보성·내용 없는 글은 뺀다.
- 후보의 section은 힌트이며 내용에 맞게 섹션 중 하나로 바로잡을 수 있다. 단 `outletsOnly` 섹션(현재 newsroom)은 언론사·공식 발표 후보만 쓸 수 있다(응답 검증에서도 강제한다).
- 프롬프트는 `config/prompt.ts`에서 PERSONA(독자·역할), `CRITERIA`(선별 기준 목록, 자유 편집), FORMAT(작성 규칙·출력 JSON, `lib/curate.ts`가 파싱하므로 수정 금지)로 나뉜다. 섹션 목록은 `config/sections.ts`의 `brief`에서 생성한다. 같은 사건을 여러 출처가 다루면 한 건으로 합치되 newsroom 설정 출처가 있으면 그것을 대표로 쓰고, 다중 출처 사건은 front 후보로 우대한다.

**항목 작성:** 제목(ko/en, 신문 헤드라인, 고유명사 원문 유지), `also`(같은 사건을 다룬 다른 후보 id), 요약(ko 3~4문장, en 2~3문장, 전문용어는 그 자리에서 풀이), 시사점 1문장, 지역, 업종(`ax`만). 한국어 요약·시사점·용어 풀이는 모두 합니다체(~합니다/~입니다)로 쓰고 해라체는 쓰지 않는다. 제목은 헤드라인 문체를 유지한다. 후보에 없는 사실을 지어내지 않으며 URL은 출력하지 않는다.

**용어 풀이:** 판당 최대 8개. 비전문가가 모를 만한 기술 개념과 새 모델·서비스·프로젝트 이름이 대상이고, 누구나 아는 이름은 제외한다. 용어는 본문 표기와 일치해야 하고 지면에서는 점선 밑줄 툴팁, 모달에서는 "용어" 블록으로 보인다.

**검증과 폴백:**
- URL·출처·발행일·지표는 항상 수집기의 후보에서 가져오며 모델 출력은 쓰지 않는다. 원천에 없는 id, 중복 id, 잘못된 section(newsroom 부적격 소스는 원래 섹션으로 환원), 제목(ko/en)이 빈 항목은 버린다.
- `also`는 후보에 있는 id만 받고 자기 자신·선별된 다른 항목·중복은 제외하며 최대 4개다. 출처명과 URL은 후보에서 채워 `related`로 저장한다.
- 잘못된 region은 제목에 한글이 있으면 KR, 아니면 GLOBAL로 대체한다. `front`가 3건 미만이면 남은 항목으로 채운다.
- 용어는 40자 이하, ko/en 설명이 모두 있는 항목만 받는다(중복 제외, 최대 8개).
- 호출 실패·시간 초과·JSON 파싱 실패 시 원문 제목·스니펫으로 `curated: false` 판을 만든다(섹션당 약 4건). 화면에 미요약 판 표시가 붙는다. 단, CI에서는 Claude 자격(구독 토큰 또는 API 키)이 없으면 수집 자체를 건너뛰고 미큐레이션 판을 발행하지 않는다.

## 5. 데이터 모델

`types/index.ts` 기준.

- **Snapshot:** `date`(YYYY-MM-DD, KST), `issue`, `generatedAt`, `model`, `curated`, `failedSources[]`, `stats{collected, published}`, `front[]`(item id, 리드 먼저), `items[]`, `glossary?[]`.
- **Item:** `id`(URL 해시), `section`, `source`, `url`, `publishedAt`, `region`, `industry?`, `title`/`summary`/`takeaway`(각 `{ko,en}`), `metrics?`, `returning?`, `related?`(`{source,url}[]`: 같은 사건의 다른 출처).
- **Metrics:** `stars`, `forks`(포크 수 도입 이전 판에는 없음), `starsGained`+`period`(주간 증가), `starsPerDay`(구 판 호환), `starsDelta`(이전 등장 대비 증가량), `likes`·`downloads`(HF 모델), `points`, `comments`, `language`.
- **GlossaryEntry:** `term`, `desc{ko,en}`.
- 스냅샷은 `data/snapshots/YYYY-MM-DD.json`에 날짜별로 저장되며 같은 날 재실행하면 덮어쓴다.
- **검증(`validateSnapshot`):** 날짜·호수, 항목 구조(`related`가 있으면 배열·출처명·http(s) URL, id 중복, section·region, 필수 필드, ko/en 문구), `front` id 존재, http(s) 링크, 지표 범위(0 이상 10억 미만)를 확인한다. 수집 스크립트가 저장 전에, `npm test`가 저장된 모든 스냅샷에 대해 실행한다(CI는 배포 전에 테스트).

## 6. 화면과 상호작용

- **상단바(한 줄):** 왼쪽에 로고와 메뉴(지면 / 지난 호 / 기사), 가운데에 날짜 스테퍼, 인라인 검색, 테마 토글, KO/EN 전환.
- **날짜 스테퍼:** 가운데 정렬. 이전·다음 호 버튼과, 내용 폭에 맞춘 호 카드(`10월 13일 (화) · 제N호`)를 누르면 전체 발행일 목록(네이티브 popover, 링크 목록)이 열린다. 판 주소는 `/<lang>/<date>/`.
- **검색:** 상단바에 인라인. 입력과 함께 실시간으로 거르고, 오타(삽입·삭제·치환·인접 교환 1회)와 띄어쓰기·구두점 차이를 허용한다(`lib/search.ts`). 결과를 누르면 이동 없이 그 자리에서 기사 모달이 열리며, 실패 시 스토리 페이지 딥링크로 폴백한다. "모든 결과 보기"는 `/<lang>/stories/?q=`로 이동한다.
- **기사 목록:** `/<lang>/archive/`는 발행일별 목록과 헤드라인 검색, `/<lang>/stories/`는 전 호의 기사 목록(섹션 필터).
- **지구본:** 드래그로 회전·상하 기울임(기울임은 놓으면 기본 각도로 복귀, 극이 뒤집히지 않도록 제한). 마커 클릭으로 해당 지역 선택, 지역 패널 클릭도 같은 필터, 지구본의 빈 곳을 클릭하면 필터 해제(드래그는 클릭으로 치지 않음). 첫 프레임이 그려진 뒤 한 번만 페이드인한다. 화면 밖·백그라운드 탭에서는 애니메이션을 멈춘다.
- **다이얼로그:** 네이티브 `<dialog>`. 기사 모달(요약, 왜 중요한가, 다른 출처("다른 출처 N", 출처명 링크, 없으면 생략), 지표, 용어, 원문 링크)과 섹션 목록 모달. Esc와 바깥 클릭으로 닫힌다. 열리면 포커스는 다이얼로그 자체에 두어 ×에 포커스 링이 뜨지 않는다(Tab을 누르면 나타남). 기사 모달에 "무슨 일" 같은 요약 앞 라벨은 없다.
- **한 화면 맞춤:** 데스크톱의 섹션 열은 높이에 맞게 항목 수를 줄이고, 첫 맞춤이 끝나기 전에는 열을 숨겼다가 맞춘 뒤 한 번에 보인다(나중에 "+N"이 바뀌며 흔들리지 않음). 웹폰트 로딩이 끝난 뒤 맞춘다.
- **딥링크:** `/<lang>/<date>/?open=<id>`(`/`, `/<lang>/`도 최신 지면)로 들어오면 해당 기사 모달이 열리고, 주소에서 `open`은 제거된다.
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
| `/<lang>/<date>/?open=<id>` (`/`, `/<lang>/`도 가능) | 해당 지면에서 기사 모달이 열린 딥링크(데스크 펫 말풍선) |

## 8. 수집·배포 파이프라인

`.github/workflows/dispatch.yml`, job 두 개.

- **build:** (권한 `contents: write`, `pages: read`) checkout -> Node 22 -> `npm ci` -> 수집 여부 판단 -> (수집 시) Claude CLI 설치 -> `npm run collect`(저장 전 스냅샷 검증) -> 스냅샷 커밋(`edition: <date>`) -> `npm test`(저장된 스냅샷 검증 포함) -> `actions/configure-pages` -> `npm run build` -> Pages 아티팩트 업로드.
- **deploy:** (권한 `pages: write`, `id-token: write`만) `actions/deploy-pages`로 배포. 워크플로 기본 권한은 없음(`permissions: {}`).
- **트리거:** 예약, 수동, `main` push(`desk-pet/**`, `docs/**`만 바뀐 push는 제외). 스냅샷만 바뀐 push는 재배포한다.
- **건너뛰기 규칙:**
  - `main` push는 수집하지 않고 재배포만 한다.
  - 예약 실행에서 그날(KST) 스냅샷이 이미 있으면 수집하지 않는다.
  - `CLAUDE_CODE_OAUTH_TOKEN`과 `ANTHROPIC_API_KEY`가 모두 없으면 수집하지 않고 기존 스냅샷으로 배포한다. 둘 중 하나면 수집한다. 둘 다 있으면 CLI 인증 우선순위상 API 키(종량제)가 쓰인다. 코드 변경 없이 `claude -p` 1회 호출 구조를 유지한다.
- **시크릿 분리:** CLI 설치 단계는 시크릿 없이 별도로 실행하고(`@anthropic-ai/claude-code` 버전 고정), 토큰·API 키는 수집 단계에만 주입하고, 비어 있는 시크릿은 해당 단계에서 unset한다. 액션은 커밋 SHA로 고정한다.
- **URL:** `BASE_PATH`는 `configure-pages` 출력에서 받아 빌드에 전달한다. 포크도 자신의 Pages 주소로 빌드된다. 로컬 빌드의 `BASE_PATH`는 빈 값.
- 동시 실행은 `concurrency` 그룹으로 직렬화한다(진행 중 취소 안 함).

## 9. 데스크 펫

macOS 메뉴바 상주 캐릭터(Swift 단일 파일, 외부 패키지 없음). 상세는 `desk-pet/README.md`.

- **알림:** 30분마다 `<DISPATCH_URL>/latest.json`을 확인해 새 판이면 리드 헤드라인을 말풍선으로 알린다.
- **무작위 기사:** 펫을 클릭하면 이번 판 기사를 셔플한 순서로 한 바퀴 돌 때까지 반복 없이 보여 준다. 말풍선 라벨에 섹션명과 날짜가 들어간다.
- **말풍선 클릭:** 지금 보이는 그 기사의 모달이 열린 지면(`/<lang>/<date>/?open=<id>`)을 기본 브라우저로 연다. id가 없으면(구버전 `latest.json`) 사이트 루트를 연다.
- **메뉴(펫·말풍선 우클릭, 메뉴바 아이콘):** 지금 확인, 숨기기/보이기, 크기(작게·보통·크게), 언어(한국어/English), 종료. 종료하면 다음 로그인까지 다시 뜨지 않는다.
- **언어 설정:** 말풍선 헤드라인, 섹션명, 날짜, 메뉴 문구, 열리는 링크의 `/<lang>/` 경로에 적용되며 기본은 한국어다.
- **설치:** macOS 13 이상 전용. `desk-pet/install.sh` 한 번으로 빌드하고, 바이너리를 저장소 밖(`~/Library/Application Support/AITrendPet/`)에 복사한 뒤 로그인 시 자동 실행(LaunchAgent)을 등록한다. 저장소를 옮겨도 동작하며, 업데이트는 `git pull && ./install.sh`, 제거는 `uninstall.sh`(`--purge`면 설정까지 삭제).
- **저전력:** 평소에는 프레임 루프 없이 정지 자세와 타이머 깜빡임뿐이다(유휴 CPU 약 0.2% 수준). 말풍선·호버·상호작용 직후에만 애니메이션이 켜진다.

## 10. 보안 원칙

- 토큰·키는 환경 변수와 Actions 시크릿으로만 다루며 커밋하지 않는다.
- 외부 링크는 절대 `http`/`https` URL만 렌더링한다(`lib/format.ts`).
- LLM 출력의 URL은 쓰지 않는다. URL·지표는 수집 데이터에서만 가져온다.
- CI 액션은 커밋 SHA로, Claude CLI는 버전으로 고정한다. 설치 단계는 시크릿과 분리하고, 잡 권한은 최소로 둔다(build: contents 쓰기·pages 읽기, deploy: pages 쓰기·id-token).
- `main` 브랜치는 ruleset으로 보호한다(force push·삭제 금지).
- 미러 피드는 소스별 호스트 허용 목록(`hosts`)에 없는 링크를 버린다.
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
