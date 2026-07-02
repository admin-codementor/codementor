/**
 * Tiny dependency-free confetti burst — a short celebratory moment on success
 * (Peak-End Rule). Draws to a transient full-screen canvas and cleans itself up.
 * No-ops when the user prefers reduced motion, or on the server.
 */
export function fireConfetti(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2000";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const colors = ["#6E4EE7", "#4654B0", "#3B6939", "#7D5700", "#76536D", "#BA1A1A"];
  const count = 140;
  const particles = Array.from({ length: count }, () => {
    const angle = Math.PI + Math.random() * Math.PI; // upward-ish spread
    const speed = 6 + Math.random() * 8;
    return {
      x: canvas.width / 2,
      y: canvas.height * 0.35,
      vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    };
  });

  const gravity = 0.28;
  const drag = 0.99;
  let raf = 0;
  const start = performance.now();

  const tick = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += gravity;
      p.vx *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - elapsed / 2400);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (elapsed < 2400) {
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  };
  raf = requestAnimationFrame(tick);
}
