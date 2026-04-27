"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { AgentStatus } from "@/lib/agents";

type Props = {
  defaultSrc: string;
  size: number;
  status: AgentStatus;
  expression?: string | null;
};

function getImageSrc(defaultSrc: string, status: AgentStatus, expression: string | null, showIdle: boolean): string {
  const base = defaultSrc.replace("default.png", "");
  if (expression) return `${base}${expression}.png`;
  switch (status) {
    case "active":  return `${base}working.png`;
    case "done":    return `${base}done.png`;
    case "idle":    return showIdle ? `${base}idle.png` : defaultSrc;
    default:        return defaultSrc;
  }
}

export default function AgentImage({ defaultSrc, size, status, expression = null }: Props) {
  const [showIdle, setShowIdle] = useState(false);
  const [failedSrcs, setFailedSrcs] = useState<Set<string>>(new Set());

  const resolvedSrc = (src: string) => failedSrcs.has(src) ? defaultSrc : src;
  const handleError = (src: string) => setFailedSrcs((prev) => new Set([...prev, src]));

  // 실제로 화면에 보이는 src
  const [visibleSrc, setVisibleSrc] = useState(() => getImageSrc(defaultSrc, status, expression, false));
  // 크로스페이드 중 아래 깔리는 이전 src
  const [underSrc, setUnderSrc] = useState(() => getImageSrc(defaultSrc, status, expression, false));
  const [fading, setFading] = useState(false);

  // idle 깜빡임 타이머
  useEffect(() => {
    if (status !== "idle" || expression) {
      setShowIdle(false);
      return;
    }
    const initialDelay = Math.random() * 3000;
    const intervalMs = 2500 + Math.random() * 2000;
    let cycle: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      setShowIdle(true);
      cycle = setInterval(() => setShowIdle((p) => !p), intervalMs);
    }, initialDelay);
    return () => { clearTimeout(t); clearInterval(cycle); };
  }, [status, expression]);

  // 이미지 변경 → 크로스페이드
  useEffect(() => {
    const next = getImageSrc(defaultSrc, status, expression, showIdle);
    if (next === visibleSrc) return;

    // 현재 보이는 이미지를 아래 레이어로, 새 이미지를 위 레이어로
    setUnderSrc(visibleSrc);
    setVisibleSrc(next);
    setFading(true);

    // 페이드 완료 후: 언더레이어도 새 이미지로 동기화 (fading=false 시 underSrc가 보임)
    const t = setTimeout(() => {
      setFading(false);
      setUnderSrc(next);
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSrc, status, expression, showIdle]);

  return (
    <div className="relative w-full h-full">
      {/* 아래 레이어: 이전 이미지 — 페이드 아웃 */}
      <Image
        src={resolvedSrc(underSrc)}
        alt=""
        fill
        className="object-cover transition-opacity duration-500"
        style={{ opacity: fading ? 0 : 1 }}
        sizes={`${size}px`}
        onError={() => handleError(underSrc)}
      />
      {/* 위 레이어: 새 이미지 — 페이드 인 */}
      <Image
        src={resolvedSrc(visibleSrc)}
        alt=""
        fill
        className="object-cover transition-opacity duration-500 absolute inset-0"
        style={{ opacity: fading ? 1 : 0 }}
        sizes={`${size}px`}
        onError={() => handleError(visibleSrc)}
      />
    </div>
  );
}
