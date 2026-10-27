// DeskPet — 뉴스 사이트 데스크톱 펫 (macOS, AppKit + SwiftUI, 외부 패키지 없음)
// 빌드: ./build.sh (VERSION → Version.swift 생성 후 컴파일)   실행: ./DeskPet [--demo]   서버 지정: DISPATCH_URL=...
import AppKit
import SwiftUI

// MARK: - 포크 시 고칠 상수 (여기 한 곳)
import Darwin
var instanceLockFd: Int32 = -1 // 프로세스 수명 동안 열어 둔다 — 닫히면 잠금이 풀린다
// 사용자당 한 개만 실행: ~/Library/Application Support/AITrendPet/<name>에 flock(비차단). 못 잡으면 false.
func acquireSingleInstanceLock(name: String) -> Bool {
    let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/AITrendPet")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let fd = open(dir.appendingPathComponent(name).path, O_CREAT | O_RDWR, 0o600)
    guard fd >= 0 else { return true } // 잠금 파일을 못 만들면 막지 않는다
    if flock(fd, LOCK_EX | LOCK_NB) != 0 { close(fd); return false }
    instanceLockFd = fd
    return true
}
let brand = "AI Trend" // 사용자에게 보이는 서비스 이름 — lib/i18n.ts BRAND.name과 같게
let petName = "애트라"
let defaultSiteURL = "https://hyomin-l.github.io/ai-trend" // 기본 서버. DISPATCH_URL 환경변수가 우선한다. 포크는 자기 Pages 주소로
let updateDocsURL = "https://github.com/hyomin-l/ai-trend/blob/main/desk-pet/README.md#updating" // 앱 업데이트 안내 (desk-pet/README.md "Updating" 절)
// 섹션 키 → 말풍선 라벨(기본값). 서버 latest.json의 sections가 있으면 그쪽이 우선한다 (config/sections.ts에서 생성).
let sectionLabel: [String: [String: String]] = [
    "ko": ["newsroom": "뉴스룸", "ax": "산업", "repos": "오픈소스", "pulse": "커뮤니티", "playbook": "실무"],
    "en": ["newsroom": "Newsroom", "ax": "Industry", "repos": "Open Source", "pulse": "Community Pulse", "playbook": "Practice"],
]

let defaults = UserDefaults(suiteName: "io.github.hyomin-l.deskpet")! // 번들 없는 실행 파일이라 도메인을 명시 (LaunchAgent Label과 동일)

// 언어: "ko"(기본) | "en". 메뉴에서 바꾸고 UserDefaults "lang"에 저장한다.
var lang: String { defaults.string(forKey: "lang") == "en" ? "en" : "ko" }
let menuText: [String: [String: String]] = [
    "check": ["ko": "지금 확인", "en": "Check now"], "hide": ["ko": "펫 숨기기", "en": "Hide pet"], "show": ["ko": "펫 보이기", "en": "Show pet"],
    "size": ["ko": "크기", "en": "Size"], "small": ["ko": "작게", "en": "Small"], "medium": ["ko": "보통", "en": "Medium"], "large": ["ko": "크게", "en": "Large"],
    "update": ["ko": "새 버전 있음 (%@) — 업데이트 방법", "en": "Update available (%@) — how to update"],
    "quit": ["ko": "종료 (다음 로그인까지 꺼짐)", "en": "Quit (off until next login)"], "lang": ["ko": "언어 / Language", "en": "Language / 언어"],
]
func tr(_ k: String) -> String { menuText[k]?[lang] ?? k }
let enMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// MARK: - 데이터

struct Latest: Decodable {
    struct Item: Decodable {
        struct Title: Decodable { let ko: String; let en: String? }
        let id: String
        let title: Title
        let section: String?
    }
    let date: String
    let issue: Int
    let front: [String]
    let items: [Item]
    struct Label: Decodable { let ko: String?; let en: String? }
    struct PetInfo: Decodable { let version: String? }
    let sections: [String: Label]? // 구버전 latest.json에는 없다
    let pet: PetInfo?
}

// 서버가 준 섹션 라벨(최신 latest.json) — 없거나 키가 빠지면 내장 sectionLabel로 대체한다.
var serverSections: [String: Latest.Label] = [:]
func labelFor(_ section: String) -> String? {
    let s = serverSections[section]
    return (lang == "en" ? s?.en : s?.ko) ?? sectionLabel[lang]?[section]
}

// "1.10.0" > "1.9.0" — 숫자 구간 단위 비교. 해석 못 하면 false(알리지 않는다).
func isNewer(_ a: String, than b: String) -> Bool {
    let x = a.split(separator: ".").map { Int($0) }, y = b.split(separator: ".").map { Int($0) }
    guard !x.isEmpty, !x.contains(nil), !y.contains(nil) else { return false }
    for i in 0..<max(x.count, y.count) {
        let p = i < x.count ? x[i]! : 0, q = i < y.count ? y[i]! : 0
        if p != q { return p > q }
    }
    return false
}

struct Bubble: Equatable {
    let caption: String
    let headline: String
    let link: String // 사이트 기준 상대 경로. 열 스토리를 알면 "/<lang>/<date>/?open=<id>", 아니면 "".
}

func caption(_ date: String, _ section: String? = nil) -> String {
    let d = date.split(separator: "-").compactMap { Int($0) }
    let day = d.count == 3 && (1...12).contains(d[1]) ? (lang == "en" ? "\(enMonths[d[1] - 1]) \(d[2])" : "\(d[1])월 \(d[2])일") : date
    return [brand, section.flatMap(labelFor), day].compactMap { $0 }.joined(separator: " · ")
}

func makeBubble(_ date: String, _ it: Latest.Item) -> Bubble {
    Bubble(caption: caption(date, it.section), headline: lang == "en" ? (it.title.en ?? it.title.ko) : it.title.ko, link: storyLink(date, it.id))
}

// 사이트 딥링크: 해당 스토리 모달이 열린 채로 그날의 지면을 연다.
func storyLink(_ date: String, _ id: String?) -> String {
    guard let id, !id.isEmpty else { return "" }
    let safe = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
    func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: safe) ?? "" }
    return "/\(lang)/\(enc(date))/?open=\(enc(id))"
}

func log(_ s: String) { FileHandle.standardError.write(Data("[deskpet] \(s)\n".utf8)) }

// MARK: - 종이 질감

// 사이트의 --paper-noise(feTurbulence fractalNoise, 160×160)에 맞춘 저진폭 그레인. 시작할 때 한 번만 만들어 타일로 재사용한다.
func noiseTile(base: Double, amp: Double, tint: Double = 0) -> Image {
    let n = 160
    var px = [UInt8](repeating: 255, count: n * n * 4)
    var g = SystemRandomNumberGenerator()
    for i in 0..<(n * n) {
        let v = base + amp * (Double.random(in: 0...1, using: &g) + .random(in: 0...1, using: &g) + .random(in: 0...1, using: &g) - 1.5)
        for c in 0..<3 { px[4 * i + c] = UInt8(min(max((v + (c == 2 ? tint : 0)) * 255, 0), 255).rounded()) }
    }
    let cg = CGDataProvider(data: Data(px) as CFData).flatMap {
        CGImage(width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: $0, decode: nil,
                shouldInterpolate: false, intent: .defaultIntent)
    }
    return cg.map { Image(decorative: $0, scale: 2) } ?? Image(systemName: "circle") // 2x = 80pt 타일
}
let paperGrain = ImagePaint(image: noiseTile(base: 0.968, amp: 0.045, tint: -0.008)) // ≈ #f7f7f5 ± 2%
let bodyGrain = ImagePaint(image: noiseTile(base: 0.5, amp: 0.30))

// MARK: - 컨트롤러 (패널 · 메뉴바 · 폴링 · 상태)

@MainActor
final class Pet: NSObject, ObservableObject, NSApplicationDelegate, NSMenuDelegate {
    @Published var bubble: Bubble?
    @Published var lively = false // 풍부한 애니메이션(떠다님·morph·곁눈질)을 돌리는 중인가. 평소엔 false — 가끔 깜빡이기만 한다.
    var livelyStart = Date.timeIntervalSinceReferenceDate
    var livelyUntil = Date.distantPast
    private var pins = Set<String>() // "hover" · "press" 중 하나라도 있으면 계속 lively
    private var settle: Task<Void, Never>?
    @Published var active = true // 창이 보이고 화면이 켜져 있을 때만 true — false면 애니메이션 루프를 멈춘다.
    @Published var petWidth = 56.0 // 펫 몸통 폭(pt): 44 / 56(기본) / 72
    var scale: Double { petWidth / 118 } // 몸통 폭 118(viewBox 단위) → petWidth
    // 펫 영역(160×156 단위) + 말풍선 자리(3줄 헤드라인 기준). 투명 영역은 이만큼뿐.
    var panelSize: CGSize { CGSize(width: 250, height: (156 * scale + 2 + 112).rounded(.up)) } // 정수 크기여야 창 위치가 흔들리지 않는다

    private let demo = CommandLine.arguments.contains("--demo")
    private let base: String = {
        let v = ProcessInfo.processInfo.environment["DISPATCH_URL"] ?? ""
        if v.isEmpty { return defaultSiteURL }
        // https, 로컬 테스트용 http://localhost·127.0.0.1, file://만 허용
        let host = URL(string: v)?.host
        let ok = v.hasPrefix("https://") || v.hasPrefix("file://")
            || (v.hasPrefix("http://") && (host == "localhost" || host == "127.0.0.1"))
        if !ok { log("DISPATCH_URL 무시(https·localhost·file만 허용): 기본 서버 사용") }
        return ok ? v : defaultSiteURL
    }()
    private var panel: NSPanel!
    private var statusItem: NSStatusItem!
    private var edition: Latest?
    private var newerVersion: String? // 서버가 알린 더 높은 앱 버전 — 있으면 메뉴 맨 위에 안내 항목
    private var queue: [Latest.Item] = [] // 클릭용 셔플 순서 — 다 돌아야 반복
    private var lastShownId: String?
    private var shown: (String, Latest.Item)? // 마지막으로 만든 말풍선의 (날짜, 기사) — 언어 전환 시 재생성용

    func applicationDidFinishLaunching(_ n: Notification) {
        guard acquireSingleInstanceLock(name: demo ? "demo.lock" : "deskpet.lock") else {
            log("이미 실행 중인 인스턴스가 있어 종료")
            exit(0)
        }
        let w = defaults.double(forKey: "petWidth")
        if [44.0, 56, 72].contains(w) { petWidth = w }
        makePanel()
        makeStatusItem()
        if demo {
            func it(_ id: String, _ sec: String, _ t: (String, String)) -> Latest.Item { .init(id: id, title: .init(ko: t.0, en: t.1), section: sec) }
            let items = [it("a", "repos", ("오픈소스 코딩 에이전트, 주간 ★ 1위", "Open-source coding agent tops the weekly star chart")), it("b", "pulse", ("개발자 커뮤니티가 꼽은 이번 주 가장 뜨거운 AI 툴 논쟁", "The hottest AI tool debate among developers this week")),
                         it("c", "playbook", ("프롬프트 캐싱으로 API 비용을 절반으로 줄이는 방법", "How prompt caching cuts your API bill in half")), it("d", "ax", ("제조 현장에 들어간 AI 점검 에이전트 사례", "An AI inspection agent on the factory floor"))]
            edition = Latest(date: "2026-10-13", issue: 0, front: ["a"], items: items, sections: nil, pet: nil)
            lastShownId = "a"
            present("2026-10-13", items[0])
        } else {
            Task { while !Task.isCancelled { await check(); try? await Task.sleep(for: .seconds(1800), tolerance: .seconds(120)) } }
        }
    }

    // MARK: 창

    private func makePanel() {
        let p = NSPanel(contentRect: NSRect(origin: .zero, size: panelSize),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        p.backgroundColor = .clear
        p.isOpaque = false
        p.hasShadow = false
        p.level = .floating
        p.hidesOnDeactivate = false // NSPanel 기본값 true: accessory 앱은 항상 비활성이라 숨겨져 버린다.
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        p.isMovableByWindowBackground = true
        let host = Host(rootView: Root(pet: self))
        host.frame = NSRect(origin: .zero, size: panelSize)
        p.contentView = host
        p.setFrameOrigin(startOrigin())
        p.orderFrontRegardless()
        NotificationCenter.default.addObserver(self, selector: #selector(moved), name: NSWindow.didMoveNotification, object: p)
        panel = p
        watchActivity()
    }

    // 가려지거나 화면이 꺼지거나 잠기면 active=false → 프레임 루프 정지(깨어나면 재개).
    private var asleep = false, locked = false
    private func watchActivity() {
        let sync = { [unowned self] in active = panel.occlusionState.contains(.visible) && !asleep && !locked }
        let nc = NotificationCenter.default, ws = NSWorkspace.shared.notificationCenter, dc = DistributedNotificationCenter.default()
        nc.addObserver(forName: NSWindow.didChangeOcclusionStateNotification, object: panel, queue: .main) { _ in MainActor.assumeIsolated(sync) }
        for (n, v) in [(NSWorkspace.screensDidSleepNotification, true), (NSWorkspace.screensDidWakeNotification, false),
                       (NSWorkspace.willSleepNotification, true), (NSWorkspace.didWakeNotification, false)] {
            ws.addObserver(forName: n, object: nil, queue: .main) { [unowned self] _ in MainActor.assumeIsolated { asleep = v; sync() } }
        }
        for (n, v) in [("com.apple.screenIsLocked", true), ("com.apple.screenIsUnlocked", false)] {
            dc.addObserver(forName: Notification.Name(n), object: nil, queue: .main) { [unowned self] _ in MainActor.assumeIsolated { locked = v; sync() } }
        }
        sync()
    }

    // 저장된 위치(화면 안으로 보정) → 없으면 메인 화면 우하단.
    private func startOrigin() -> NSPoint {
        let s = panelSize, k = scale
        let home = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        // 펫 몸통이 모서리에서 24pt 떨어지도록 (패널 안 투명 여백: 오른쪽 4+20k, 아래 26k)
        var o = NSPoint(x: home.maxX - 20 + 20 * k - s.width, y: home.minY + 24 - 26 * k)
        if let str = defaults.string(forKey: "origin") {
            let saved = NSPointFromString(str)
            if let vf = NSScreen.screens.map(\.visibleFrame).first(where: { $0.intersects(NSRect(origin: saved, size: s)) }) {
                o = NSPoint(x: min(max(saved.x, vf.minX), vf.maxX - s.width),
                            y: min(max(saved.y, vf.minY), vf.maxY - s.height))
            }
        }
        return o
    }

    @objc private func moved() { defaults.set(NSStringFromPoint(panel.frame.origin), forKey: "origin") }

    // MARK: 메뉴바

    // 상태바 메뉴와 우클릭 메뉴가 같은 목록을 쓴다. 제목·체크는 열릴 때 menuNeedsUpdate가 맞춘다.
    func buildMenu() -> NSMenu {
        let menu = NSMenu(), sizes = NSMenu()
        menu.delegate = self
        sizes.delegate = self
        for (key, w) in [("small", 44), ("medium", 56), ("large", 72)] {
            let it = NSMenuItem(title: "\(tr(key)) (\(w)pt)", action: #selector(setSize(_:)), keyEquivalent: "")
            it.tag = w
            sizes.addItem(it)
        }
        let sizeItem = NSMenuItem(title: tr("size"), action: nil, keyEquivalent: "")
        sizeItem.submenu = sizes
        let langs = NSMenu()
        langs.delegate = self
        for (code, name) in [("ko", "한국어"), ("en", "English")] {
            let it = NSMenuItem(title: name, action: #selector(setLang(_:)), keyEquivalent: "")
            it.representedObject = code
            langs.addItem(it)
        }
        let langItem = NSMenuItem(title: tr("lang"), action: nil, keyEquivalent: "")
        langItem.submenu = langs
        if let v = newerVersion { menu.addItem(NSMenuItem(title: String(format: tr("update"), v), action: #selector(openUpdateDocs), keyEquivalent: "")) }
        menu.addItem(NSMenuItem(title: tr("check"), action: #selector(checkNow), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: tr("hide"), action: #selector(toggle), keyEquivalent: ""))
        menu.addItem(sizeItem)
        menu.addItem(langItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: tr("quit"), action: #selector(quit), keyEquivalent: "q"))
        for m in [menu, sizes, langs] { m.items.forEach { $0.target = self } }
        return menu
    }

    func menuNeedsUpdate(_ m: NSMenu) {
        // 제목은 열릴 때마다 현재 언어로 다시 붙인다 (언어 전환 즉시 반영).
        let keys: [Selector: String] = [#selector(checkNow): "check", #selector(quit): "quit"]
        if let v = newerVersion { m.items.first(where: { $0.action == #selector(openUpdateDocs) })?.title = String(format: tr("update"), v) }
        let sizeKeys = [44: "small", 56: "medium", 72: "large"]
        for it in m.items {
            if let k = it.action.flatMap({ keys[$0] }) { it.title = tr(k) }
            if it.action == #selector(toggle) { it.title = tr(panel.isVisible ? "hide" : "show") }
            if it.action == #selector(setSize(_:)) { it.state = Double(it.tag) == petWidth ? .on : .off; it.title = "\(tr(sizeKeys[it.tag] ?? "medium")) (\(it.tag)pt)" }
            if it.action == #selector(setLang(_:)) { it.state = (it.representedObject as? String) == lang ? .on : .off }
            if let sub = it.submenu { it.title = tr(sub.items.first?.action == #selector(setLang(_:)) ? "lang" : "size") }
        }
    }

    // 메뉴바용 템플릿 이미지: 애트라 얼굴 실루엣(블롭 채움 + 눈 구멍). 사이트 Logo.tsx와 같은 좌표, viewBox 56 36 128 128.
    private func menuBarIcon() -> NSImage {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { r in
            let k = r.width / 128
            let blob = NSBezierPath()
            blob.move(to: NSPoint(x: 120, y: 42))
            blob.curve(to: NSPoint(x: 178, y: 102), controlPoint1: NSPoint(x: 156, y: 40), controlPoint2: NSPoint(x: 178, y: 66))
            blob.curve(to: NSPoint(x: 120, y: 158), controlPoint1: NSPoint(x: 178, y: 138), controlPoint2: NSPoint(x: 156, y: 158))
            blob.curve(to: NSPoint(x: 62, y: 104), controlPoint1: NSPoint(x: 84, y: 158), controlPoint2: NSPoint(x: 62, y: 140))
            blob.curve(to: NSPoint(x: 120, y: 42), controlPoint1: NSPoint(x: 62, y: 68), controlPoint2: NSPoint(x: 84, y: 44))
            blob.close()
            let eyeGap = 36.0 // 두 눈 중심 사이 거리(viewBox 128 단위, 얼굴 중심 x=120 기준 좌우 대칭) — 여기만 고치면 간격이 바뀐다
            for cx in [120 - eyeGap / 2, 120 + eyeGap / 2] { blob.append(NSBezierPath(roundedRect: NSRect(x: cx - 6.5, y: 89, width: 13, height: 24), xRadius: 6, yRadius: 6)) }
            // 좌표 → (좌표 - 원점) * k
            var m = AffineTransform(translationByX: -56, byY: -36); m.append(AffineTransform(scaleByX: k, byY: k))
            blob.transform(using: m)
            blob.windingRule = .evenOdd
            NSColor.black.setFill()
            blob.fill()
            return true
        }
        img.isTemplate = true
        img.accessibilityDescription = brand
        return img
    }

    private func makeStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            b.toolTip = "\(petName) · \(brand)"
            b.image = menuBarIcon()
        }
        let menu = buildMenu()
        statusItem.menu = menu
    }

    @objc private func checkNow() { Task { await check() } }
    @objc private func openUpdateDocs() { if let u = URL(string: updateDocsURL) { NSWorkspace.shared.open(u) } } // 열기만 한다 — 명령은 실행하지 않는다.
    @objc private func quit() { NSApp.terminate(nil) }
    // 오른쪽 아래 모서리를 고정한 채 패널 크기를 바꾼다.
    @objc private func setSize(_ item: NSMenuItem) {
        petWidth = Double(item.tag)
        defaults.set(petWidth, forKey: "petWidth")
        let f = panel.frame, n = panelSize
        panel.setFrame(NSRect(x: f.maxX - n.width, y: f.minY, width: n.width, height: n.height), display: true)
    }
    @objc private func setLang(_ item: NSMenuItem) {
        defaults.set(item.representedObject as? String ?? "ko", forKey: "lang")
        if bubble != nil, let (d, it) = shown { present(d, it) } // 떠 있는 말풍선을 새 언어로 다시 그린다
    }
    @objc private func toggle() {
        if panel.isVisible { panel.orderOut(nil) } else { panel.orderFrontRegardless() }
    }

    // MARK: 가져오기

    private func check() async {
        guard !demo, let url = URL(string: base)?.appendingPathComponent("latest.json") else { return }
        let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let l = try? JSONDecoder().decode(Latest.self, from: data),
              let lead = l.items.first(where: { $0.id == l.front.first }) ?? l.items.first
        else { return } // 실패는 조용히 무시 — 다음 주기에 다시 시도한다.
        serverSections = l.sections ?? [:]
        newerVersion = l.pet?.version.flatMap { isNewer($0, than: appVersion) ? $0 : nil }
        statusItem.menu = buildMenu() // 메뉴바 메뉴는 한 번 만들어 두므로 안내 항목 유무가 바뀌면 다시 만든다
        if edition?.date != l.date { queue = [] }
        edition = l
        if l.date != defaults.string(forKey: "lastSeenDate") {
            log("새 판 감지: \(l.date) 제\(l.issue)호 — \(lead.title.ko)")
            lastShownId = lead.id
            present(l.date, lead)
        }
    }

    // MARK: 말풍선

    // 이유(pin)가 있는 동안은 lively 유지, 모두 사라지면 grace초 뒤 서서히 가라앉고 idle로 복귀.
    func pin(_ k: String, _ on: Bool, grace: Double = 4) {
        if on { pins.insert(k) } else { pins.remove(k) }
        settle?.cancel()
        let now = Date.timeIntervalSinceReferenceDate
        if !lively { livelyStart = now; lively = true }
        if !pins.isEmpty { livelyUntil = .distantFuture; return }
        livelyUntil = Date(timeIntervalSinceReferenceDate: now + grace)
        settle = Task { [weak self] in
            try? await Task.sleep(for: .seconds(grace + 1.1), tolerance: .milliseconds(300))
            if !Task.isCancelled { self?.lively = false }
        }
    }

    private func present(_ d: String, _ it: Latest.Item) { shown = (d, it); show(makeBubble(d, it)) }

    func show(_ b: Bubble?) {
        pin("bubble", false) // 말풍선은 pin이 아니다 — 뜨거나 닫힐 때 grace초만 lively(눈길 끌기), 이후엔 idle 자세로 떠 있는다
        let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        withAnimation(calm ? .easeOut(duration: 0.15) : .spring(response: 0.45, dampingFraction: 0.72)) { bubble = b }
    }

    private func markSeen() {
        if !demo, let d = edition?.date { defaults.set(d, forKey: "lastSeenDate") }
    }

    func dismiss() { markSeen(); show(nil) }

    func openSite() {
        let link = bubble?.link ?? ""
        if let u = URL(string: link.isEmpty ? base : base.hasSuffix("/") ? base + link.dropFirst() : base + link),
           let b = URL(string: base), u.scheme == b.scheme, ["http", "https", "file"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
        dismiss()
    }

    // 펫 클릭: 이번 판에서 무작위 기사(셔플 순환, 직전과 같은 기사는 연속 금지). 말풍선이 떠 있으면 교체.
    func petTapped() {
        guard let e = edition, !e.items.isEmpty else { return }
        if queue.isEmpty {
            queue = e.items.shuffled()
            if queue.count > 1, queue.last?.id == lastShownId { queue.swapAt(0, queue.count - 1) } // last가 먼저 나오지 않게
        }
        let it = queue.removeLast()
        lastShownId = it.id
        present(e.date, it)
    }
}

// MARK: - 뷰

struct Root: View {
    @ObservedObject var pet: Pet
    var body: some View {
        let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let tailX = 246 - 80 * pet.scale // 말풍선 꼬리가 펫 몸통 중앙을 가리키도록 (펫 영역 폭 160k의 절반 − 오른쪽 여백 차)
        VStack(alignment: .trailing, spacing: 2) {
            Spacer(minLength: 0)
            if let b = pet.bubble {
                BubbleView(b: b, pet: pet, tailX: tailX)
                    .padding(.trailing, 10)
                    .transition(calm ? .opacity : .scale(scale: 0.85, anchor: UnitPoint(x: tailX / 250, y: 1)).combined(with: .opacity))
            }
            PetView(pet: pet).padding(.trailing, 4)
        }
        .frame(width: pet.panelSize.width, height: pet.panelSize.height, alignment: .bottomTrailing)
    }
}

// 사이트 토큰(app/globals.css): --paper #f7f7f5, --ink #121212, --ink-3 #6b6b6b, --rule-2 ink 22%. 바탕화면이 어두워도 항상 라이트 테마.
struct BubbleView: View {
    static let tail: CGFloat = 7
    static let width: CGFloat = 232 // 창 폭 250 − 오른쪽 여백 10 − 왼쪽 여백 8: 왼쪽 선·그림자가 창 가장자리에서 잘리지 않게
    let b: Bubble
    let pet: Pet
    let tailX: CGFloat
    @State private var pressed = false

    var body: some View {
        let shape = BubbleShape(tail: Self.tail, tailX: tailX - (240 - Self.width)) // 말풍선이 창 안쪽에서 시작하므로 꼬리 위치는 말풍선 기준으로
        let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 5) {
                    Circle().fill(Color(0xC2186F)).frame(width: 5, height: 5)
                    Text(b.caption).font(.system(size: 11, weight: .medium)).foregroundStyle(Color(0x6B6B6B))
                }
                Text(b.headline).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Color(0x121212))
                    .lineLimit(3).lineSpacing(2).truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(EdgeInsets(top: 12, leading: 15, bottom: 13 + Self.tail, trailing: 32))
            .overlay(DragTap(onTap: pet.openSite, onPress: { pressed = $0 }, menu: pet.buildMenu))
            // 버튼도 같은 NSView 오버레이로 — SwiftUI Button은 AppKit hitTest에서 위 오버레이에 가려진다.
            Image(systemName: "xmark").font(.system(size: 8.5, weight: .semibold)).foregroundStyle(Color(0x9A9A9A))
                .frame(width: 24, height: 24)
                .overlay(DragTap(onTap: pet.dismiss))
                .padding(.top, 5).padding(.trailing, 5)
                .accessibilityLabel("닫기")
                .accessibilityAddTraits(.isButton)
        }
        .frame(width: Self.width)
        .background(shape.fill(paperGrain).shadow(color: .black.opacity(0.14), radius: 5, y: 2))
        .overlay(shape.stroke(Color(0x121212).opacity(0.22), lineWidth: 0.75))
        .environment(\.colorScheme, .light)
        .scaleEffect(pressed && !calm ? 0.98 : 1, anchor: UnitPoint(x: (tailX - (240 - Self.width)) / Self.width, y: 1))
        .animation(.easeOut(duration: 0.1), value: pressed)
        .accessibilityElement(children: .contain)
    }
}

// 몸통과 꼬리를 하나의 외곽선으로: 아래 변을 꼬리 밑변에서 끊고 삼각형을 이어 붙인 단일 경로(안쪽 선 없음).
struct BubbleShape: Shape {
    let tail: CGFloat, tailX: CGFloat
    func path(in r: CGRect) -> Path {
        let rad: CGFloat = 4, by = r.maxY - tail, hw: CGFloat = 6
        let tx = min(max(r.minX + tailX, r.minX + rad + hw), r.maxX - rad - hw)
        var p = Path()
        p.move(to: CGPoint(x: r.minX + rad, y: r.minY))
        p.addArc(tangent1End: CGPoint(x: r.maxX, y: r.minY), tangent2End: CGPoint(x: r.maxX, y: by), radius: rad)
        p.addArc(tangent1End: CGPoint(x: r.maxX, y: by), tangent2End: CGPoint(x: r.minX, y: by), radius: rad)
        p.addLine(to: CGPoint(x: tx + hw, y: by))
        p.addLine(to: CGPoint(x: tx, y: r.maxY))
        p.addLine(to: CGPoint(x: tx - hw, y: by))
        p.addArc(tangent1End: CGPoint(x: r.minX, y: by), tangent2End: CGPoint(x: r.minX, y: r.minY), radius: rad)
        p.addArc(tangent1End: CGPoint(x: r.minX, y: r.minY), tangent2End: CGPoint(x: r.maxX, y: r.minY), radius: rad)
        p.closeSubpath()
        return p
    }
}

// 투명 오버레이: 끌면 창이 이동하고, 끌지 않고 놓으면 onTap. onPress는 누름~뗌(끄는 동안 포함) 피드백용.
struct DragTap: NSViewRepresentable {
    let onTap: () -> Void
    var onPress: (Bool) -> Void = { _ in }
    var onHover: ((Bool) -> Void)?
    var menu: (() -> NSMenu)?

    final class V: NSView {
        var onTap: () -> Void = {}
        var onPress: (Bool) -> Void = { _ in }
        var onHover: ((Bool) -> Void)?
        var menuProvider: (() -> NSMenu)?
        private var down: NSEvent?
        override var mouseDownCanMoveWindow: Bool { false }
        override func acceptsFirstMouse(for e: NSEvent?) -> Bool { true }
        override func updateTrackingAreas() {
            trackingAreas.forEach(removeTrackingArea)
            if onHover != nil { addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)) }
        }
        override func mouseEntered(with e: NSEvent) { onHover?(true) }
        override func mouseExited(with e: NSEvent) { onHover?(false) }
        override func mouseDown(with e: NSEvent) { down = e; onPress(true) }
        override func mouseDragged(with e: NSEvent) {
            guard let d = down, hypot(e.locationInWindow.x - d.locationInWindow.x,
                                      e.locationInWindow.y - d.locationInWindow.y) > 3 else { return }
            down = nil
            window?.performDrag(with: d) // 최신 macOS에서는 곧바로 돌아온다(드래그는 비동기 진행) — 누른 자세는 mouseUp에서만 푼다.
        }
        override func mouseUp(with e: NSEvent) {
            let tap = down != nil
            down = nil
            onPress(false)
            if tap { onTap() }
        }
        override func rightMouseDown(with e: NSEvent) {
            if let m = menuProvider?() { NSMenu.popUpContextMenu(m, with: e, for: self) }
        }
    }
    func makeNSView(context: Context) -> V { V() }
    func updateNSView(_ v: V, context: Context) { v.onTap = onTap; v.onPress = onPress; v.onHover = onHover; v.menuProvider = menu }
}

final class Host<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for e: NSEvent?) -> Bool { true }
}

// MARK: - 모찌 블롭

// 윤곽 제어점: M + 3×(C c1 c2 end) = 13점 (viewBox 240×190). A↔B를 보간해 morph.
let blobA: [Double] = [120, 42, 156, 40, 178, 66, 178, 102, 178, 138, 156, 158, 120, 158, 84, 158, 62, 140, 62, 104, 62, 68, 84, 44, 120, 42]
let blobB: [Double] = [118, 46, 158, 42, 182, 70, 180, 106, 178, 138, 152, 156, 118, 156, 82, 156, 60, 136, 62, 102, 64, 70, 82, 48, 118, 46]

struct Blob: Shape {
    var w: Double // 0 = A, 1 = B
    func path(in _: CGRect) -> Path {
        let p = (0..<13).map { i in
            CGPoint(x: blobA[2 * i] + (blobB[2 * i] - blobA[2 * i]) * w,
                    y: blobA[2 * i + 1] + (blobB[2 * i + 1] - blobA[2 * i + 1]) * w)
        }
        var path = Path()
        path.move(to: p[0])
        for i in stride(from: 1, to: 13, by: 3) { path.addCurve(to: p[i + 2], control1: p[i], control2: p[i + 1]) }
        path.closeSubpath()
        return path
    }
}

// (시각, 값) 키프레임 사이를 smoothstep으로 보간.
func keyframe(_ t: Double, _ k: [(Double, Double)]) -> Double {
    guard let i = k.lastIndex(where: { $0.0 <= t }), i + 1 < k.count else { return k.last!.1 }
    let u = (t - k[i].0) / (k[i + 1].0 - k[i].0)
    return k[i].1 + (k[i + 1].1 - k[i].1) * u * u * (3 - 2 * u)
}

extension Color {
    init(_ hex: UInt32) {
        self.init(red: Double(hex >> 16 & 255) / 255, green: Double(hex >> 8 & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct PetView: View {
    @ObservedObject var pet: Pet
    @State private var pressed = false
    @State private var blink = 1.0
    let eye = Color(0xFFF4FA)

    var body: some View {
        let s = pet.scale
        // 보이는 영역만 레이아웃에 반영 (viewBox x 40–200, y 28–184).
        Color.clear.frame(width: 160 * s, height: 156 * s)
            .overlay(alignment: .topLeading) {
                scene.frame(width: 240, height: 190)
                    .scaleEffect(s, anchor: .topLeading)
                    .offset(x: -40 * s, y: -28 * s)
                    .frame(width: 240 * s, height: 190 * s, alignment: .topLeading)
            }
            // 누르면 납작하게, 떼면 출렁이며 복원(squash & stretch). 동작 줄이기에서는 생략.
            .scaleEffect(x: pressed ? 1.04 : 1, y: pressed ? 0.94 : 1, anchor: .bottom)
            .animation(pressed ? .easeOut(duration: 0.08) : .spring(response: 0.28, dampingFraction: 0.6), value: pressed)
            .overlay(DragTap(onTap: pet.petTapped,
                             onPress: { pressed = $0 && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion; pet.pin("press", $0) },
                             onHover: { pet.pin("hover", $0) }, menu: pet.buildMenu))
            .accessibilityLabel("\(petName), \(brand) 펫")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { pet.petTapped() }
    }

    // idle: 정지 자세 + 타이머 깜빡임만(프레임 루프 없음). lively: 시각 t의 함수로 그리는 풍부한 애니메이션(20fps),
    // 가려지거나 화면이 꺼지면 멈춘다. 가라앉을 때는 진폭(amp)을 줄여 idle 자세로 부드럽게 이어진다.
    @ViewBuilder private var scene: some View {
        if pet.lively {
            TimelineView(.animation(minimumInterval: 1.0 / 20, paused: !pet.active)) { tl in
                let now = tl.date.timeIntervalSinceReferenceDate
                let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion // 동작 줄이기: 깜빡임만
                let t = now - pet.livelyStart
                let ease = { (x: Double) in let c = min(max(x, 0), 1); return c * c * (3 - 2 * c) }
                let amp = calm ? 0 : min(ease(t / 0.4), ease(pet.livelyUntil.timeIntervalSinceReferenceDate - now))
                let lift = amp * (0.5 - 0.5 * cos(2 * .pi * t / 4.2))
                let morph = amp * (0.5 - 0.5 * cos(2 * .pi * t / 6))
                let glance = amp * keyframe(t.truncatingRemainder(dividingBy: 9),
                                            [(0, 0), (5, 0), (5.6, 5), (7, 5), (7.6, -4), (8.2, -4), (9, 0)])
                let bp = (now + 2.1).truncatingRemainder(dividingBy: 6.3)
                content(lift, morph, glance, bp < 0.15 ? 1 - 0.92 * sin(.pi * bp / 0.15) : 1)
            }
        } else {
            content(0, 0, 0, blink)
                .onReceive(Timer.publish(every: 7, tolerance: 4, on: .main, in: .common).autoconnect()) { _ in
                    guard pet.active else { return }
                    withAnimation(.easeIn(duration: 0.07)) { blink = 0.08 }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) { withAnimation(.easeOut(duration: 0.1)) { blink = 1 } }
                }
        }
    }

    private func content(_ lift: Double, _ morph: Double, _ glance: Double, _ blink: Double) -> some View {
        ZStack {
            Ellipse().fill(RadialGradient(colors: [.black.opacity(0.32 - 0.12 * lift), .black.opacity(0)],
                                          center: .center, startRadius: 0, endRadius: 40 - 8 * lift))
                .frame(width: 88 - 16 * lift, height: 12)
                .position(x: 121, y: 174)
            ZStack {
                body(morph)
                ForEach([108.0, 132.0], id: \.self) { x in
                    Capsule().fill(eye).frame(width: 8, height: 17)
                        .shadow(color: eye.opacity(0.5), radius: 3)
                        .scaleEffect(y: blink)
                        .position(x: x + glance, y: 100)
                }
            }
            .offset(y: -6 * lift)
        }
        .frame(width: 240, height: 190)
    }

    private func body(_ morph: Double) -> some View {
        let shape = Blob(w: morph)
        return ZStack {
            shape.fill(LinearGradient(colors: [Color(0xF0479E), Color(0xC8137A), Color(0x7D0C52)],
                                      startPoint: UnitPoint(x: 62 / 240, y: 40 / 190),
                                      endPoint: UnitPoint(x: 180 / 240, y: 158 / 190)))
                .shadow(color: Color(0x7D0C52).opacity(0.30), radius: 7, y: 4)
            shape.fill(RadialGradient(colors: [.white.opacity(0.30), .white.opacity(0)],
                                      center: UnitPoint(x: 92 / 240, y: 70 / 190), startRadius: 0, endRadius: 80))
            shape.fill(bodyGrain).blendMode(.overlay).opacity(0.22)
            shape.stroke(.white.opacity(0.10), lineWidth: 0.6)
        }
    }
}

// MARK: - 진입점

@main
enum Launcher {
    @MainActor static func main() {
        let app = NSApplication.shared
        let pet = Pet() // app.delegate는 약한 참조 — run() 동안 이 지역 변수가 유지한다.
        app.delegate = pet
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
