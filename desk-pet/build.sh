#!/bin/sh
# desk-pet 빌드: Swift 단일 파일 + VERSION에서 만든 Version.swift → ./DeskPet
# 앱 버전의 단일 원천은 desk-pet/VERSION (사이트의 latest.json도 같은 파일을 읽는다).
# 기본 SDK가 컴파일러보다 새로우면(SDK/컴파일러 불일치) 설치된 SDK를 새것부터 차례로 시도한다.
cd "$(dirname "$0")" || exit 1
printf '// build.sh가 VERSION에서 생성 — 직접 고치지 않는다 (git 무시)\nlet appVersion = "%s"\n' "$(tr -d ' \n' < VERSION)" > Version.swift
build() { swiftc ${1:+-sdk "$1"} -O -parse-as-library DeskPet.swift Version.swift -o DeskPet; }
build 2>/dev/null && exit 0
for sdk in $(ls -dr /Library/Developer/CommandLineTools/SDKs/MacOSX[0-9]*.sdk "$(xcrun --show-sdk-path 2>/dev/null | xargs dirname)"/MacOSX[0-9]*.sdk 2>/dev/null); do
  build "$sdk" 2>/dev/null && { echo "build ok (SDK: $sdk)"; exit 0; }
done
build # 모두 실패하면 기본 설정의 오류를 그대로 보여 준다
