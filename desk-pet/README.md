# desk-pet — 애트라(Atra)

새 판이 나오면 말풍선으로 알려 주는 macOS 데스크톱 펫 **애트라**(마젠타 블롭 캐릭터). Swift + AppKit + SwiftUI 단일 파일, 외부 패키지 없음. Dock 아이콘 없이 메뉴바에만 상주한다.

## 빌드

```sh
./build.sh        # VERSION → Version.swift 생성 후 swiftc -O -parse-as-library DeskPet.swift Version.swift -o DeskPet
```

Xcode Command Line Tools(Swift 6)와 macOS 13 이상이 필요하다. 기본 SDK가 컴파일러보다 새로워 빌드가 실패하면(SDK/컴파일러 불일치) `build.sh`가 설치된 SDK(`/Library/Developer/CommandLineTools/SDKs/MacOSX*.sdk`)를 새것부터 차례로 시도해 처음 성공한 것으로 빌드한다. 수동으로는 `Version.swift`(`let appVersion = "x.y.z"`)를 만든 뒤 `swiftc -sdk <SDK 경로> -O -parse-as-library DeskPet.swift Version.swift -o DeskPet`.

## 실행

```sh
./DeskPet                                    # 기본 서버: https://hyomin-l.github.io/ai-trend (포크는 자신의 사이트 주소로 지정)
DISPATCH_URL=http://localhost:3000 ./DeskPet # 다른 서버
DISPATCH_URL=file:///path/to/dir ./DeskPet   # 로컬 테스트: dir/latest.json을 읽는다
./DeskPet --demo                             # 네트워크 없이 샘플 말풍선을 바로 띄운다
```

- 시작할 때와 30분마다 `<DISPATCH_URL>/latest.json`을 가져온다. 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
- `date`가 마지막으로 본 판(`lastSeenDate`)과 다르면 리드 헤드라인(`front[0]`의 `title.ko`)을 말풍선으로 띄운다. 새 판을 감지하면 stderr에 한 줄 남긴다.
- 말풍선은 사이트 톤(종이색 `#f7f7f5` 바탕, 잉크색 글자, 헤어라인 테두리)의 라이트 카드다. 위에 `AI Trend · 10월 14일` 라벨, 아래에 헤드라인(최대 3줄, 넘치면 말줄임).
- 말풍선을 클릭하면 시스템 기본 브라우저로 **그 기사의 모달이 열린 지면**(`<DISPATCH_URL>/ko/<date>/?open=<id>`)를 열고 본 것으로 처리한다. `latest.json`에 id가 없으면(구버전) 사이트 루트를 연다. 딥링크는 배포된 사이트에 해당 기능이 올라간 뒤에만 동작한다(GitHub Pages는 배포 후). `×`는 열지 않고 본 것으로만 처리한다.
- 클릭 모션: 펫은 누르고 있는 내내(끄는 동안 포함) 납작한 자세를 유지하다가 뗄 때 출렁이며 복원한다. 말풍선은 누르는 동안 살짝 작아진다.
- 말풍선은 몸통과 꼬리가 하나의 외곽선(단일 경로)이고, 사이트 종이 배경과 같은 은은한 그레인이 깔려 있다.
- 우클릭(펫·말풍선): 지금 확인 / 펫 숨기기 / 크기 / 언어(한국어·English) / 종료. 메뉴 문구도 선택한 언어로 바뀐다. 숨기면 메뉴바 아이콘의 "펫 보이기"로 되살린다. LaunchAgent `KeepAlive`가 `false`라서 "종료"하면 다음 로그인까지 다시 뜨지 않는다.
- 펫을 클릭하면 이번 판(`items[]`)에서 **무작위 기사**를 말풍선으로 보여 준다. 셔플 순서로 전부 한 바퀴 돌아야 반복하고, 직전 기사와 같은 기사는 연달아 나오지 않는다. 말풍선이 떠 있을 때 클릭하면 닫지 않고 다음 무작위 기사로 교체한다. 새 판 알림 말풍선만 리드(`front[0]`)로 시작한다.
- 말풍선 라벨은 `AI Trend · 커뮤니티 · 10월 14일`처럼 섹션 이름(사이트 `config/sections.ts`의 이름. `latest.json`의 `sections`가 있으면 그것을, 없거나 키가 빠지면 앱에 내장된 `sectionLabel`을 쓴다)을 포함한다. 말풍선을 클릭하면 **지금 보이는 그 기사**의 모달이 열린 사이트가 열린다.
- `DISPATCH_URL`은 `https://`, `http://localhost`, `http://127.0.0.1`, `file://`만 허용한다. 그 밖의 값은 stderr에 한 줄 남기고 기본 서버로 대체한다. 딥링크의 `date`·`id`는 퍼센트 인코딩하고, 기본 URL과 같은 스킴(http/https/file)일 때만 연다.
- 누른 자세는 마우스를 떼기 전까지(끄는 동안 포함) 유지한다. 최신 macOS에서 `performDrag`가 곧바로 반환되므로 해제는 `mouseUp`에서만 한다.
- 펫이나 말풍선을 끌어 옮길 수 있다. 위치는 기억한다.
- 메뉴바 아이콘: 애트라 얼굴 실루엣(블롭 채움 + 눈 구멍)의 템플릿 이미지라 라이트/다크 메뉴바에 맞춰 색이 바뀐다. 우클릭 메뉴와 같은 목록(지금 확인 / 펫 숨기기·보이기 / 크기 작게 44pt · 보통 56pt · 크게 72pt / 언어 한국어·English / 종료).
- 시스템 설정의 "동작 줄이기"를 켜면 떠다님·morph·곁눈질·클릭 모션을 멈추고 깜빡임만 남긴다.

## 단일 실행

사용자당 한 개만 뜬다. 시작할 때 `~/Library/Application Support/AITrendPet/deskpet.lock`에 `flock`(비차단)을 걸고, 이미 잡혀 있으면 한 줄 로그를 남기고 즉시 종료한다. `--demo`는 `demo.lock`을 따로 써서 실제 펫을 건드리지 않고 시험할 수 있으며, 데모끼리는 중복되지 않는다. `install.sh`는 기존 프로세스가 완전히 내려간 뒤 새로 올린다.

## 에너지

- **평소(idle)**: 정지 자세 + 7초 안팎(허용 오차 4초)의 타이머 깜빡임뿐. 프레임 루프가 없다.
- **lively**(떠다님·morph·곁눈질, 20fps): 마우스를 올린 동안, 누르거나 끄는 동안, 말풍선이 뜨거나 닫힐 때, 그리고 그 뒤 4초간만 켜진다. 끝나면 진폭이 서서히 줄어 idle 자세로 돌아간다.
- **말풍선은 lively를 붙잡지 않는다.** 새 말풍선은 4초 동안만 눈길을 끌고(떠다님) 그 뒤로는 idle 자세 + 타이머 깜빡임으로 떠 있는다. 말풍선이 몇 시간 떠 있어도 idle과 같은 비용이다.
- 창이 가려지거나 화면이 꺼지거나 잠기거나 시스템이 잠들면 애니메이션을 멈추고 깨어나면 재개한다(`Pet.active`). 폴링은 30분 주기, 타이머 허용 오차 2분.
- 질감(종이 그레인)은 시작할 때 한 번 만든 160×160 타일을 재사용한다.
- 측정(`top -l 12 -s 5 -pid <pid> -stats pid,cpu,power,idlew,mem`, 보이는 상태의 유휴): 상시 30fps 루프 CPU 약 8.3%·power 약 9.5 → idle 모드 CPU 약 0.15%·power 약 0.3·wakeups 약 2/s.
- 측정(말풍선이 뜬 채, `--demo`, 첫 표본 제외 12회): 말풍선 동안 lively 유지(수정 전) CPU 약 5.4~5.5%·power 약 6.6~6.9·wakeups 약 26~30/s(실행 중이던 본 인스턴스는 CPU 약 7.5%) → 4초 뒤 idle(수정 후) CPU 약 0.1~0.2%·power 약 0.2·wakeups 1/s 미만. 마우스를 올리면 다시 lively(CPU 약 6%)가 되고 벗어나 약 5초 뒤 가라앉는다.

## 설치 (로그인 시 자동 실행)

```sh
cd desk-pet && ./install.sh                          # 빌드 → 설치 → 로그인 시 자동 실행 등록·즉시 실행
DISPATCH_URL=https://example.com/ai-trend ./install.sh # 다른 서버로 설치 (값 검증은 앱이 한다)
git pull && ./install.sh                             # 업데이트: 다시 빌드하고 바이너리를 교체한 뒤 재시작
./uninstall.sh                                       # 제거 (설정은 유지)
./uninstall.sh --purge                               # 제거 + 저장된 설정(UserDefaults)까지 삭제
```

`install.sh`가 만드는 것(저장소 위치와 무관하므로 저장소를 옮기거나 지워도 계속 동작한다).

- `~/Library/Application Support/AITrendPet/DeskPet`: 빌드한 바이너리 복사본.
- `~/Library/LaunchAgents/io.github.hyomin-l.deskpet.plist`: 위 바이너리를 가리키는 LaunchAgent. `RunAtLoad` true, `KeepAlive` false. `DISPATCH_URL`을 주고 설치하면 `EnvironmentVariables`에 들어간다.

Label은 `UserDefaults` 도메인과 같아서 재설치해도 위치·크기·언어 설정이 유지된다. `KeepAlive`가 `false`라서 메뉴바의 "종료"로 끄면 다음 로그인까지 다시 뜨지 않는다.

## Updating

- **내용(기사·섹션 이름)은 자동**이다. 펫이 30분마다 `latest.json`을 가져오므로 사이트 쪽 변경은 앱을 건드리지 않아도 반영된다.
- **앱 자체는 수동**이다. 터미널에서 아래를 실행한다. 다시 빌드해 바이너리를 교체하고 재시작하며, 위치·크기·언어 설정은 유지된다.

  ```sh
  cd ai-trend/desk-pet && git pull && ./install.sh
  ```

- 사이트의 `latest.json`이 알리는 `pet.version`이 실행 중인 앱 버전보다 높으면, 우클릭 메뉴와 메뉴바 메뉴 맨 위에 **"새 버전 있음 (x.y.z) — 업데이트 방법"**이 나타난다. 누르면 이 절을 브라우저로 열 뿐 명령은 실행하지 않는다.

### 버전 올리기 (관리자)

앱 코드(`DeskPet.swift` 등)를 바꿔 사용자가 다시 설치해야 할 때만 `desk-pet/VERSION`의 한 줄(`x.y.z`)을 올리고 push한다. 이 파일이 유일한 원천이다: `build.sh`가 `Version.swift`(git 무시)를 만들어 앱에 넣고, 사이트 빌드는 같은 파일을 `latest.json`의 `pet.version`으로 내보낸다. 사이트가 재배포되면 구버전 펫에 안내가 뜬다. VERSION만 올린 push도 사이트를 재배포한다. 섹션 이름만 바꾸는 변경은 올릴 필요가 없다.

## 저장되는 값과 초기화

설정은 `UserDefaults` 도메인 `io.github.hyomin-l.deskpet`에 저장된다: `origin`(위치), `petWidth`(크기), `lang`(`ko`·`en`, 기본 `ko` — 말풍선 제목·섹션명·날짜와 클릭 시 열리는 `/ko|en/` 경로), `lastSeenDate`(마지막으로 본 판).

```sh
defaults delete io.github.hyomin-l.deskpet lastSeenDate   # 같은 판의 말풍선을 다시 보고 싶을 때
defaults delete io.github.hyomin-l.deskpet                # 전부 초기화
```

## 이름 변경

화면에 보이는 서비스 이름은 `DeskPet.swift` 맨 위의 `brand` 상수 한 줄뿐이다.
