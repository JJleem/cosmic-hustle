"use client";

import { useState, useEffect, useRef } from "react";
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

  const initial = getImageSrc(defaultSrc, status, expression, false);
  const [srcA, setSrcA] = useState(initial); // 아래 레이어 (현재 보이는 이미지)
  const [srcB, setSrcB] = useState(initial); // 위 레이어 (다음 이미지)
  const [crossfading, setCrossfading] = useState(false);

  const inTransition = useRef(false);
  const pendingSrc = useRef<string | null>(null);
  const currentTarget = useRef(initial);

  // 최신 상태를 캡처하는 ref — stale closure 방지
  const doTransition = useRef((_next: string) => {});
  doTransition.current = (next: string) => {
    if (next === currentTarget.current) return;
    if (inTransition.current) {
      pendingSrc.current = next;
      return;
    }

    inTransition.current = true;
    currentTarget.current = next;

    // B 레이어에 미리 src 세팅 (opacity=0이라 보이지 않음)
    setSrcB(next);

    // 브라우저 캐시에 올린 후 crossfade 시작 → 깜빡임 없음
    const img = new window.Image();
    const proceed = () => {
      setCrossfading(true);
      setTimeout(() => {
        setSrcA(next);
        setCrossfading(false);
        inTransition.current = false;
        const p = pendingSrc.current;
        pendingSrc.current = null;
        if (p && p !== next) doTransition.current(p);
      }, 400);
    };
    img.onload = proceed;
    img.onerror = proceed; // 실패해도 전환은 진행
    img.src = next;
  };

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

  // 이미지 변경 감지 → 프리로드 후 크로스페이드
  useEffect(() => {
    doTransition.current(getImageSrc(defaultSrc, status, expression, showIdle));
  }, [defaultSrc, status, expression, showIdle]);

  return (
    <div className="relative w-full h-full">
      {/* 아래 레이어: 현재 이미지 — crossfade 시 fade out */}
      <Image
        src={resolvedSrc(srcA)}
        alt=""
        fill
        className="object-cover"
        style={{ opacity: crossfading ? 0 : 1, transition: "opacity 400ms ease" }}
        sizes={`${size}px`}
        onError={() => setFailedSrcs((prev) => new Set([...prev, srcA]))}
      />
      {/* 위 레이어: 다음 이미지 — crossfade 시 fade in (미리 로드돼 있음) */}
      <Image
        src={resolvedSrc(srcB)}
        alt=""
        fill
        className="object-cover absolute inset-0"
        style={{ opacity: crossfading ? 1 : 0, transition: "opacity 400ms ease" }}
        sizes={`${size}px`}
        onError={() => setFailedSrcs((prev) => new Set([...prev, srcB]))}
      />
    </div>
  );
}
