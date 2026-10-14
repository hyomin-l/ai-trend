"use client";

import { useEffect, useRef } from "react";
import createGlobe, { type Marker } from "cobe";
import type { Region } from "@/types";
import styles from "./Globe.module.css";

/** [lat, lng] anchor per region. GLOBAL has no place on the sphere. */
const COORDS: Partial<Record<Region, [number, number]>> = {
  KR: [37.5, 127],
  US: [39, -98],
  EU: [50, 10],
  CN: [34, 104],
  JP: [36, 138],
};

const THETA = 0.3; // resting tilt
const TILT = 1.0; // max tilt either way (rad), so the poles never flip over
const ELEVATION = 0.02; // markerElevation
const SPHERE = 0.8; // cobe draws the sphere with radius 0.8 of the half-canvas
const SCALE = 1.2; // ...times this: the sphere fills 96% of the canvas, so the (fixed-size) dots are 20% bigger in the same box
/** Keeps the dot spacing constant (about 7px) whatever the globe size. 0.3 read as noise; 0.14 left the land too faint, worst in the night edition. */
const samples = (size: number) => Math.max(1000, Math.round(size * size * 0.2));
const AUTO = 0.002; // radians per frame while idle, about one turn a minute
const TAU = Math.PI * 2;
const CLICK_SLOP = 3; // px of travel that still counts as a click rather than a drag
const HIT_RADIUS = 12; // px around a marker that still selects it

/** phi that puts the given longitude in front of the camera (derived from cobe's lat/lng mapping). */
const facing = (lng: number) => -Math.PI / 2 - (lng * Math.PI) / 180;

/**
 * cobe cuts each land dot out of its Fibonacci lattice with `smoothstep(8e-3, 0., g)`, g being the distance to the nearest lattice
 * point on the unit sphere. At this size that is a disc only 1-2 device px wide whose edge covers well under a pixel, so as the
 * globe turns the pixels under every dot flip on and off and the whole sphere sizzles. cobe has no option for it, so the one
 * constant is widened in the shader source as it is handed to WebGL (instance-level on our own canvas' context, nothing global).
 * `softened` below reports it when a cobe upgrade changes the string (tests/globe-shader.test.ts fails first).
 */
const DOT_MASK = "smoothstep(8e-3,0.,g)";
const DOT_WIDER = "smoothstep(1.6e-2,0.,g)";

type RGB = [number, number, number];

/**
 * Dots on paper in the day edition (near-black land on an almost-paper sphere), light dots on ink in the night edition.
 * cobe shades land by `mapBrightness * dot coverage`. The core must saturate (>1) to read as solid, but a high value (it was 14-24)
 * clips the mask into a hard binary disc whose pixel count jumps as it moves, which is the sizzle; about 2.5 keeps the core solid
 * and leaves a graded edge that supersampling can average. Measured on the day globe (second difference of a tracked dot's ink
 * per frame, same total ink): 12% -> 5% with the wider mask below, peak darkness 10% -> 1.6%.
 */
const palette = (night: boolean) =>
  night
    ? { dark: 1, baseColor: [0.97, 0.96, 0.94] as RGB, glowColor: [0.03, 0.03, 0.03] as RGB, markerColor: [0.98, 0.36, 0.67] as RGB, mapBrightness: 2.5, mapBaseBrightness: 0.05, diffuse: 1.1 }
    : { dark: 0, baseColor: [1.14, 1.14, 1.12] as RGB, glowColor: [0.97, 0.97, 0.96] as RGB, markerColor: [0.76, 0.09, 0.44] as RGB, mapBrightness: 2.5, mapBaseBrightness: 0.03, diffuse: 1 };

/** Is the page dark right now: the pinned <html data-theme>, else the system preference. */
const isNight = () => {
  const pinned = document.documentElement.dataset.theme;
  return pinned ? pinned === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

type Props = {
  regions: { region: Region; count: number }[];
  /** Region the edition is filtered to: stays emphasised and keeps the globe turned to it. */
  active: Region | null;
  /** Region being previewed (hover/focus on its row): the globe turns to it and its markers pulse. */
  hover: Region | null;
  /** A marker was clicked or tapped (a drag does not count). */
  onPick?: (region: Region) => void;
  /** A click (not a drag) landed on the sphere but on no marker. */
  onClear?: () => void;
};

type Controller = { sync: (regions: Props["regions"], active: Region | null, hover: Region | null) => void };

const PULSE_MS = 1100;

/**
 * cobe v2 has no render loop of its own (no onRender): every `update()` draws one frame, so this component
 * owns a requestAnimationFrame loop. It pauses off-screen, in background tabs and under prefers-reduced-motion.
 */
export default function Globe({ regions, active, hover, onPick, onClear }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const pick = useRef(onPick);
  const clear = useRef(onClear);
  useEffect(() => {
    pick.current = onPick;
    clear.current = onClear;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    // cobe renders into a canvas we never attach (it wraps it in a <div> of its own); what the page shows is `canvas`, a plain
    // 2D canvas that `blit` fills from it. Cleanup therefore leaves React's DOM untouched.
    const gl = document.createElement("canvas");
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    el.appendChild(canvas);
    const view = canvas.getContext("2d");

    let size = Math.round(el.clientWidth) || 170;
    let phi = facing(127);
    let theta = THETA;
    let target: number | null = null;
    let markers: Marker[] = [];
    let list: Props["regions"] = [];
    let selected: Region | null = null;
    let preview: Region | null = null;
    let vel = 0;
    let tvel = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;
    let travelled = 0;
    let raf = 0;
    let visible = true;

    /** Device pixels the canvas covers on screen, and cobe's supersampling (a whole multiple, so the downscale below is a clean box). */
    const dpr = () => Math.max(1, window.devicePixelRatio || 1);
    const oversample = () => Math.max(4, Math.ceil(dpr() * 2));
    const fit = () => {
      const px = Math.max(1, Math.round(el.getBoundingClientRect().width * dpr()));
      if (canvas.width !== px) canvas.width = canvas.height = px;
    };
    /**
     * Copy the frame cobe just drew onto the visible canvas, scaled down to exactly the device pixels it covers. Must run in the
     * same task as the draw (cobe's canvas is not preserved). Why not let the browser scale cobe's canvas: cobe's dots are only
     * ~1-2 device px, and a compositor bilinear downscale of an oversampled canvas reads just a few of the pixels under each
     * device pixel, so dots flicker as they drift ("sizzle"), worst when the box is a fractional px wide or the page is zoomed.
     * drawImage with high smoothing quality averages all of them, and the result is shown 1:1.
     */
    const blit = () => {
      if (!view) return;
      view.imageSmoothingEnabled = true;
      view.imageSmoothingQuality = "high";
      view.clearRect(0, 0, canvas.width, canvas.height);
      view.drawImage(gl, 0, 0, canvas.width, canvas.height);
    };
    fit();

    let softened = false;
    const getContext = gl.getContext.bind(gl) as (type: string, options?: unknown) => any;
    (gl as any).getContext = (type: string, options?: unknown) => {
      const ctx = getContext(type, options);
      const shaderSource = ctx?.shaderSource?.bind(ctx);
      if (shaderSource)
        ctx.shaderSource = (shader: WebGLShader, src: string) => {
          if (src.includes(DOT_MASK)) softened = true;
          shaderSource(shader, src.replace(DOT_MASK, DOT_WIDER));
        };
      return ctx;
    };

    const globe = createGlobe(gl, {
      width: size,
      height: size,
      devicePixelRatio: oversample(),
      phi,
      theta,
      mapSamples: samples(size),
      markerElevation: ELEVATION,
      scale: SCALE,
      markers,
      ...palette(isNight()),
    });

    /** Marker sizes: a selected region is emphasised and the rest recede; the previewed region breathes. */
    const build = (pulse: number): Marker[] => {
      const max = Math.max(1, ...list.map((r) => r.count));
      return list.flatMap(({ region, count }) => {
        const location = COORDS[region];
        if (!location) return [];
        const base = 0.075 + 0.055 * (count / max);
        let size = selected === null ? base : region === selected ? base * 1.4 + 0.02 : base * 0.6;
        if (region === preview) size = Math.max(size, base) * (1.3 + 0.3 * pulse);
        return [{ location, size }];
      });
    };
    const pulsing = () => preview !== null && COORDS[preview] !== undefined && !reduce.matches;
    if (!softened) console.error("Globe: cobe's dot mask was not found in its shader; dots are unsoftened. Re-check DOT_MASK after a cobe upgrade.");

    /** Every cobe update draws a frame; copy it out right away. */
    const paint = (options: Parameters<typeof globe.update>[0]) => {
      globe.update(options);
      blit();
    };
    const draw = () => {
      if (pulsing()) {
        markers = build((Math.sin((performance.now() / PULSE_MS) * TAU) + 1) / 2);
        paint({ phi, theta, markers });
      } else paint({ phi, theta });
    };
    const running = () => visible && !document.hidden && !reduce.matches;

    const tick = () => {
      raf = 0;
      if (!running()) return;
      if (!dragging) {
        if (target !== null) {
          const d = ((((target - phi + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
          phi += d * 0.08;
        } else {
          phi += AUTO;
        }
        phi += vel;
        vel = Math.abs(vel) < 1e-4 ? 0 : vel * 0.95;
        // tilt: coast on the throw, then settle back to the resting angle (faster once a region is in focus)
        theta = Math.max(-TILT, Math.min(TILT, theta + tvel));
        tvel = Math.abs(tvel) < 1e-4 ? 0 : tvel * 0.95;
        theta += (THETA - theta) * (target !== null ? 0.06 : 0.015);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && running()) raf = requestAnimationFrame(tick);
    };

    /**
     * Region whose front-facing marker is within HIT_RADIUS of the pointer. Same projection cobe uses for a marker
     * (lat/lng -> unit sphere at radius 0.8 + elevation -> rotate by phi and the current theta -> orthographic), in canvas CSS px.
     */
    const hit = (clientX: number, clientY: number): Region | null => {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return null;
      const k = size / box.width; // box is in screen px (may be zoomed); canvas math is in layout px
      const px = (clientX - box.left) * k;
      const py = (clientY - box.top) * k;
      const [cp, sp, ct, st] = [Math.cos(phi), Math.sin(phi), Math.cos(theta), Math.sin(theta)];
      let best: Region | null = null;
      let bestD = HIT_RADIUS * HIT_RADIUS;
      for (const { region } of list) {
        const at = COORDS[region];
        if (!at) continue;
        const lat = (at[0] * Math.PI) / 180;
        const lng = (at[1] * Math.PI) / 180 - Math.PI;
        const r = SPHERE + ELEVATION;
        const p0 = -Math.cos(lat) * Math.cos(lng) * r;
        const p1 = Math.sin(lat) * r;
        const p2 = Math.cos(lat) * Math.sin(lng) * r;
        const nx = cp * p0 + sp * p2;
        const ny = sp * st * p0 + ct * p1 - cp * st * p2;
        const z = -sp * ct * p0 + st * p1 + cp * ct * p2;
        if (z < 0 && nx * nx + ny * ny < SPHERE * SPHERE) continue; // behind the globe (cobe still draws markers that stick out past the rim)
        const x = ((nx * SCALE + 1) / 2) * size;
        const y = ((1 - ny * SCALE) / 2) * size;
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = region;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = downX = e.clientX;
      lastY = downY = e.clientY;
      travelled = 0;
      vel = tvel = 0;
      target = null;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        canvas.style.cursor = hit(e.clientX, e.clientY) ? "pointer" : "";
        return;
      }
      travelled = Math.max(travelled, Math.hypot(e.clientX - downX, e.clientY - downY));
      const d = (e.clientX - lastX) / (size * 0.4);
      lastX = e.clientX;
      phi += d;
      vel = d;
      const dt = (e.clientY - lastY) / (size * 0.4);
      lastY = e.clientY;
      theta = Math.max(-TILT, Math.min(TILT, theta + dt));
      tvel = dt;
      draw();
    };
    const onUp = (e: PointerEvent) => {
      const wasDragging = dragging;
      dragging = false;
      if (reduce.matches) vel = tvel = 0; // no momentum for reduced motion; drag itself stays user-driven
      if (wasDragging && e.type === "pointerup" && travelled <= CLICK_SLOP) {
        vel = tvel = 0;
        const region = hit(e.clientX, e.clientY);
        if (region) pick.current?.(region);
        else if (selected !== null) clear.current?.();
      }
      kick();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const restyle = () => {
      paint(palette(isNight()));
      draw();
    };
    // The palette follows the system and the in-page toggle (<html data-theme>).
    scheme.addEventListener("change", restyle);
    const themeWatch = new MutationObserver(restyle);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    reduce.addEventListener("change", kick);
    document.addEventListener("visibilitychange", kick);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    io.observe(el);

    const resize = () => {
      const next = Math.round(el.clientWidth);
      fit();
      if (next && next !== size) {
        size = next;
        globe.update({ width: next, height: next, mapSamples: samples(next) });
      }
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener("resize", resize); // browser zoom changes the device pixel ratio without resizing the box

    ctl.current = {
      sync(next, filter, over) {
        list = next;
        selected = filter;
        preview = over;
        markers = build(0.5);
        paint({ markers });
        const focus = over ?? filter;
        const place = focus ? COORDS[focus] : undefined;
        target = place ? facing(place[1]) : null;
        if (target !== null && reduce.matches) phi = target;
        draw();
        el.setAttribute("data-ready", ""); // first frame (palette, markers) is on the canvas: fade the globe in
        kick();
      },
    };
    kick();

    return () => {
      ctl.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      themeWatch.disconnect();
      scheme.removeEventListener("change", restyle);
      reduce.removeEventListener("change", kick);
      document.removeEventListener("visibilitychange", kick);
      globe.destroy();
      el.removeAttribute("data-ready");
      el.replaceChildren();
    };
  }, []);

  useEffect(() => {
    ctl.current?.sync(regions, active, hover);
  }, [regions, active, hover]);

  return <div ref={host} className={styles.globe} aria-hidden="true" />;
}
