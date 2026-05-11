"use client";

import { useState, useEffect, useRef } from "react";
import { AgentStatus } from "@/lib/agents";

type Props = {
  defaultSrc: string;
  size: number;
  status: AgentStatus;
  expression?: string | null;
};

function getImageSrc(defaultSrc: string, status: AgentStatus, expression: string | null): string {
  const base = defaultSrc.replace("default.png", "");
  if (expression) return `${base}${expression}.png`;
  switch (status) {
    case "active": return `${base}working.png`;
    case "done":   return `${base}done.png`;
    default:       return defaultSrc;
  }
}

export default function AgentImage({ defaultSrc, size, status, expression = null }: Props) {
  const [blinkFrame, setBlinkFrame] = useState<string | null>(null);

  const initial = getImageSrc(defaultSrc, status, expression);
  const [bottom, setBottom] = useState(initial);
  const [top, setTop]       = useState(initial);
  const [topVisible, setTopVisible] = useState(false);

  const currentRef   = useRef(initial);
  const busyRef      = useRef(false);
  const pendingRef   = useRef<string | null>(null);
  const doTransition = useRef((_: string) => {});

  doTransition.current = (next: string) => {
    if (next === currentRef.current) return;
    if (busyRef.current) { pendingRef.current = next; return; }

    busyRef.current = true;
    currentRef.current = next;

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

  // 눈 깜빡임: idle 상태에서만, 2~5초마다 한 번
  // default → blink_half(80ms) → blink(80ms) → blink_half(80ms) → default
  // 크로스페이드를 거치지 않는 별도 오버레이로 처리
  useEffect(() => {
    if (status !== "idle" || expression) { setBlinkFrame(null); return; }

    let nextBlink: ReturnType<typeof setTimeout>;

    function scheduleBlink() {
      nextBlink = setTimeout(() => {
        setBlinkFrame("blink_half");
        setTimeout(() => setBlinkFrame("blink"),      80);
        setTimeout(() => setBlinkFrame("blink_half"), 160);
        setTimeout(() => { setBlinkFrame(null); scheduleBlink(); }, 240);
      }, 2000 + Math.random() * 3000);
    }

    scheduleBlink();
    return () => clearTimeout(nextBlink);
  }, [status, expression]);

  useEffect(() => {
    doTransition.current(getImageSrc(defaultSrc, status, expression));
  }, [defaultSrc, status, expression]);

  const base = defaultSrc.replace("default.png", "");

  const bg = (src: string): React.CSSProperties => ({
    backgroundImage: `url(${src})`,
    backgroundSize: "cover",
    backgroundPosition: "center top",
    backgroundRepeat: "no-repeat",
  });

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 베이스 레이어 */}
      <div className="absolute inset-0" style={bg(bottom)} />
      {/* 상태 전환 크로스페이드 레이어 */}
      <div
        className="absolute inset-0"
        style={{ ...bg(top), opacity: topVisible ? 1 : 0, transition: "opacity 350ms ease" }}
      />
      {/* 눈 깜빡임 오버레이 — 크로스페이드 없이 즉시 교체 */}
      {blinkFrame && (
        <div className="absolute inset-0" style={bg(`${base}${blinkFrame}.png`)} />
      )}
    </div>
  );
}
