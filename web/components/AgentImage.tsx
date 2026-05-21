"use client";

import { useState, useEffect } from "react";
import { AgentStatus } from "@/lib/agents";

type Props = {
  defaultSrc: string;
  size: number;
  status: AgentStatus;
  expression?: string | null;
};

const TALK_FRAMES = ["talk_0", "talk_1", "talk_2", "talk_1", "talk_0"] as const;
const ALL_FRAMES = ["talk_0", "talk_1", "talk_2", "blink_half", "blink", "done", "err", "sad", "happy"] as const;

const BASE_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center top",
};

export default function AgentImage({ defaultSrc, status, expression = null }: Props) {
  const [activeFrame, setActiveFrame] = useState<string>("default");

  const base = defaultSrc.replace("default.png", "");

  useEffect(() => {
    if (status !== "active") { setActiveFrame("default"); return; }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    function next() {
      setActiveFrame(TALK_FRAMES[i]);
      i = (i + 1) % TALK_FRAMES.length;
      timer = setTimeout(next, i === 0 ? 250 : 110);
    }
    next();
    return () => { clearTimeout(timer); setActiveFrame("default"); };
  }, [status]);

  useEffect(() => {
    if (status !== "idle" || expression) { setActiveFrame("default"); return; }
    let t: ReturnType<typeof setTimeout>;
    function scheduleBlink() {
      t = setTimeout(() => {
        setActiveFrame("blink_half");
        setTimeout(() => setActiveFrame("blink"), 80);
        setTimeout(() => setActiveFrame("blink_half"), 160);
        setTimeout(() => { setActiveFrame("default"); scheduleBlink(); }, 240);
      }, 2000 + Math.random() * 3000);
    }
    scheduleBlink();
    return () => clearTimeout(t);
  }, [status, expression]);

  const frame = expression ?? (status === "done" ? "done" : activeFrame);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 베이스: 항상 표시 — 어떤 상황에서도 검정 화면 방지 */}
      <img src={defaultSrc} alt="" style={BASE_STYLE} />
      {/* 오버레이: 활성 프레임만 위에 덮음, transition 없음 */}
      {ALL_FRAMES.map((f) => (
        <img
          key={f}
          src={`${base}${f}.png`}
          alt=""
          style={{ ...BASE_STYLE, opacity: frame === f ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
