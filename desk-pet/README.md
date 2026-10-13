# desk-pet

새 판이 나오면 말풍선으로 알려 주는 macOS 데스크톱 펫(모찌 블롭). Swift + AppKit + SwiftUI 단일 파일, 외부 패키지 없음. Dock 아이콘 없이 메뉴바에만 상주한다.

## 빌드

```sh
./build.sh        # swiftc -O -parse-as-library DeskPet.swift -o DeskPet
```

Xcode Command Line Tools(Swift 6)와 macOS 13 이상이 필요하다.

## 실행

```sh
./DeskPet                                    # 기본 서버: https://hyomin-l.github.io/ai-trend
DISPATCH_URL=http://localhost:3000 ./DeskPet # 다른 서버
DISPATCH_URL=file:///path/to/dir ./DeskPet   # 로컬 테스트: dir/latest.json을 읽는다
./DeskPet --demo                             # 네트워크 없이 샘플 말풍선을 바로 띄운다
```

- 시작할 때와 30분마다 `<DISPATCH_URL>/latest.json`을 가져온다. 실패는 조용히 무시하고 다음 주기에 다시 시도한다.
- `date`가 마지막으로 본 판(`lastSeenDate`)과 다르면 리드 헤드라인(`front[0]`의 `title.ko`)을 말풍선으로 띄운다. 새 판을 감지하면 stderr에 한 줄 남긴다.
- 말풍선을 클릭하면 사이트를 열고 본 것으로 처리한다. `×`는 열지 않고 본 것으로만 처리한다.
- 말풍선이 없을 때 펫을 클릭하면 마지막 판의 헤드라인을 다시 보여 준다.
- 펫이나 말풍선을 끌어 옮길 수 있다. 위치는 기억한다.
- 메뉴바 아이콘: 지금 확인 / 펫 숨기기·보이기 / 크기(작게 44pt · 보통 56pt · 크게 72pt) / 종료.
- 시스템 설정의 "동작 줄이기"를 켜면 떠다님·morph·곁눈질을 멈추고 깜빡임만 남긴다.

## 로그인 시 자동 실행 (LaunchAgent)

`~/Library/LaunchAgents/io.github.hyomin-l.deskpet.plist`를 만든다. `ProgramArguments`의 경로는 `DeskPet` 바이너리의 절대 경로로 바꾼다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.github.hyomin-l.deskpet</string>
  <key>ProgramArguments</key>
  <array><string>/절대/경로/ai-dispatch/desk-pet/DeskPet</string></array>
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

`KeepAlive`가 `false`라서 메뉴바의 "종료"로 끄면 다음 로그인까지 다시 뜨지 않는다.

## 저장되는 값과 초기화

설정은 `UserDefaults` 도메인 `io.github.hyomin-l.deskpet`에 저장된다: `origin`(위치), `petWidth`(크기), `lastSeenDate`(마지막으로 본 판).

```sh
defaults delete io.github.hyomin-l.deskpet lastSeenDate   # 같은 판의 말풍선을 다시 보고 싶을 때
defaults delete io.github.hyomin-l.deskpet                # 전부 초기화
```

## 이름 변경

화면에 보이는 서비스 이름은 `DeskPet.swift` 맨 위의 `brand` 상수 한 줄뿐이다.
