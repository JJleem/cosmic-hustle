"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number; y: number; r: number;
  alpha: number; twinkleSpeed: number; twinklePhase: number;
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
    window.addEventListener("resize", resize);

    // 별 생성
    const mkStars = (): Star[] =>
      Array.from({ length: 220 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() ** 2 * 1.8 + 0.2,
        alpha: Math.random() * 0.65 + 0.15,
        twinkleSpeed: Math.random() * 0.012 + 0.004,
        twinklePhase: Math.random() * Math.PI * 2,
      }));

    let stars = mkStars();
    const shootingStars: ShootingStar[] = [];
    let frame = 0;
    let animId: number;

    const spawnShootingStar = () => {
      const angle = (Math.random() * 30 + 10) * (Math.PI / 180);
      shootingStars.push({
        x: Math.random() * canvas.width * 0.8,
        y: Math.random() * canvas.height * 0.4,
        len: Math.random() * 120 + 80,
        speed: Math.random() * 4 + 5,
        alpha: Math.random() * 0.5 + 0.4,
        angle,
        life: 0,
        maxLife: Math.random() * 40 + 30,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 성운 1 — 우상단 violet
      const g1 = ctx.createRadialGradient(canvas.width * 0.82, canvas.height * 0.05, 0, canvas.width * 0.82, canvas.height * 0.05, canvas.width * 0.55);
      g1.addColorStop(0, "rgba(120,40,240,0.13)");
      g1.addColorStop(0.5, "rgba(80,30,180,0.06)");
      g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 성운 2 — 좌하단 indigo/blue
      const g2 = ctx.createRadialGradient(canvas.width * 0.05, canvas.height * 0.88, 0, canvas.width * 0.05, canvas.height * 0.88, canvas.width * 0.5);
      g2.addColorStop(0, "rgba(30,60,200,0.12)");
      g2.addColorStop(0.5, "rgba(20,40,150,0.05)");
      g2.addColorStop(1, "transparent");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 성운 3 — 중앙 하단 teal 미세
      const g3 = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.95, 0, canvas.width * 0.5, canvas.height * 0.95, canvas.width * 0.35);
      g3.addColorStop(0, "rgba(20,100,140,0.07)");
      g3.addColorStop(1, "transparent");
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 별 렌더
      stars.forEach((s) => {
        const t = Math.sin(frame * s.twinkleSpeed + s.twinklePhase);
        const a = s.alpha * (0.45 + 0.55 * ((t + 1) / 2));
        // 큰 별은 약간 푸른빛
        const blue = s.r > 1.2 ? 255 : 240;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210, 220, ${blue}, ${a})`;
        ctx.fill();
        // 큰 별 글로우
        if (s.r > 1.2) {
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          glow.addColorStop(0, `rgba(180,200,255,${a * 0.3})`);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 유성 렌더
      shootingStars.forEach((ss, i) => {
        const progress = ss.life / ss.maxLife;
        const headX = ss.x + Math.cos(ss.angle) * ss.speed * ss.life;
        const headY = ss.y + Math.sin(ss.angle) * ss.speed * ss.life;
        const tailX = headX - Math.cos(ss.angle) * ss.len * Math.min(progress * 3, 1);
        const tailY = headY - Math.sin(ss.angle) * ss.len * Math.min(progress * 3, 1);
        const fade = progress < 0.7 ? 1 : (1 - progress) / 0.3;

        const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, `rgba(200,210,255,${ss.alpha * fade})`);
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        ss.life++;
        if (ss.life >= ss.maxLife) shootingStars.splice(i, 1);
      });

      // 유성 랜덤 생성 (약 12초에 1번)
      if (frame % 720 === 0 && Math.random() < 0.7) spawnShootingStar();

      frame++;
      animId = requestAnimationFrame(draw);
    };

    // 리사이즈 시 별 재생성
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
