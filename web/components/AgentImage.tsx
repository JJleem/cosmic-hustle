"use client";

import { useState, useEffect, useRef } from "react";
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
    case "active": return `${base}working.png`;
    case "done":   return `${base}done.png`;
    case "idle":   return showIdle ? `${base}idle.png` : defaultSrc;
    default:       return defaultSrc;
  }
}

export default function AgentImage({ defaultSrc, size, status, expression = null }: Props) {
  const [showIdle, setShowIdle] = useState(false);

  const initial = getImageSrc(defaultSrc, status, expression, false);
  const [bottom, setBottom] = useState(initial); // 항상 보이는 레이어
  const [top, setTop]       = useState(initial); // 페이드인 레이어
  const [topVisible, setTopVisible] = useState(false);

  const currentRef  = useRef(initial);
  const busyRef     = useRef(false);
  const pendingRef  = useRef<string | null>(null);
  const doTransition = useRef((_: string) => {});

  // 매 렌더에서 갱신 — stale closure 없이 최신 상태 참조
  doTransition.current = (next: string) => {
    if (next === currentRef.current) return;
    if (busyRef.current) { pendingRef.current = next; return; }

    busyRef.current = true;
    currentRef.current = next;

    // 동일한 URL로 프리로드 → 브라우저 캐시에 올린 뒤 crossfade
    const img = new window.Image();
    img.onload = img.onerror = () => {
      setTop(next);
      setTopVisible(true);
      setTimeout(() => {
        setBottom(next);
        setTopVisible(false);
        busyRef.current = false;
        const p = pendingRef.current;
        pendingRef.current = null;
        if (p) doTransition.current(p);
      }, 350);
    };
    img.src = next;
  };

  // idle 깜빡임 타이머
  useEffect(() => {
    if (status !== "idle" || expression) { setShowIdle(false); return; }
    const delay    = Math.random() * 3000;
    const interval = 2500 + Math.random() * 2000;
    let cycle: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      setShowIdle(true);
      cycle = setInterval(() => setShowIdle((p) => !p), interval);
    }, delay);
    return () => { clearTimeout(t); clearInterval(cycle); };
  }, [status, expression]);

  useEffect(() => {
    doTransition.current(getImageSrc(defaultSrc, status, expression, showIdle));
  }, [defaultSrc, status, expression, showIdle]);

  const bg = (src: string): React.CSSProperties => ({
    backgroundImage: `url(${src})`,
    backgroundSize: "cover",
    backgroundPosition: "center top",
    backgroundRepeat: "no-repeat",
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 아래 레이어: 항상 표시 */}
      <div className="absolute inset-0" style={bg(bottom)} />
      {/* 위 레이어: 프리로드 완료 후 fade in */}
      <div
        className="absolute inset-0"
        style={{
          ...bg(top),
          opacity: topVisible ? 1 : 0,
          transition: "opacity 350ms ease",
        }}
      />
    </div>
  );
}
