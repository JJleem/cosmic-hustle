"use client";

import { useState, useEffect } from "react";
import { AgentStatus } from "@/lib/agents";

type Props = {
  defaultSrc: string;
  size: number;
  status: AgentStatus;
  expression?: string | null;
};

export default function AgentImage({ defaultSrc, status, expression = null }: Props) {
  const [talkFrame, setTalkFrame] = useState<string | null>(null);
  const [blinkFrame, setBlinkFrame] = useState<string | null>(null);

  const base = defaultSrc.replace("default.png", "");

  // 모든 프레임 preload — 캐시 덕에 src 전환이 즉시 반영됨
  useEffect(() => {
    ["talk_0", "talk_1", "talk_2", "blink_half", "blink", "done", "err"].forEach((f) => {
      const img = new window.Image();
      img.src = `${base}${f}.png`;
    });
  }, [base]);

  // talk 애니메이션: active 상태에서만
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status !== "active") { setTalkFrame(null); return; }
    const FRAMES = ["talk_0", "talk_1", "talk_2", "talk_1", "talk_0"];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    function next() {
      setTalkFrame(FRAMES[i]);
      i = (i + 1) % FRAMES.length;
      timer = setTimeout(next, i === 0 ? 250 : 110);
    }
    next();
    return () => { clearTimeout(timer); setTalkFrame(null); };
  }, [status]);

  // 눈 깜빡임: idle 상태에서만
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status !== "idle" || expression) { setBlinkFrame(null); return; }
    let t: ReturnType<typeof setTimeout>;
    function scheduleBlink() {
      t = setTimeout(() => {
        setBlinkFrame("blink_half");
        setTimeout(() => setBlinkFrame("blink"), 80);
        setTimeout(() => setBlinkFrame("blink_half"), 160);
        setTimeout(() => { setBlinkFrame(null); scheduleBlink(); }, 240);
      }, 2000 + Math.random() * 3000);
    }
    scheduleBlink();
    return () => clearTimeout(t);
  }, [status, expression]);

  let src: string;
  if (talkFrame) {
    src = `${base}${talkFrame}.png`;
  } else if (blinkFrame) {
    src = `${base}${blinkFrame}.png`;
  } else if (expression) {
    src = `${base}${expression}.png`;
  } else if (status === "done") {
    src = `${base}done.png`;
  } else {
    src = defaultSrc;
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
      />
    </div>
  );
}
