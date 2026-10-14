#!/bin/sh
# desk-pet 제거. 설정(UserDefaults)은 --purge를 줄 때만 지운다.
set -eu
LABEL=io.github.hyomin-l.deskpet
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
rm -rf "$HOME/Library/Application Support/AITrendPet"
[ "${1:-}" = "--purge" ] && { defaults delete "$LABEL" 2>/dev/null || true; echo "설정 삭제"; }
echo "제거 완료"
