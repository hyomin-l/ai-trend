# AI Trend

월·수·금 새벽, 흩어진 AI 트렌드를 **한 장의 지면**으로 묶어 주는 개인 브리핑 웹앱.

사이트: https://hyomin-l.github.io/ai-trend

- 매번 알고리즘에 뜨기를 기다리지 않는다. GitHub, Hacker News, Reddit, GeekNews, 국내외 기사, 산업별 AX 사례를 코드가 직접 모은다.
- 구독 중인 Claude(`claude -p`)를 **회당 1번만** 호출해 선별·요약(한/영)·"왜 중요한가"를 붙인다. 별도 API 키는 쓰지 않는다.
- 그날 판은 JSON 스냅샷으로 남아서 지난 호를 날짜별로 다시 보고 검색할 수 있다.
- 바탕화면의 작은 마젠타 캐릭터(desk-pet 애트라)가 새 판 발행을 알려 준다.

기획 문서: [docs/PRD.md](docs/PRD.md) · 인수인계: [docs/HANDOFF.md](docs/HANDOFF.md) · 구현 계획: [docs/superpowers/plans/](docs/superpowers/plans/)

## 지면 구성

- **오늘의 3줄**: 전 섹션에서 고른 그날의 핵심 3건.
- **지역(지구본)**: 기사에 붙은 지역(한국·미국·유럽·중국·일본·글로벌)을 지구본으로 보여 준다. 드래그로 회전·상하 기울임, 지역 패널에서 해당 기사를 모아 본다.
- **5개 섹션** (지면 순서, 섹션당 4건 표시):

| 섹션 | 다루는 것 | 원천 |
|---|---|---|
| 뉴스룸 | 국내외 AI·빅테크 주요 뉴스 | TechCrunch AI, The Verge AI, AI타임스 |
| AI 플레이북 | AI로 일하는 방식, 에이전트 활용법, UI/UX 인사이트 등 실무에 옮겨 쓸 수 있는 글 | Simon Willison, Latent Space, One Useful Thing, UX Collective, NN/g |
| 커뮤니티 (Community Pulse) | 개발자 커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News, Reddit(LocalLLaMA·ClaudeAI·MachineLearning), GeekNews |
| 급상승 레포 | 최근 30일 안에 생성돼 ★ 증가 속도가 빠른 AI 레포 | GitHub Search API (토픽 llm·ai-agents·mcp·generative-ai) |
| 현장의 AX | 업종별 AI 도입·전환 사례 (건설·금융·물류·유통·미디어) | Google News RSS: 업종 키워드 × AI (국문·영문) |

원천은 `config/sources.ts` 기준 27개 피드·쿼리다. 용어 풀이(glossary)는 카드·모달에서 점선 밑줄 툴팁으로 나온다.

## 기능

- **지난 호·기사 목록**: 메뉴에서 지면 / 지난 호 / 기사로 이동한다. `/[lang]/archive/`는 발행일별 목록, `/[lang]/stories/`는 전 호의 기사 목록(섹션 필터).
- **날짜 스테퍼**: 상단바 가운데에서 이전·다음 호로 이동하고 발행일을 고른다. 판 주소는 `/[lang]/[date]/`.
- **검색**: 상단바에 인라인으로 붙어 있고 입력과 함께 실시간으로 거른다. 오타와 띄어쓰기 차이를 허용하며(`lib/search.ts`), 결과를 누르면 목록으로 이동하지 않고 그 자리에서 기사 모달이 열린다.
- **기사 모달**: 요약, 왜 중요한가, 용어, 원문 링크. 열림·닫힘과 페이지 전환에 애니메이션이 들어간다.
- **테마**: 라이트/다크 토글.
- **KO/EN**: 모든 판이 한국어(`/ko/`)와 영어(`/en/`) 두 벌이다. `/`는 최신 호의 한국어판이다.
- **딥링크**: `/ko/stories/?open=<date>/<id>`는 해당 기사 모달이 열린 채로 뜬다. 데스크 펫 말풍선이 이 주소를 연다.
- **데이터 엔드포인트**(정적 파일로 export): `/latest.json`(최신 판 전체, 데스크 펫용), `/search-index.json`(전 호의 압축 인덱스, 검색용), `/editions/<date>/data.json`(판 하나의 전체 데이터).

## 로컬 실행

Node 20.19 이상.

```bash
npm install
npm run dev                  # http://localhost:3010
npm test                     # vitest
npm run build                # 정적 export -> out/ (Pages 하위 경로 확인은 BASE_PATH=/ai-trend)
npm run collect              # 오늘 판 생성 -> data/snapshots/YYYY-MM-DD.json
npm run collect -- --no-llm  # LLM 없이 원문 제목으로 판 생성
npm run collect -- --date 2026-10-14   # 날짜 지정 (YYYY-MM-DD)
```

`collect`는 외부 API를 실제로 호출한다. 필요한 것:

- `claude` CLI 설치·로그인 (`--no-llm`이면 불필요). CI에서는 `CLAUDE_CODE_OAUTH_TOKEN`.
- `GITHUB_TOKEN` (선택). 있으면 GitHub Search API의 호출 한도가 늘어난다.
- `SNAPSHOT_DIR` (선택). 스냅샷 저장 위치 재지정, 기본은 `data/snapshots`.

## 수집·배포

```
GitHub Actions (월·수·금 05:17 KST, cron "17 20 * * 0,2,4")
 └ npm run collect
    1 fetch   공개 API·RSS 병렬 수집 (소스별 실패 격리)                      lib/sources.ts, lib/rss.ts
    2 prep    중복·기간 필터, 이전 판 중복 제거, 레포 재등장, 섹션 균형 상한    lib/prep.ts
    3 curate  claude -p 1회 -> 선별, 한/영 요약, 왜 중요한가, 지역·업종, 용어   lib/curate.ts
    4 save    data/snapshots/YYYY-MM-DD.json                               lib/pipeline.ts, lib/snapshots.ts
 └ 스냅샷 커밋(edition: YYYY-MM-DD) -> npm test -> next build -> GitHub Pages
```

워크플로는 `.github/workflows/dispatch.yml` 하나다.

- 트리거: 예약 실행, 수동 실행(`workflow_dispatch`), `main` push. push는 `data/snapshots/`, `desk-pet/`, `docs/`만 바뀐 경우를 제외하고 코드 변경 시 재배포만 한다(수집 안 함).
- 예약 실행에서 그날(KST) 스냅샷이 이미 있으면 수집을 건너뛴다. 지연·중복 실행이 토큰을 쓰지 않게 하려는 장치다.
- `CLAUDE_CODE_OAUTH_TOKEN` 시크릿이 없으면 수집을 건너뛰고 기존 스냅샷으로 배포만 한다. 미큐레이션 판은 내지 않는다.
- 시크릿: `CLAUDE_CODE_OAUTH_TOKEN`(저장소 시크릿, 직접 등록), `GITHUB_TOKEN`(Actions 기본 제공).
- 최초 설정: `claude setup-token`으로 구독 토큰 발급 -> `gh secret set CLAUDE_CODE_OAUTH_TOKEN` -> Settings -> Pages -> Source: GitHub Actions -> Actions 탭에서 `dispatch` 수동 실행.
- 스냅샷은 `data/snapshots/`에 날짜별 JSON으로 쌓이고 저장소에 커밋된다. 지난 호·검색·`latest.json`은 전부 이 파일에서 만들어진다.

토큰 절약 설계:

- 수집은 결정적 코드가 맡는다.
- LLM은 1회만 호출하고, Claude Code 기본 시스템 프롬프트·도구·MCP를 빼고(`--system-prompt`, `--tools ""`, `--strict-mcp-config`) 부른다.
- URL과 지표는 원천 데이터에서만 가져와 링크 환각을 막는다.

## 데스크 펫 애트라

새 판이 나오면 말풍선으로 알려 주는 macOS 펫. 말풍선을 누르면 해당 기사 모달이 열린 사이트가 뜬다. 전체 사용법은 [desk-pet/README.md](desk-pet/README.md).

```sh
cd desk-pet
./build.sh                                   # 빌드 (SDK 불일치 시 자동 대체)
./DeskPet                                    # 실행 (--demo: 샘플 말풍선)
launchctl kickstart -k gui/$(id -u)/io.github.hyomin-l.deskpet   # LaunchAgent 재시작
```

## 구조

```
app/          라우트: /, /[lang], /[lang]/[date], archive, stories, latest.json, search-index.json, editions/<date>/data.json, favicon.ico
components/   화면 컴포넌트와 CSS Module (TopBar, DateNav, TopSearch, Globe, Regions, 각종 Dialog 등)
lib/          수집·가공·검색 로직 (sources, rss, prep, curate, pipeline, snapshots, search, format, i18n)
config/       sources.ts: 원천 목록, 섹션 순서, 표시 건수, 기간·상한 설정
types/        Snapshot·Item 등 공용 타입
data/         snapshots/ 날짜별 판 JSON
scripts/      collect.ts 수집 진입점
tests/        vitest 단위 테스트 (fixtures/ 포함)
desk-pet/     macOS 데스크 펫 (Swift 단일 파일)
docs/         PRD, HANDOFF, 구현 계획
```

## 보안 메모

- 토큰·키는 환경 변수와 Actions 시크릿으로만 다룬다. 저장소에 커밋하지 않는다(`.env*`는 `.gitignore`).
- 이전에 발급한 Claude 토큰은 대화 기록에 노출됐다. 폐기하고 `claude setup-token`으로 새로 발급한 토큰만 쓴다.
- 기사 원문 링크는 절대 `http`/`https` URL만 렌더링한다(`lib/format.ts`).

## 기술 스택

Next.js 16 (App Router, static export) · React 19 · TypeScript · plain CSS · cobe(WebGL 지구본) · Vitest · Swift(AppKit + SwiftUI) · GitHub Actions/Pages · Claude Code CLI
