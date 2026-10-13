# desk-pet — 애트라(Atra)

새 판이 나오면 말풍선으로 알려 주는 macOS 데스크톱 펫 **애트라**(AI Trend의 AT에서 따온 이름, 마젠타 모찌 블롭). Swift + AppKit + SwiftUI 단일 파일, 외부 패키지 없음. Dock 아이콘 없이 메뉴바에만 상주한다.

## 빌드

```sh
./build.sh        # swiftc -O -parse-as-library DeskPet.swift -o DeskPet
```

Xcode Command Line Tools(Swift 6)와 macOS 13 이상이 필요하다. 기본 SDK가 컴파일러보다 새로워 빌드가 실패하면(SDK/컴파일러 불일치) `build.sh`가 설치된 SDK(`/Library/Developer/CommandLineTools/SDKs/MacOSX*.sdk`)를 새것부터 차례로 시도해 처음 성공한 것으로 빌드한다. 수동으로는 `swiftc -sdk <SDK 경로> -O -parse-as-library DeskPet.swift -o DeskPet`.

## 실행

```sh
./DeskPet                                    # 기본 서버: https://hyomin-l.github.io/ai-trend
DISPATCH_URL=http://localhost:3000 ./DeskPet # 다른 서버
DISPATCH_URL=file:///path/to/dir ./DeskPet   # 로컬 테스트: dir/latest.json을 읽는다
./DeskPet --demo                             # 네트워크 없이 샘플 말풍선을 바로 띄운다
```

- 시작할 때와 30분마다 `<DISPATCH_URL>/latest.json`을 가져온다. 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
- `date`가 마지막으로 본 판(`lastSeenDate`)과 다르면 리드 헤드라인(`front[0]`의 `title.ko`)을 말풍선으로 띄운다. 새 판을 감지하면 stderr에 한 줄 남긴다.
- 말풍선은 사이트 톤(종이색 `#f7f7f5` 바탕, 잉크색 글자, 헤어라인 테두리)의 라이트 카드다. 위에 `AI Trend · 10월 14일` 라벨, 아래에 헤드라인(최대 3줄, 넘치면 말줄임).
- 말풍선을 클릭하면 시스템 기본 브라우저로 **그 기사의 모달이 열린 스토리 페이지**(`<DISPATCH_URL>/ko/stories/?open=<date>/<id>`)를 열고 본 것으로 처리한다. `latest.json`에 id가 없으면(구버전) 사이트 루트를 연다. 딥링크는 배포된 사이트에 해당 기능이 올라간 뒤에만 동작한다(GitHub Pages는 배포 후). `×`는 열지 않고 본 것으로만 처리한다.
- 클릭 모션: 펫은 누르고 있는 내내(끄는 동안 포함) 납작한 자세를 유지하다가 뗄 때 출렁이며 복원한다. 말풍선은 누르는 동안 살짝 작아진다.
- 말풍선은 몸통과 꼬리가 하나의 외곽선(단일 경로)이고, 사이트 종이 배경과 같은 은은한 그레인이 깔려 있다.
- 우클릭(펫·말풍선): 지금 확인 / 펫 숨기기 / 크기 / 종료. 숨기면 메뉴바 아이콘의 "펫 보이기"로 되살린다. LaunchAgent `KeepAlive`가 `false`라서 "종료"하면 다음 로그인까지 다시 뜨지 않는다.
- 펫을 클릭하면 이번 판(`items[]`)에서 **무작위 기사**를 말풍선으로 보여 준다. 셔플 순서로 전부 한 바퀴 돌아야 반복하고, 직전 기사와 같은 기사는 연달아 나오지 않는다. 말풍선이 떠 있을 때 클릭하면 닫지 않고 다음 무작위 기사로 교체한다. 새 판 알림 말풍선만 리드(`front[0]`)로 시작한다.
- 말풍선 라벨은 `AI Trend · 커뮤니티 · 10월 14일`처럼 섹션 이름(사이트 `SECTION_LABEL`의 한국어명)을 포함한다. 말풍선을 클릭하면 **지금 보이는 그 기사**의 모달이 열린 사이트가 열린다.
- `DISPATCH_URL`은 `https://`, `http://localhost`, `http://127.0.0.1`, `file://`만 허용한다. 그 밖의 값은 stderr에 한 줄 남기고 기본 서버로 대체한다. 딥링크의 `date`·`id`는 퍼센트 인코딩하고, 기본 URL과 같은 스킴(http/https/file)일 때만 연다.
- 누른 자세는 마우스를 떼기 전까지(끄는 동안 포함) 유지한다. 최신 macOS에서 `performDrag`가 곧바로 반환되므로 해제는 `mouseUp`에서만 한다.
- 펫이나 말풍선을 끌어 옮길 수 있다. 위치는 기억한다.
- 메뉴바 아이콘: 우클릭 메뉴와 같은 목록(지금 확인 / 펫 숨기기·보이기 / 크기 작게 44pt · 보통 56pt · 크게 72pt / 종료).
- 시스템 설정의 "동작 줄이기"를 켜면 떠다님·morph·곁눈질·클릭 모션을 멈추고 깜빡임만 남긴다.

## 에너지

- **평소(idle)**: 정지 자세 + 7초 안팎(허용 오차 4초)의 타이머 깜빡임뿐. 프레임 루프가 없다.
- **lively**(떠다님·morph·곁눈질, 20fps): 새 판 말풍선이 떠 있는 동안, 마우스를 올렸을 때, 누르거나 끄는 동안, 그리고 상호작용 뒤 4초간만 켜진다. 끝나면 진폭이 서서히 줄어 idle 자세로 돌아간다.
- 창이 가려지거나 화면이 꺼지거나 잠기거나 시스템이 잠들면 애니메이션을 멈추고 깨어나면 재개한다(`Pet.active`). 폴링은 30분 주기, 타이머 허용 오차 2분.
- 질감(종이 그레인)은 시작할 때 한 번 만든 160×160 타일을 재사용한다.
- 측정(`top -l 12 -s 5 -pid <pid> -stats pid,cpu,power,idlew,mem`, 보이는 상태의 유휴): 상시 30fps 루프 CPU 약 8.3%·power 약 9.5 → idle 모드 CPU 약 0.15%·power 약 0.3·wakeups 약 2/s.

## 로그인 시 자동 실행 (LaunchAgent)

`~/Library/LaunchAgents/io.github.hyomin-l.deskpet.plist`를 만든다. `ProgramArguments`의 경로는 `DeskPet` 바이너리의 절대 경로로 바꾼다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.github.hyomin-l.deskpet</string>
  <key>ProgramArguments</key>
  <array><string>/절대/경로/ai-trend/desk-pet/DeskPet</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict>
</plist>
```

`DISPATCH_URL`을 바꾸려면 `<dict>` 안에 `EnvironmentVariables` 딕셔너리를 추가한다.

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.github.hyomin-l.deskpet.plist   # 지금 등록·실행
launchctl bootout   gui/$(id -u) ~/Library/LaunchAgents/io.github.hyomin-l.deskpet.plist   # 해제
```

바이너리를 다시 빌드했으면 `launchctl kickstart -k gui/$(id -u)/io.github.hyomin-l.deskpet`으로 재시작한다.

`KeepAlive`가 `false`라서 메뉴바의 "종료"로 끄면 다음 로그인까지 다시 뜨지 않는다.

## 저장되는 값과 초기화

설정은 `UserDefaults` 도메인 `io.github.hyomin-l.deskpet`에 저장된다: `origin`(위치), `petWidth`(크기), `lastSeenDate`(마지막으로 본 판).

```sh
defaults delete io.github.hyomin-l.deskpet lastSeenDate   # 같은 판의 말풍선을 다시 보고 싶을 때
defaults delete io.github.hyomin-l.deskpet                # 전부 초기화
```

## 이름 변경

화면에 보이는 서비스 이름은 `DeskPet.swift` 맨 위의 `brand` 상수 한 줄뿐이다.
