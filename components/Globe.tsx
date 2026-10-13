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

type RGB = [number, number, number];

/**
 * Dots on paper in the day edition (near-black land on an almost-paper sphere), light dots on ink in the night edition.
 * cobe shades land by `mapBrightness * dot coverage`; a high value saturates the dot core, which is what makes small dots crisp.
 */
const palette = (night: boolean) =>
  night
    ? { dark: 1, baseColor: [0.97, 0.96, 0.94] as RGB, glowColor: [0.03, 0.03, 0.03] as RGB, markerColor: [0.98, 0.36, 0.67] as RGB, mapBrightness: 14, mapBaseBrightness: 0.05, diffuse: 1.1 }
    : { dark: 0, baseColor: [1.14, 1.14, 1.12] as RGB, glowColor: [0.97, 0.97, 0.96] as RGB, markerColor: [0.76, 0.09, 0.44] as RGB, mapBrightness: 24, mapBaseBrightness: 0.03, diffuse: 1 };

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
};

type Controller = { sync: (regions: Props["regions"], active: Region | null, hover: Region | null) => void };

const PULSE_MS = 1100;

/**
 * cobe v2 has no render loop of its own (no onRender): every `update()` draws one frame, so this component
 * owns a requestAnimationFrame loop. It pauses off-screen, in background tabs and under prefers-reduced-motion.
 */
export default function Globe({ regions, active, hover, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");

    // cobe wraps the canvas in its own <div>; create the canvas here so cleanup leaves React's DOM untouched.
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    el.appendChild(canvas);

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

    const globe = createGlobe(canvas, {
      width: size,
      height: size,
      devicePixelRatio: 4, // supersampled: cobe dots are ~1 device px at 2x, so they flicker between 1 and 2 px as the globe turns; 4x renders them round and the browser smooths them down
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
    const draw = () => {
      if (pulsing()) {
        markers = build((Math.sin((performance.now() / PULSE_MS) * TAU) + 1) / 2);
        globe.update({ phi, theta, markers });
      } else globe.update({ phi, theta });
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
      }
      kick();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const restyle = () => {
      globe.update(palette(isNight()));
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

    const ro = new ResizeObserver(() => {
      const next = Math.round(el.clientWidth);
      if (next && next !== size) {
        size = next;
        globe.update({ width: next, height: next, mapSamples: samples(next) });
        draw();
      }
    });
    ro.observe(el);

    ctl.current = {
      sync(next, filter, over) {
        list = next;
        selected = filter;
        preview = over;
        markers = build(0.5);
        globe.update({ markers });
        const focus = over ?? filter;
        const place = focus ? COORDS[focus] : undefined;
        target = place ? facing(place[1]) : null;
        if (target !== null && reduce.matches) phi = target;
        draw();
        kick();
      },
    };
    kick();

    return () => {
      ctl.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      themeWatch.disconnect();
      scheme.removeEventListener("change", restyle);
      reduce.removeEventListener("change", kick);
      document.removeEventListener("visibilitychange", kick);
      globe.destroy();
      el.replaceChildren();
    };
  }, []);

  useEffect(() => {
    ctl.current?.sync(regions, active, hover);
  }, [regions, active, hover]);

  return <div ref={host} className={styles.globe} aria-hidden="true" />;
}
