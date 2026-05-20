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
const BLINK_FRAMES = ["blink_half", "blink", "blink_half"] as const;
const ALL_FRAMES = ["talk_0", "talk_1", "talk_2", "blink_half", "blink", "done", "err"] as const;

export default function AgentImage({ defaultSrc, status, expression = null }: Props) {
  const [talkFrame, setTalkFrame] = useState<string | null>(null);
  const [blinkFrame, setBlinkFrame] = useState<string | null>(null);

  const base = defaultSrc.replace("default.png", "");

  // talk 애니메이션: active 상태에서만
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status !== "active") { setTalkFrame(null); return; }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    function next() {
      setTalkFrame(TALK_FRAMES[i]);
      i = (i + 1) % TALK_FRAMES.length;
      timer = setTimeout(next, i === 0 ? 250 : 110);
    }
    next();
    return () => { clearTimeout(timer); setTalkFrame(null); };
  }, [status]);

  // 눈 깜빡임: idle 상태에서만
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status !== "idle" || expression) { setBlinkFrame(null); setTalkFrame(null); return; }
    let t: ReturnType<typeof setTimeout>;
    function scheduleBlink() {
      t = setTimeout(() => {
        setBlinkFrame(BLINK_FRAMES[0]);
        setTimeout(() => setBlinkFrame(BLINK_FRAMES[1]), 80);
        setTimeout(() => setBlinkFrame(BLINK_FRAMES[2]), 160);
        setTimeout(() => { setBlinkFrame(null); scheduleBlink(); }, 240);
      }, 2000 + Math.random() * 3000);
    }
    scheduleBlink();
    return () => clearTimeout(t);
  }, [status, expression]);

  // 현재 활성 프레임 키 계산
  let activeFrame: string;
  if (talkFrame) activeFrame = talkFrame;
  else if (blinkFrame) activeFrame = blinkFrame;
  else if (expression) activeFrame = expression;
  else if (status === "done") activeFrame = "done";
  else activeFrame = "default";

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center top",
    transition: "opacity 40ms",
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <img
        src={defaultSrc}
        alt=""
        style={{ ...imgStyle, opacity: activeFrame === "default" ? 1 : 0 }}
      />
      {ALL_FRAMES.map((f) => (
        <img
          key={f}
          src={`${base}${f}.png`}
          alt=""
          style={{ ...imgStyle, opacity: activeFrame === f ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
