// DeskPet — 뉴스 사이트 데스크톱 펫 (macOS, AppKit + SwiftUI, 외부 패키지 없음)
// 빌드: ./build.sh   실행: ./DeskPet [--demo]   서버 지정: DISPATCH_URL=...
import AppKit
import SwiftUI

let brand = "AI Trend" // 사용자에게 보이는 서비스 이름은 여기 한 곳뿐 — 이름이 바뀌면 이 줄만 고친다.
let defaults = UserDefaults(suiteName: "io.github.hyomin-l.deskpet")! // 번들 없는 실행 파일이라 도메인을 명시 (LaunchAgent Label과 동일)

// MARK: - 데이터

struct Latest: Decodable {
    struct Item: Decodable {
        struct Title: Decodable { let ko: String }
        let id: String
        let title: Title
    }
    let date: String
    let issue: Int
    let front: [String]
    let items: [Item]
}

struct Bubble: Equatable {
    let caption: String
    let headline: String
}

func caption(_ date: String, _ issue: Int) -> String {
    let d = date.split(separator: "-").compactMap { Int($0) }
    return "새 판 · " + (d.count == 3 ? "\(d[1])월 \(d[2])일" : date) + " · 제\(issue)호"
}

func log(_ s: String) { FileHandle.standardError.write(Data("[deskpet] \(s)\n".utf8)) }

// MARK: - 컨트롤러 (패널 · 메뉴바 · 폴링 · 상태)

@MainActor
final class Pet: NSObject, ObservableObject, NSApplicationDelegate {
    @Published var bubble: Bubble?
    @Published var petWidth = 56.0 // 펫 몸통 폭(pt): 44 / 56(기본) / 72
    var scale: Double { petWidth / 118 } // 몸통 폭 118(viewBox 단위) → petWidth
    // 펫 영역(160×156 단위) + 말풍선 자리(2줄 헤드라인 기준). 투명 영역은 이만큼뿐.
    var panelSize: CGSize { CGSize(width: 250, height: (156 * scale + 2 + 90).rounded(.up)) } // 정수 크기여야 창 위치가 흔들리지 않는다

    private let demo = CommandLine.arguments.contains("--demo")
    private let base: String = {
        let v = ProcessInfo.processInfo.environment["DISPATCH_URL"] ?? ""
        return v.isEmpty ? "https://hyomin-l.github.io/ai-trend" : v
    }()
    private var panel: NSPanel!
    private var statusItem: NSStatusItem!
    private var toggleItem: NSMenuItem!
    private let sizeMenu = NSMenu()
    private var last: (date: String, bubble: Bubble)?

    func applicationDidFinishLaunching(_ n: Notification) {
        let w = defaults.double(forKey: "petWidth")
        if [44.0, 56, 72].contains(w) { petWidth = w }
        makePanel()
        makeStatusItem()
        if demo {
            let b = Bubble(caption: caption("2026-10-13", 1), headline: "오픈소스 코딩 에이전트, 주간 ★ 1위")
            last = ("demo", b)
            show(b)
        } else {
            Task { while !Task.isCancelled { await check(); try? await Task.sleep(for: .seconds(1800)) } }
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

    private func makeStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            let img = NSImage(systemSymbolName: "newspaper", accessibilityDescription: brand)
            b.toolTip = brand
            img?.isTemplate = true
            b.image = img
            if img == nil { b.title = "●" }
        }
        toggleItem = NSMenuItem(title: "펫 숨기기", action: #selector(toggle), keyEquivalent: "")
        for (title, w) in [("작게", 44), ("보통", 56), ("크게", 72)] {
            let it = NSMenuItem(title: "\(title) (\(w)pt)", action: #selector(setSize(_:)), keyEquivalent: "")
            it.tag = w
            it.target = self
            sizeMenu.addItem(it)
        }
        syncSizeChecks()
        let sizeItem = NSMenuItem(title: "크기", action: nil, keyEquivalent: "")
        sizeItem.submenu = sizeMenu
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "지금 확인", action: #selector(checkNow), keyEquivalent: ""))
        menu.addItem(toggleItem)
        menu.addItem(sizeItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "종료", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
    }

    @objc private func checkNow() { Task { await check() } }
    @objc private func quit() { NSApp.terminate(nil) }
    private func syncSizeChecks() { sizeMenu.items.forEach { $0.state = Double($0.tag) == petWidth ? .on : .off } }
    // 오른쪽 아래 모서리를 고정한 채 패널 크기를 바꾼다.
    @objc private func setSize(_ item: NSMenuItem) {
        petWidth = Double(item.tag)
        defaults.set(petWidth, forKey: "petWidth")
        syncSizeChecks()
        let f = panel.frame, n = panelSize
        panel.setFrame(NSRect(x: f.maxX - n.width, y: f.minY, width: n.width, height: n.height), display: true)
    }
    @objc private func toggle() {
        if panel.isVisible { panel.orderOut(nil) } else { panel.orderFrontRegardless() }
        toggleItem.title = panel.isVisible ? "펫 숨기기" : "펫 보이기"
    }

    // MARK: 가져오기

    private func check() async {
        guard !demo, let url = URL(string: base)?.appendingPathComponent("latest.json") else { return }
        let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let l = try? JSONDecoder().decode(Latest.self, from: data),
              let title = (l.items.first { $0.id == l.front.first } ?? l.items.first)?.title.ko
        else { return } // 실패는 조용히 무시 — 다음 주기에 다시 시도한다.
        let b = Bubble(caption: caption(l.date, l.issue), headline: title)
        last = (l.date, b)
        if l.date != defaults.string(forKey: "lastSeenDate") {
            log("새 판 감지: \(l.date) 제\(l.issue)호 — \(title)")
            show(b)
        }
    }

    // MARK: 말풍선

    func show(_ b: Bubble?) {
        let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        withAnimation(calm ? .easeOut(duration: 0.15) : .spring(response: 0.45, dampingFraction: 0.72)) { bubble = b }
    }

    private func markSeen() {
        if !demo, let d = last?.date { defaults.set(d, forKey: "lastSeenDate") }
    }

    func dismiss() { markSeen(); show(nil) }

    func openSite() {
        if let u = URL(string: base) { NSWorkspace.shared.open(u) }
        dismiss()
    }

    func petTapped() { if bubble == nil, let b = last?.bubble { show(b) } }
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

struct BubbleView: View {
    static let tail: CGFloat = 7
    let b: Bubble
    let pet: Pet
    let tailX: CGFloat

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Circle().fill(Color(0xF0479E)).frame(width: 6, height: 6)
                    Text(b.caption).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                }
                Text(b.headline).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(EdgeInsets(top: 11, leading: 14, bottom: 11 + Self.tail, trailing: 30))
            .overlay(DragTap(onTap: pet.openSite))
            // 버튼도 같은 NSView 오버레이로 — SwiftUI Button은 AppKit hitTest에서 위 오버레이에 가려진다.
            Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .overlay(DragTap(onTap: pet.dismiss))
                .padding(.top, 5).padding(.trailing, 5)
                .accessibilityLabel("닫기")
                .accessibilityAddTraits(.isButton)
        }
        .frame(width: 240)
        .background(
            ZStack {
                BubbleShape(tail: Self.tail, tailX: tailX).fill(.black.opacity(0.22)).blur(radius: 7).offset(y: 3)
                Glass().clipShape(BubbleShape(tail: Self.tail, tailX: tailX))
            })
        .overlay(BubbleShape(tail: Self.tail, tailX: tailX).stroke(.primary.opacity(0.12), lineWidth: 0.5))
        .accessibilityElement(children: .contain)
    }
}

struct BubbleShape: Shape {
    let tail: CGFloat, tailX: CGFloat
    func path(in r: CGRect) -> Path {
        let body = CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height - tail)
        var p = Path(roundedRect: body, cornerRadius: 14, style: .continuous)
        p.move(to: CGPoint(x: r.minX + tailX - 7, y: body.maxY))
        p.addLine(to: CGPoint(x: r.minX + tailX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + tailX + 7, y: body.maxY))
        p.closeSubpath()
        return p
    }
}

// 비활성 패널에서도 유리 질감이 흐려지지 않도록 state를 .active로 고정한 NSVisualEffectView.
struct Glass: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.material = .popover
        v.blendingMode = .behindWindow
        v.state = .active
        return v
    }
    func updateNSView(_ v: NSVisualEffectView, context: Context) {}
}

// 투명 오버레이: 끌면 창이 이동하고, 끌지 않고 놓으면 onTap.
struct DragTap: NSViewRepresentable {
    let onTap: () -> Void

    final class V: NSView {
        var onTap: () -> Void = {}
        private var down: NSEvent?
        override var mouseDownCanMoveWindow: Bool { false }
        override func acceptsFirstMouse(for e: NSEvent?) -> Bool { true }
        override func mouseDown(with e: NSEvent) { down = e }
        override func mouseDragged(with e: NSEvent) {
            guard let d = down, hypot(e.locationInWindow.x - d.locationInWindow.x,
                                      e.locationInWindow.y - d.locationInWindow.y) > 3 else { return }
            down = nil
            window?.performDrag(with: d)
        }
        override func mouseUp(with e: NSEvent) {
            if down != nil { onTap() }
            down = nil
        }
    }
    func makeNSView(context: Context) -> V { V() }
    func updateNSView(_ v: V, context: Context) { v.onTap = onTap }
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
    let pet: Pet
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
            .overlay(DragTap(onTap: pet.petTapped))
            .accessibilityLabel("\(brand) 펫")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { pet.petTapped() }
    }

    private var scene: some View {
        // 애니메이션은 전부 시각 t의 함수 — 타이머 없음.
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            let calm = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion // 동작 줄이기: 깜빡임만
            let lift = calm ? 0 : 0.5 - 0.5 * cos(2 * .pi * t / 4.2)   // 0…1, 둥실
            let morph = calm ? 0 : 0.5 - 0.5 * cos(2 * .pi * t / 6)    // A→B→A
            let glance = calm ? 0 : keyframe(t.truncatingRemainder(dividingBy: 9),
                                             [(0, 0), (5, 0), (5.6, 5), (7, 5), (7.6, -4), (8.2, -4), (9, 0)])
            let bp = (t + 2.1).truncatingRemainder(dividingBy: 6.3)    // 깜빡임 위상 (morph와 어긋나게)
            let blink = bp < 0.15 ? 1 - 0.92 * sin(.pi * bp / 0.15) : 1
            ZStack {
                Ellipse().fill(.black.opacity(0.30 - 0.12 * lift))
                    .frame(width: 80 - 16 * lift, height: 9).blur(radius: 4)
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
        }
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
