# AI Trend

월·수·금 새벽, 흩어진 AI 트렌드를 **한 장의 지면**으로 묶어 주는 개인 브리핑 웹앱.

- 매번 알고리즘에 뜨기를 기다리지 않는다. GitHub, Hacker News, Reddit, GeekNews, 국내외 기사, 산업별 AX 사례를 코드가 직접 모은다.
- 구독 중인 Claude(`claude -p`)를 **회당 1번만** 호출해 선별·요약(한/영)·"왜 중요한가"를 붙인다. 별도 API 키는 쓰지 않는다.
- 그날 판은 JSON 스냅샷으로 남아서 지난 호를 날짜별로 다시 보고 검색할 수 있다.
- 바탕화면의 작은 마젠타 캐릭터(desk-pet)가 새 판 발행을 알려 준다.

기획 문서: [docs/PRD.md](docs/PRD.md) · 구현 계획: [docs/superpowers/plans/](docs/superpowers/plans/)

## 구조

```
GitHub Actions (월·수·금 05:17 KST)
 └ npm run collect
    1 fetch   공개 API·RSS 26개 원천 병렬 수집 (소스별 실패 격리)          lib/sources.ts, lib/rss.ts
    2 prep    중복·기간 필터, 이전 판 중복 제거, 레포 재등장, 섹션 균형 상한   lib/prep.ts
    3 curate  claude -p 1회 → 선별 30건, 한/영 요약, 왜 중요한가, 지역·업종  lib/curate.ts
    4 save    data/snapshots/YYYY-MM-DD.json                              lib/pipeline.ts, lib/snapshots.ts
 └ commit → next build (static export) → GitHub Pages
```

| 섹션 | 원천 |
|---|---|
| 뉴스룸 | TechCrunch AI, The Verge AI, AI타임스 |
| 현장의 AX | Google News RSS: 건설·금융·물류·유통·미디어 × AI (국문·영문) |
| 급상승 레포 | GitHub Search API (최근 30일 생성, ★/일 순) |
| 커뮤니티 펄스 | Hacker News, Reddit, GeekNews |
| 플레이북 | Simon Willison, Latent Space, UX Collective, NN/g |

토큰 절약 설계:
- 수집은 결정적 코드가 맡는다.
- LLM은 1회만 호출하고, Claude Code 기본 시스템 프롬프트·도구·MCP를 빼고(`--system-prompt`, `--tools ""`, `--strict-mcp-config`) 부른다.
- URL과 지표는 원천 데이터에서만 가져와 링크 환각을 막는다.

## 로컬 실행

```bash
npm install
npm run collect            # 오늘 판 생성 (claude CLI 로그인 필요)
npm run collect -- --no-llm  # LLM 없이 원문 제목으로 판 생성
npm run dev                # http://localhost:3010
npm test                   # vitest
```

## 배포 (GitHub Actions + Pages)

1. 구독 토큰 발급: `claude setup-token`
2. 저장소 시크릿 등록: `gh secret set CLAUDE_CODE_OAUTH_TOKEN`
3. Settings → Pages → Source: GitHub Actions
4. Actions 탭에서 `dispatch` 워크플로를 수동 실행해 첫 배포를 확인한다. 이후에는 월·수·금 05:17 KST에 자동 실행된다.

## Desk Pet

[desk-pet/README.md](desk-pet/README.md) — Swift 단일 파일. `cd desk-pet && ./build.sh && ./DeskPet`

## 기술 스택

Next.js 16 (App Router, static export) · React 19 · TypeScript · plain CSS · cobe(WebGL 지구본) · Vitest · Swift(AppKit + SwiftUI) · GitHub Actions/Pages · Claude Code CLI
