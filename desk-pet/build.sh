#!/bin/sh
# desk-pet 빌드: Swift 단일 파일 → ./DeskPet
cd "$(dirname "$0")" && swiftc -O -parse-as-library DeskPet.swift -o DeskPet
