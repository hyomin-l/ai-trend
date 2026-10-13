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

const THETA = 0.3;
/** Keeps the dot spacing constant (about 5px) whatever the globe size. */
const samples = (size: number) => Math.max(1800, Math.round(size * size * 0.13));
const AUTO = 0.002; // radians per frame while idle, about one turn a minute
const TAU = Math.PI * 2;

/** phi that puts the given longitude in front of the camera (derived from cobe's lat/lng mapping). */
const facing = (lng: number) => -Math.PI / 2 - (lng * Math.PI) / 180;

/** Ink dots on paper in the day edition, paper dots on ink in the night edition; markers are the magenta. */
const palette = (night: boolean) =>
  night
    ? { dark: 1, baseColor: [0.93, 0.92, 0.91] as [number, number, number], glowColor: [0.02, 0.02, 0.02] as [number, number, number], markerColor: [0.94, 0.28, 0.62] as [number, number, number], mapBrightness: 5, diffuse: 1.2 }
    : { dark: 0, baseColor: [0.86, 0.86, 0.85] as [number, number, number], glowColor: [0.97, 0.97, 0.96] as [number, number, number], markerColor: [0.76, 0.09, 0.44] as [number, number, number], mapBrightness: 2.4, diffuse: 1.6 };

type Props = {
  regions: { region: Region; count: number }[];
  active: Region | null;
};

type Controller = { sync: (regions: Props["regions"], active: Region | null) => void };

/**
 * cobe v2 has no render loop of its own (no onRender): every `update()` draws one frame, so this component
 * owns a requestAnimationFrame loop. It pauses off-screen, in background tabs and under prefers-reduced-motion.
 */
export default function Globe({ regions, active }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);

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
    let target: number | null = null;
    let markers: Marker[] = [];
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let raf = 0;
    let visible = true;

    const globe = createGlobe(canvas, {
      width: size,
      height: size,
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      phi,
      theta: THETA,
      mapSamples: samples(size),
      markerElevation: 0.02,
      markers,
      ...palette(scheme.matches),
    });

    const draw = () => globe.update({ phi, theta: THETA });
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
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf && running()) raf = requestAnimationFrame(tick);
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      vel = 0;
      target = null;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const d = (e.clientX - lastX) / (size * 0.4);
      lastX = e.clientX;
      phi += d;
      vel = d;
      draw();
    };
    const onUp = () => {
      dragging = false;
      if (reduce.matches) vel = 0; // no momentum for reduced motion; drag itself stays user-driven
      kick();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const onScheme = (e: MediaQueryListEvent) => {
      globe.update(palette(e.matches));
      draw();
    };
    scheme.addEventListener("change", onScheme);
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
      sync(list, selected) {
        const max = Math.max(1, ...list.map((r) => r.count));
        markers = list.flatMap(({ region, count }) => {
          const location = COORDS[region];
          if (!location) return [];
          const base = 0.035 + 0.05 * (count / max);
          const s = selected === null ? base : region === selected ? base * 1.5 + 0.02 : base * 0.55;
          return [{ location, size: s }];
        });
        globe.update({ markers });
        const place = selected ? COORDS[selected] : undefined;
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
      scheme.removeEventListener("change", onScheme);
      reduce.removeEventListener("change", kick);
      document.removeEventListener("visibilitychange", kick);
      globe.destroy();
      el.replaceChildren();
    };
  }, []);

  useEffect(() => {
    ctl.current?.sync(regions, active);
  }, [regions, active]);

  return <div ref={host} className={styles.globe} aria-hidden="true" />;
}
