# AI Trend

Scattered AI trends, gathered into one newspaper page every Monday, Wednesday and Friday.

월·수·금 새벽, 흩어진 AI 트렌드를 한 장의 지면으로 묶어 발행하는 정적 웹앱. 라이브 데모: https://hyomin-l.github.io/ai-trend (루트 주소는 항상 최신 판, `/en/`은 영어판)

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
| 뉴스룸 | 국내외 AI·빅테크 주요 뉴스 | 언론: TechCrunch AI, The Verge AI, AI타임스. 공식 발표: OpenAI, Google AI, Google DeepMind, Anthropic(커뮤니티 미러 피드) |
| AI 플레이북 | AI 작업 방식, 에이전트 활용법, UI/UX 인사이트 | Simon Willison, Latent Space, One Useful Thing, UX Collective, NN/g, Hamel Husain, Interconnects, Anthropic Engineering, Hugging Face Blog, Hugging Face Daily Papers(추천 20 이상 상위 3편, 판 전체 최대 2편) |
| 현장의 AX | 업종별 AI 도입·전환 사례 (건설·금융·물류·유통·미디어) | Google News RSS (업종 키워드 x AI, 국문·영문) |
| 급상승 레포 | 최근 일주일간 스타가 가장 많이 늘어난 AI 레포(생성일 무관) + Hugging Face 트렌딩 모델(좋아요·다운로드, 최대 5건) | Hugging Face Hub API(trendingScore 순, 재패키징 모델 제외). GitHub Trending 주간(전체·python·typescript, HTML 스크랩) + 생성일 조회 GitHub REST. 실패 시 GitHub Search(토픽 llm, ai-agents, mcp, generative-ai, 최근 30일 생성)로 대체 |
| 커뮤니티 (Community Pulse) | 개발자 커뮤니티에서 화제인 이슈와 프로젝트 | Hacker News, Reddit(r/LocalLLaMA·ClaudeAI·MachineLearning), GeekNews |

섹션당 4건을 지면에 표시하고 나머지는 섹션 머리를 눌러 본다. 원천은 `config/sources.ts` 기준 37개 피드·쿼리다. 상세 사양은 [docs/PRD.md](docs/PRD.md).

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

`collect`는 외부 API를 실제로 호출한다. LLM 큐레이션에는 인증된 `claude` CLI(구독 로그인 또는 `ANTHROPIC_API_KEY`)가 필요하다(`--no-llm`이면 불필요). 로컬 빌드는 `BASE_PATH`가 비어 있는 루트 경로 기준이며, 하위 경로 배포를 확인하려면 `BASE_PATH=/<repo> npm run build`.

## 설정

| 이름 | 필수 | 용도 |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | CI 수집 시 둘 중 하나 | Claude 구독 토큰(`claude setup-token`). Actions 시크릿으로 등록 |
| `ANTHROPIC_API_KEY` | CI 수집 시 둘 중 하나 | Anthropic API 키(종량제). Actions 시크릿으로 등록. 둘 다 있으면 CLI가 API 키를 우선 사용. 둘 다 없으면 워크플로는 수집 없이 기존 데이터만 배포 |
| `GITHUB_TOKEN` | 선택 | GitHub Search API 호출 한도 상향. Actions에서는 자동 제공 |
| `SNAPSHOT_DIR` | 선택 | 스냅샷 저장 위치 재지정. 기본 `data/snapshots` |
| `BASE_PATH` | 선택 | 배포 하위 경로. 워크플로가 채우며 로컬 빌드는 빈 값 |

뉴스룸의 공식 발표 소스는 언론사와 같은 72시간 기간을 쓰고, 큐레이터는 section이 newsroom인 소스만 뉴스룸에 둘 수 있다. 편집 가능한 설정(원천, 섹션 순서, 표시 건수, 기간·상한, 모델)은 `config/sources.ts`에 있다.

## 수집·배포

```
GitHub Actions (월·수·금 05:17 KST, cron "17 20 * * 0,2,4")
 build job
  1 fetch   공개 API·RSS 병렬 수집 (소스별 실패 격리)
  2 prep    중복·기간 필터, 이전 판 중복 제거(레포·HF는 4개 판, 그 외 10개 판), 섹션 균형 상한
  3 curate  claude -p 1회 -> 선별, 한/영 요약, 왜 중요한가, 지역·업종, 용어
  4 save    data/snapshots/YYYY-MM-DD.json 저장·커밋
  npm test -> next build -> Pages 아티팩트 업로드
 deploy job   GitHub Pages 배포
```

워크플로는 `.github/workflows/dispatch.yml` 하나다.

- 트리거: 예약 실행, 수동 실행(`workflow_dispatch`), `main` push.
- `main` push는 재배포만 하며 수집하지 않는다(`COLLECT`가 push에서는 false). `desk-pet/`, `docs/`만 바뀐 push는 무시한다. 워크플로의 스냅샷 커밋은 `GITHUB_TOKEN`으로 push되어 새 실행을 일으키지 않으므로 재귀하지 않는다.
- 잘못 나간 판 수정: `data/snapshots/<날짜>.json`을 고치거나 삭제하고 push한다. `npm test`가 모든 스냅샷의 구조·링크(http/https만)를 검증하므로 잘못된 수정은 배포 전에 CI에서 실패한다. 스냅샷만 바뀐 push도 재배포된다.
- 예약 실행에서 그날(KST) 스냅샷이 이미 있으면 수집을 건너뛴다.
- `CLAUDE_CODE_OAUTH_TOKEN`과 `ANTHROPIC_API_KEY`가 모두 없으면 수집을 건너뛰고 기존 스냅샷으로 배포만 한다. 미큐레이션 판은 내지 않는다.
- 사이트 URL과 base path는 `actions/configure-pages` 출력에서 파생되므로 포크도 별도 설정 없이 자신의 주소로 빌드된다.

토큰 사용 최소화: 수집은 결정적 코드가 맡고, LLM은 1회만 호출하며 Claude Code 기본 시스템 프롬프트·도구·MCP를 싣지 않는다. URL과 지표는 원천 데이터에서만 가져와 링크 환각을 막는다.

## 포크해서 쓰기

1. 저장소를 포크한다. 포크에서 워크플로 사용 여부를 물으면 활성화한다.
2. Settings > Pages > Source를 **GitHub Actions**로 설정한다. 사이트 URL(`https://<user>.github.io/<repo>`)과 base path는 자동으로 파생된다.
3. Claude 구독 토큰(`CLAUDE_CODE_OAUTH_TOKEN`) 또는 Anthropic API 키(`ANTHROPIC_API_KEY`) 중 하나를 시크릿으로 등록한다.
   ```bash
   claude setup-token   # 구독 토큰 발급
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <user>/<repo>
   # 또는 Console에서 발급한 API 키
   gh secret set ANTHROPIC_API_KEY --repo <user>/<repo>
   ```
   토큰·키는 공유하거나 커밋하지 않는다. 둘 다 등록하면 API 키가 우선한다. API 키는 사용량만큼 과금된다(1판당 약 $0.1, 추정). 자동화에서 구독을 쓰는 것은 제공사 약관의 적용을 받으므로 약관을 확인한다.
4. Actions > `dispatch` > Run workflow를 실행한다. 첫 실행이 수집, `data/snapshots/<date>.json` 커밋, 빌드, 배포까지 수행한다. 이후 월·수·금 05:17 KST에 자동 실행된다.
5. `GITHUB_TOKEN`은 자동 제공되고 `BASE_PATH`는 워크플로가 Pages 설정에서 채운다. 두 시크릿이 모두 없으면 기존 데이터만 배포하며, `main` push는 배포만 한다.
6. 데스크 펫을 쓴다면 `DISPATCH_URL`을 자신의 사이트로 지정한다.

유의 사항:

- `data/snapshots`의 기존 스냅샷은 원본 저장소의 것이 그대로 따라온다. 예약 실행은 그날 스냅샷이 이미 있으면 건너뛰므로, 처음부터 시작하려면 포크에서 스냅샷을 정리하거나 수동 실행을 쓴다.
- 구독 계정 사용은 제공사의 이용 약관을 따른다. 각자 자신의 계정으로 사용한다.

## 커스터마이징

포크 후 바꿀 만한 것과 위치.

| 바꿀 것 | 위치 |
|---|---|
| 서비스 이름·소개 문구·바탕색 | `lib/i18n.ts` `BRAND` (페이지 제목, manifest, 로고, 큐레이터 프롬프트가 읽음) |
| 강조색·테마 색 | `app/globals.css` 토큰(`--magenta`, `--paper`, `--ink`). `BRAND.paper`는 `--paper`와 같게 유지. 강조색은 `app/icon.svg`, `components/Globe.tsx` `markerColor`, `desk-pet/DeskPet.swift`에도 있음 |
| 로고 모양 | `components/Logo.tsx` |
| 섹션 키·이름(ko/en)·순서·표시 개수, 섹션 설명(`brief`)·플래그(`fresh`, `outletsOnly`) | `config/sections.ts` `SECTIONS` (`FRONT`는 오늘의 3줄, `INDUSTRIES`는 현장의 AX 업종 태그) |
| 수집 원천 | `config/sources.ts` `SOURCES`, `AX_QUERIES` |
| 수집 튜닝(모델, 기간, 상한, 중복 제거) | `config/sources.ts` `CONFIG` |
| 선별 기준 | `config/prompt.ts` `CRITERIA` |
| 편집 방향·독자 설정 | `config/prompt.ts` `PERSONA` (`FORMAT`의 출력 형식은 `lib/curate.ts`가 파싱하므로 유지) |
| 발행 일정 | `.github/workflows/dispatch.yml` cron. 일정 문구는 `lib/i18n.ts`(`BRAND.description`, `ui.emptyNote`)와 `config/prompt.ts`에도 있음 |
| 화면 문구(ko/en) | `lib/i18n.ts` `ko`, `en` |
| 지역 이름·지구본 좌표 | `lib/i18n.ts` `REGION_LABEL`, `components/Globe.tsx` `COORDS` |
| 데스크 펫 이름·기본 서버·섹션명 | `desk-pet/DeskPet.swift` 맨 위 상수 묶음, 또는 실행 시 `DISPATCH_URL` |

섹션을 추가·삭제할 때는 `config/sections.ts`, `config/sources.ts`의 `section` 값, `config/sections.ts`의 `brief`(프롬프트의 섹션 목록이 여기서 생성됨), `desk-pet/DeskPet.swift`의 `sectionLabel`을 함께 고친다.

## 데스크 펫

새 판이 나오면 말풍선으로 알려 주는 macOS 메뉴바 앱(Swift 단일 파일). 말풍선을 누르면 해당 기사 모달이 열린 사이트가 뜬다. 빌드·실행·자동 실행 설정은 [desk-pet/README.md](desk-pet/README.md).

바로 써 보기(Mac 전용, macOS 13 이상. 실행 파일은 배포하지 않으므로 직접 빌드·설치한다):

```sh
xcode-select --install                      # Command Line Tools가 없을 때만
git clone https://github.com/hyomin-l/ai-trend.git
cd ai-trend/desk-pet && ./install.sh
```

빌드 후 로그인 시 자동 실행으로 등록하고 바로 띄운다. 기본 서버가 이 사이트라 별도 설정 없이 같은 판을 알려 준다. 업데이트는 `git pull && ./install.sh`, 제거는 `./uninstall.sh`. 자세한 내용은 desk-pet/README.md.

## 프로젝트 구조

```
app/          라우트: /, /[lang], /[lang]/[date], archive, stories, latest.json, search-index.json, editions/<date>/data.json
components/   화면 컴포넌트와 CSS Module (TopBar, DateNav, TopSearch, Globe, 각종 Dialog 등)
lib/          수집·가공·검색 로직 (sources, rss, prep, curate, claude, pipeline, snapshots, search, format, i18n)
config/       sections.ts: 섹션·업종 정의, 섹션 설명·플래그 / sources.ts: 원천, 기간·상한 / prompt.ts: 큐레이터 프롬프트
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

vitest 단위 테스트. 네트워크와 LLM 호출은 고정 응답으로 대체한다. RSS 파싱, 전처리 규칙, 큐레이션 응답 검증, 검색 매칭 등을 다룬다. `tests/snapshots.test.ts`는 커밋된 모든 스냅샷을 검증한다(`validateSnapshot`).

## 보안

- 토큰·키는 환경 변수와 Actions 시크릿으로만 다루고 저장소에 커밋하지 않는다(`.env*`는 `.gitignore`).
- 기사 원문 링크는 절대 `http`/`https` URL만 렌더링한다(`lib/format.ts`).
- CI의 액션은 커밋 SHA로 고정하고 CLI 패키지는 버전을 고정한다.
- CLI 설치 단계는 시크릿이 없는 별도 단계로 분리한다. 시크릿은 수집 단계에만 주입된다.

## 참고한 프로젝트

- [agents-radar](https://github.com/duanyytop/agents-radar): GitHub Actions와 Pages로 정기 발행하는 파이프라인 구성, 포크해서 직접 돌리는 방식을 참고했다.
- [AIHOT](https://github.com/KKKKhazix/AIHOT): 소스와 선별 기준을 분리하는 구조, 같은 사건을 묶는 아이디어를 참고했다.

## 기술 스택

Next.js 16 (App Router, static export) · React 19 · TypeScript · CSS Modules · cobe(WebGL 지구본) · Vitest · Swift(AppKit + SwiftUI) · GitHub Actions/Pages · Claude Code CLI
