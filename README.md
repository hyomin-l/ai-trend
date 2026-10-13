# AI Trend

Scattered AI trends, gathered into one newspaper page every Monday, Wednesday and Friday.

월·수·금 새벽, 흩어진 AI 트렌드를 한 장의 지면으로 묶어 발행하는 정적 웹앱. 라이브 데모: https://hyomin-l.github.io/ai-trend

## 개요

- 공개 API와 RSS에서 AI 관련 글·레포·토론을 코드가 수집한다.
- Claude CLI(`claude -p`)를 발행 1회당 1번만 호출해 선별, 한/영 요약, "왜 중요한가", 지역·업종 태그, 용어 풀이를 만든다. 별도 API 키는 쓰지 않는다.
- 그날 판은 JSON 스냅샷으로 저장·커밋되고, Next.js 정적 export로 GitHub Pages에 배포된다. 지난 호는 날짜별로 다시 볼 수 있다.
- 새 판 알림용 macOS 데스크 펫이 별도로 제공된다.

## 기능

- 하루 한 장 지면: 오늘의 3줄, 지역 지구본, 5개 섹션
- 한국어/영어 두 벌(`/ko/`, `/en/`), 라이트/다크 테마
- 날짜 스테퍼와 지난 호 목록, 전 호 기사 목록
- 상단바 인라인 검색: 오타·띄어쓰기 차이를 허용하고, 결과를 누르면 그 자리에서 기사 모달이 열린다
- 기사 모달: 요약, 왜 중요한가, 용어 풀이, 원문 링크
- 정적 데이터 엔드포인트와 기사 딥링크

## 지면 구성

| 섹션 | 다루는 것 | 원천 |
|---|---|---|
| 뉴스룸 | 국내외 AI·빅테크 주요 뉴스 | TechCrunch AI, The Verge AI, AI타임스 |
| AI 플레이북 | AI 작업 방식, 에이전트 활용법, UI/UX 인사이트 | Simon Willison, Latent Space, One Useful Thing, UX Collective, NN/g |
| 커뮤니티 (Community Pulse) | 개발자 커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News, Reddit(r/LocalLLaMA·ClaudeAI·MachineLearning), GeekNews |
| 급상승 레포 | 최근 30일 안에 생성돼 스타 증가 속도가 빠른 AI 레포 | GitHub Search API (토픽 llm, ai-agents, mcp, generative-ai) |
| 현장의 AX | 업종별 AI 도입·전환 사례 (건설·금융·물류·유통·미디어) | Google News RSS (업종 키워드 x AI, 국문·영문) |

섹션당 4건을 지면에 표시하고 나머지는 섹션 머리를 눌러 본다. 원천은 `config/sources.ts` 기준 27개 피드·쿼리다. 상세 사양은 [docs/PRD.md](docs/PRD.md).

## 빠른 시작

Node 20.19 이상.

```bash
npm install
npm run dev                  # http://localhost:3010
npm test                     # vitest
npm run build                # 정적 export -> out/
npm run collect              # 오늘 판 생성 -> data/snapshots/YYYY-MM-DD.json
npm run collect -- --no-llm  # LLM 없이 원문 제목으로 판 생성
npm run collect -- --date 2026-10-14
```

`collect`는 외부 API를 실제로 호출한다. LLM 큐레이션에는 로그인된 `claude` CLI가 필요하다(`--no-llm`이면 불필요). 로컬 빌드는 `BASE_PATH`가 비어 있는 루트 경로 기준이며, 하위 경로 배포를 확인하려면 `BASE_PATH=/<repo> npm run build`.

## 설정

| 이름 | 필수 | 용도 |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | CI 수집 시 필수 | Claude 구독 토큰. 저장소 Actions 시크릿으로 등록. 없으면 워크플로는 수집 없이 기존 데이터만 배포 |
| `GITHUB_TOKEN` | 선택 | GitHub Search API 호출 한도 상향. Actions에서는 자동 제공 |
| `SNAPSHOT_DIR` | 선택 | 스냅샷 저장 위치 재지정. 기본 `data/snapshots` |
| `SITE_URL` | 선택 | 사이트 절대 URL. 워크플로가 Pages 설정에서 채운다 |
| `BASE_PATH` | 선택 | 배포 하위 경로. 워크플로가 채우며 로컬 빌드는 빈 값 |

편집 가능한 설정(원천, 섹션 순서, 표시 건수, 기간·상한, 모델)은 `config/sources.ts`에 있다.

## 수집·배포

```
GitHub Actions (월·수·금 05:17 KST, cron "17 20 * * 0,2,4")
 build job
  1 fetch   공개 API·RSS 병렬 수집 (소스별 실패 격리)
  2 prep    중복·기간 필터, 이전 판 중복 제거, 섹션 균형 상한
  3 curate  claude -p 1회 -> 선별, 한/영 요약, 왜 중요한가, 지역·업종, 용어
  4 save    data/snapshots/YYYY-MM-DD.json 저장·커밋
  npm test -> next build -> Pages 아티팩트 업로드
 deploy job   GitHub Pages 배포
```

워크플로는 `.github/workflows/dispatch.yml` 하나다.

- 트리거: 예약 실행, 수동 실행(`workflow_dispatch`), `main` push.
- `main` push는 코드 변경 시 재배포만 하며 수집하지 않는다. `data/snapshots/`, `desk-pet/`, `docs/`만 바뀐 push는 무시한다.
- 예약 실행에서 그날(KST) 스냅샷이 이미 있으면 수집을 건너뛴다.
- `CLAUDE_CODE_OAUTH_TOKEN`이 없으면 수집을 건너뛰고 기존 스냅샷으로 배포만 한다. 미큐레이션 판은 내지 않는다.
- 사이트 URL과 base path는 `actions/configure-pages` 출력에서 파생되므로 포크도 별도 설정 없이 자신의 주소로 빌드된다.

토큰 사용 최소화: 수집은 결정적 코드가 맡고, LLM은 1회만 호출하며 Claude Code 기본 시스템 프롬프트·도구·MCP를 싣지 않는다. URL과 지표는 원천 데이터에서만 가져와 링크 환각을 막는다.

## 포크해서 쓰기

1. 저장소를 포크한다. 포크에서 워크플로 사용 여부를 물으면 활성화한다.
2. Settings > Pages > Source를 **GitHub Actions**로 설정한다. 사이트 URL(`https://<user>.github.io/<repo>`)과 base path는 자동으로 파생된다.
3. 각자 자신의 Claude 계정으로 `claude setup-token`을 실행해 토큰을 발급하고 시크릿으로 등록한다.
   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <user>/<repo>
   ```
   토큰은 공유하거나 커밋하지 않는다. 한 사람당 토큰 하나를 쓴다.
4. Actions > `dispatch` > Run workflow를 실행한다. 첫 실행이 수집, `data/snapshots/<date>.json` 커밋, 빌드, 배포까지 수행한다. 이후 월·수·금 05:17 KST에 자동 실행된다.
5. `GITHUB_TOKEN`은 자동 제공되고 `SITE_URL`/`BASE_PATH`는 워크플로가 설정한다. `CLAUDE_CODE_OAUTH_TOKEN`이 없으면 기존 데이터만 배포하며, `main` push는 배포만 한다.
6. 데스크 펫을 쓴다면 `DISPATCH_URL`을 자신의 사이트로 지정한다.

유의 사항:

- `data/snapshots`의 기존 스냅샷은 원본 저장소의 것이 그대로 따라온다. 예약 실행은 그날 스냅샷이 이미 있으면 건너뛰므로, 처음부터 시작하려면 포크에서 스냅샷을 정리하거나 수동 실행을 쓴다.
- 구독 계정 사용은 제공사의 이용 약관을 따른다. 각자 자신의 계정으로 사용한다.

## 데스크 펫

새 판이 나오면 말풍선으로 알려 주는 macOS 메뉴바 앱(Swift 단일 파일). 말풍선을 누르면 해당 기사 모달이 열린 사이트가 뜬다. 빌드·실행·자동 실행 설정은 [desk-pet/README.md](desk-pet/README.md).

## 프로젝트 구조

```
app/          라우트: /, /[lang], /[lang]/[date], archive, stories, latest.json, search-index.json, editions/<date>/data.json
components/   화면 컴포넌트와 CSS Module (TopBar, DateNav, TopSearch, Globe, 각종 Dialog 등)
lib/          수집·가공·검색 로직 (sources, rss, prep, curate, pipeline, snapshots, search, format, i18n)
config/       sources.ts: 원천, 섹션 순서, 표시 건수, 기간·상한
types/        Snapshot·Item 등 공용 타입
data/         snapshots/ 날짜별 판 JSON
scripts/      collect.ts 수집 진입점
tests/        vitest 단위 테스트 (fixtures 포함)
desk-pet/     macOS 데스크 펫
docs/         제품 사양(PRD)
```

## 테스트

```bash
npm test
```

vitest 단위 테스트. 네트워크와 LLM 호출은 고정 응답으로 대체한다. RSS 파싱, 전처리 규칙, 큐레이션 응답 검증, 검색 매칭 등을 다룬다.

## 보안

- 토큰·키는 환경 변수와 Actions 시크릿으로만 다루고 저장소에 커밋하지 않는다(`.env*`는 `.gitignore`).
- 기사 원문 링크는 절대 `http`/`https` URL만 렌더링한다(`lib/format.ts`).
- CI의 액션은 커밋 SHA로 고정하고 CLI 패키지는 버전을 고정한다.
- CLI 설치 단계는 시크릿이 없는 별도 단계로 분리한다. 시크릿은 수집 단계에만 주입된다.

## 기술 스택

Next.js 16 (App Router, static export) · React 19 · TypeScript · CSS Modules · cobe(WebGL 지구본) · Vitest · Swift(AppKit + SwiftUI) · GitHub Actions/Pages · Claude Code CLI
