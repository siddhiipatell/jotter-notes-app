"use client";
import { useEffect, useRef } from "react";

const GLYPHS = ["·", "-", "/", "#", "[", "]", "*", ">", "~", "|", "=", "_"];
const CELL_W = 18;
const CELL_H = 24;
const TAU = Math.PI * 2;

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Decorative field of Markdown glyphs. Every cell fades continuously (no popping):
 * a travelling wave sets the base brightness, each glyph pulses on its own cycle and swaps
 * only at its darkest moment, a soft light sweep crosses the band, and the pointer lifts nearby glyphs.
 * Plays regardless of prefers-reduced-motion (requested).
 */
export function AsciiField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0, h = 0, raf = 0, visible = true, ink = "#262626", font = "13px monospace";
    const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999, on: false };
    const readStyle = () => {
      const cs = getComputedStyle(canvas);
      ink = cs.getPropertyValue("--color-ink").trim() || ink;
      font = `13px ${cs.getPropertyValue("--font-geist-mono").trim() || "monospace"}`;
    };
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      // ease the pointer so interaction glides instead of jumping
      pointer.sx += (pointer.x - pointer.sx) * 0.12;
      pointer.sy += (pointer.y - pointer.sy) * 0.12;
      ctx.clearRect(0, 0, w, h);
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.fillStyle = ink;
      const cols = Math.ceil(w / CELL_W) + 1, rows = Math.ceil(h / CELL_H);
      const sweepX = ((t * 0.09) % 1.4 - 0.2) * w; // light sweep, left to right, every ~15s
      for (let y = 0; y < rows; y++) {
        const depth = 0.55 + 0.45 * (y / Math.max(rows - 1, 1));
        const rowShift = Math.sin(y * 0.6 + t * 0.35) * 4; // rows breathe sideways
        for (let x = 0; x < cols; x++) {
          const wave = (Math.sin(x * 0.07 + t * 0.55) + Math.sin(y * 0.42 - t * 0.42) + Math.sin((x * 0.5 + y * 1.3) * 0.09 + t * 0.28) + 3) / 6;
          let a = (0.2 + 0.8 * smooth(0.2, 0.8, wave)) * depth; // floor keeps every cell visible: no gaps
          const speed = 0.25 + hash(x, y, 1) * 0.55;
          const cycle = t * speed + hash(x, y, 2) * 40;
          const pulse = 0.5 - 0.5 * Math.cos(cycle * TAU * 0.5);
          a *= 0.55 + 0.45 * pulse;
          const gi = (Math.floor(cycle * 0.5) + Math.floor(hash(x, y, 3) * GLYPHS.length)) % GLYPHS.length;
          let px = x * CELL_W + rowShift, py = y * CELL_H + CELL_H / 2;
          const sd = Math.abs(px - sweepX) / 140;
          if (sd < 1) a += (1 - sd) * (1 - sd) * 0.6 * depth;
          if (pointer.on) {
            const dx = px - pointer.sx, dy = py - pointer.sy, d = Math.hypot(dx, dy) / 150;
            if (d < 1) { const k = (1 - d) * (1 - d); a += k * 0.9; py -= k * 7; px += dx * k * 0.08; }
          }
          ctx.globalAlpha = Math.min(0.05 + a * 0.8, 1);
          ctx.fillText(GLYPHS[gi], px, py);
        }
      }
      ctx.globalAlpha = 1;
    };
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (visible) draw((now - start) / 1000);
    };
    readStyle(); size();
    const ro = new ResizeObserver(() => { size(); readStyle(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
      if (!pointer.on) { pointer.sx = pointer.x; pointer.sy = pointer.y; }
      pointer.on = pointer.y > -80 && pointer.y < r.height + 80;
    };
    const leave = () => { pointer.on = false; };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    const onTheme = () => readStyle();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onTheme);
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave);
      mq.removeEventListener("change", onTheme); mo.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="ascii-field" aria-hidden="true" />;
}
