"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number; y: number; r: number;
  alpha: number; twinkleSpeed: number; twinklePhase: number;
  driftX: number; driftY: number;
};

type ShootingStar = {
  x: number; y: number; len: number; speed: number;
  alpha: number; angle: number; life: number; maxLife: number;
};

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const mkStars = (): Star[] =>
      Array.from({ length: 240 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() ** 2 * 2.0 + 0.3,
        alpha: Math.random() * 0.7 + 0.25,
        twinkleSpeed: Math.random() * 0.014 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
        // 별 크기에 비례한 드리프트 — 큰 별(가까운)이 더 빠르게
        driftX: (Math.random() - 0.5) * 0.032,
        driftY: (Math.random() - 0.5) * 0.018,
      }));

    let stars = mkStars();
    const shootingStars: ShootingStar[] = [];
    let frame = 0;
    let animId: number;

    const spawnShootingStar = () => {
      const angle = (Math.random() * 30 + 10) * (Math.PI / 180);
      shootingStars.push({
        x: Math.random() * canvas.width * 0.8,
        y: Math.random() * canvas.height * 0.35,
        len: Math.random() * 130 + 80,
        speed: Math.random() * 4 + 5,
        alpha: Math.random() * 0.5 + 0.4,
        angle,
        life: 0,
        maxLife: Math.random() * 40 + 30,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const t = frame * 0.004; // 전체 시간 (느린 속도)

      // ── 성운 1: 우상단 violet — 천천히 부유
      const n1x = canvas.width  * (0.82 + Math.sin(t * 0.7) * 0.04);
      const n1y = canvas.height * (0.05 + Math.cos(t * 0.5) * 0.03);
      const g1 = ctx.createRadialGradient(n1x, n1y, 0, n1x, n1y, canvas.width * 0.58);
      g1.addColorStop(0,   "rgba(130,45,255,0.15)");
      g1.addColorStop(0.4, "rgba(90,30,200,0.08)");
      g1.addColorStop(1,   "transparent");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── 성운 2: 좌하단 indigo/blue — 다른 주기로 부유
      const n2x = canvas.width  * (0.05 + Math.cos(t * 0.6) * 0.05);
      const n2y = canvas.height * (0.88 + Math.sin(t * 0.8) * 0.03);
      const g2 = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, canvas.width * 0.52);
      g2.addColorStop(0,   "rgba(35,65,220,0.14)");
      g2.addColorStop(0.5, "rgba(20,45,160,0.06)");
      g2.addColorStop(1,   "transparent");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── 성운 3: 중앙 teal — 가장 느리게
      const n3x = canvas.width  * (0.50 + Math.sin(t * 0.4) * 0.06);
      const n3y = canvas.height * (0.92 + Math.cos(t * 0.3) * 0.04);
      const g3 = ctx.createRadialGradient(n3x, n3y, 0, n3x, n3y, canvas.width * 0.38);
      g3.addColorStop(0,   "rgba(20,110,155,0.09)");
      g3.addColorStop(1,   "transparent");
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── 별 드리프트 + 렌더
      stars.forEach((s) => {
        // 천천히 이동
        s.x += s.driftX;
        s.y += s.driftY;
        // 화면 밖으로 나가면 반대쪽에서 재진입
        if (s.x < -2) s.x = canvas.width + 2;
        if (s.x > canvas.width + 2) s.x = -2;
        if (s.y < -2) s.y = canvas.height + 2;
        if (s.y > canvas.height + 2) s.y = -2;

        const tw = Math.sin(frame * s.twinkleSpeed + s.twinklePhase);
        const a  = s.alpha * (0.4 + 0.6 * ((tw + 1) / 2));
        const blue = s.r > 1.2 ? 255 : 238;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210, 222, ${blue}, ${a})`;
        ctx.fill();

        if (s.r > 1.2) {
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
          glow.addColorStop(0, `rgba(180,200,255,${a * 0.28})`);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // ── 유성 렌더
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        const progress = ss.life / ss.maxLife;
        const headX = ss.x + Math.cos(ss.angle) * ss.speed * ss.life;
        const headY = ss.y + Math.sin(ss.angle) * ss.speed * ss.life;
        const tailX = headX - Math.cos(ss.angle) * ss.len * Math.min(progress * 3, 1);
        const tailY = headY - Math.sin(ss.angle) * ss.len * Math.min(progress * 3, 1);
        const fade  = progress < 0.7 ? 1 : (1 - progress) / 0.3;

        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(210,220,255,${ss.alpha * fade})`);
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ss.life++;
        if (ss.life >= ss.maxLife) shootingStars.splice(i, 1);
      }

      // 약 10초에 1번 유성
      if (frame % 600 === 0 && Math.random() < 0.75) spawnShootingStar();

      frame++;
      animId = requestAnimationFrame(draw);
    };

    const handleResize = () => { resize(); stars = mkStars(); };
    window.addEventListener("resize", handleResize);

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
