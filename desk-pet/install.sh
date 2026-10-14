#!/bin/sh
# desk-pet 설치: 빌드 → 저장소 밖에 바이너리 복사 → LaunchAgent 등록. 다시 실행하면 갱신·재시작한다.
# 선택: DISPATCH_URL=https://... ./install.sh  (값 검증은 앱이 한다)
set -eu
cd "$(dirname "$0")"
LABEL=io.github.hyomin-l.deskpet # DeskPet.swift의 UserDefaults 도메인과 같아야 한다
DIR="$HOME/Library/Application Support/AITrendPet"
BIN="$DIR/DeskPet"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

./build.sh
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true # 실행 중 바이너리를 덮어쓰기 전에 내린다
cp DeskPet "$BIN.new" && mv -f "$BIN.new" "$BIN"

ENVXML=""
if [ -n "${DISPATCH_URL:-}" ]; then
  esc=$(printf '%s' "$DISPATCH_URL" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
  ENVXML="  <key>EnvironmentVariables</key>
  <dict><key>DISPATCH_URL</key><string>$esc</string></dict>"
fi
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$BIN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
$ENVXML
</dict>
</plist>
PL
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "설치 완료"
echo "  바이너리: $BIN"
echo "  LaunchAgent: $PLIST"
echo "  제거: $(pwd)/uninstall.sh   (설정까지 지우려면 --purge)"
