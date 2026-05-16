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
    case "active": return defaultSrc; // talk 프레임이 위를 덮으므로 base는 default 유지
    case "done":   return `${base}done.png`;
    default:       return defaultSrc;
  }
}

export default function AgentImage({ defaultSrc, size, status, expression = null }: Props) {
  const [blinkFrame, setBlinkFrame] = useState<string | null>(null);
  const [talkFrame, setTalkFrame]   = useState<string | null>(null);

  // 마운트 시 모든 프레임 preload → 애니메이션 중 깜빡임 방지
  useEffect(() => {
    const base = defaultSrc.replace("default.png", "");
    ["talk_0", "talk_1", "talk_2", "blink_half", "blink", "done", "err"].forEach(f => {
      const img = new window.Image();
      img.src = `${base}${f}.png`;
    });
  }, [defaultSrc]);

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

  // 말하기 애니메이션: active 상태에서 talk_0→1→2→1→0 싸이클
  useEffect(() => {
    if (status !== "active") { setTalkFrame(null); return; }

    const FRAMES = ["talk_0", "talk_1", "talk_2", "talk_1", "talk_0"];
    let frameIdx = 0;
    let timer: ReturnType<typeof setTimeout>;

    function nextFrame() {
      setTalkFrame(FRAMES[frameIdx]);
      frameIdx = (frameIdx + 1) % FRAMES.length;
      // 마지막 프레임(입 닫힘) 후엔 200~500ms 쉬었다가 다음 사이클
      const delay = frameIdx === 0 ? 200 + Math.random() * 300 : 110;
      timer = setTimeout(nextFrame, delay);
    }

    nextFrame(); // 즉시 시작 — working.png 노출 방지
    return () => { clearTimeout(timer); setTalkFrame(null); };
  }, [status]);

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
      {talkFrame ? (
        /* talk 중에는 talk 프레임만 — 다른 레이어 전부 숨김 */
        <div className="absolute inset-0" style={bg(`${base}${talkFrame}.png`)} />
      ) : (
        <>
          <div className="absolute inset-0" style={bg(bottom)} />
          <div
            className="absolute inset-0"
            style={{ ...bg(top), opacity: topVisible ? 1 : 0, transition: "opacity 350ms ease" }}
          />
          {blinkFrame && (
            <div className="absolute inset-0" style={bg(`${base}${blinkFrame}.png`)} />
          )}
        </>
      )}
    </div>
  );
}
