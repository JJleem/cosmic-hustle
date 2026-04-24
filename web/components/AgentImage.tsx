"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { AgentStatus } from "@/lib/agents";

type Props = {
  defaultSrc: string; // /characters/pocke/default.png
  size: number;
  status: AgentStatus;
  expression?: string | null; // 특수 상황 override (err, sad 등)
};

function getImageSrc(defaultSrc: string, status: AgentStatus, expression: string | null, showIdle: boolean): string {
  const base = defaultSrc.replace("default.png", "");

  if (expression) return `${base}${expression}.png`;

  switch (status) {
    case "active":  return `${base}working.png`;
    case "done":    return `${base}done.png`;
    case "idle":    return showIdle ? `${base}idle.png` : defaultSrc;
    default:        return defaultSrc; // waiting
  }
}

export default function AgentImage({ defaultSrc, size, status, expression = null }: Props) {
  const [showIdle, setShowIdle] = useState(false);
  const [prev, setPrev] = useState(() => getImageSrc(defaultSrc, status, expression, false));
  const [curr, setCurr] = useState(() => getImageSrc(defaultSrc, status, expression, false));
  const [fading, setFading] = useState(false);

  // idle 사이클 타이머
  useEffect(() => {
    if (status !== "idle" || expression) {
      setShowIdle(false);
      return;
    }
    const initialDelay = Math.random() * 3000;
    const intervalMs = 2500 + Math.random() * 2000;
    let cycleInterval: ReturnType<typeof setInterval>;
    const startTimer = setTimeout(() => {
      setShowIdle(true);
      cycleInterval = setInterval(() => setShowIdle((p) => !p), intervalMs);
    }, initialDelay);
    return () => { clearTimeout(startTimer); clearInterval(cycleInterval); };
  }, [status, expression]);

  // 이미지 변경 시 크로스페이드
  useEffect(() => {
    const next = getImageSrc(defaultSrc, status, expression, showIdle);
    if (next === curr) return;
    setPrev(curr);
    setCurr(next);
    setFading(true);
    const t = setTimeout(() => setFading(false), 600);
    return () => clearTimeout(t);
  }, [status, expression, showIdle]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      {/* 이전 이미지 (fade out) */}
      <Image
        src={prev}
        alt=""
        fill
        className="object-cover transition-opacity duration-500"
        style={{ opacity: fading ? 0 : 1 }}
        sizes={`${size}px`}
      />
      {/* 현재 이미지 (fade in) */}
      <Image
        src={curr}
        alt=""
        fill
        className="object-cover transition-opacity duration-500 absolute inset-0"
        style={{ opacity: fading ? 1 : 0 }}
        sizes={`${size}px`}
      />
    </div>
  );
}
