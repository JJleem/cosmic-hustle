"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

type Props = {
  defaultSrc: string;   // /characters/pocke/default.png
  size: number;
  cycle: boolean;       // idle 상태일 때만 true
};

export default function AgentImage({ defaultSrc, size, cycle }: Props) {
  const idleSrc = defaultSrc.replace("default.png", "idle.png");
  const [showIdle, setShowIdle] = useState(false);

  useEffect(() => {
    if (!cycle) {
      setShowIdle(false);
      return;
    }

    // 에이전트마다 엇갈리게 시작하도록 랜덤 초기 딜레이
    const initialDelay = Math.random() * 3000;
    const intervalMs = 2500 + Math.random() * 2000; // 2.5~4.5초 사이 랜덤

    let cycleInterval: ReturnType<typeof setInterval>;

    const startTimer = setTimeout(() => {
      setShowIdle(true);
      cycleInterval = setInterval(() => {
        setShowIdle((prev) => !prev);
      }, intervalMs);
    }, initialDelay);

    return () => {
      clearTimeout(startTimer);
      clearInterval(cycleInterval);
    };
  }, [cycle]);

  return (
    <div className="relative w-full h-full">
      {/* default */}
      <Image
        src={defaultSrc}
        alt=""
        fill
        className="object-cover transition-opacity duration-700"
        style={{ opacity: showIdle ? 0 : 1 }}
        sizes={`${size}px`}
      />
      {/* idle */}
      <Image
        src={idleSrc}
        alt=""
        fill
        className="object-cover transition-opacity duration-700 absolute inset-0"
        style={{ opacity: showIdle ? 1 : 0 }}
        sizes={`${size}px`}
      />
    </div>
  );
}
