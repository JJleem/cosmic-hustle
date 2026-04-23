"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { AGENT_MAP } from "@/lib/agents";

export type ChatMessage = {
  id: string;
  agentId: string;
  text: string;
  type: "idle" | "work" | "done";
};

type Props = { messages: ChatMessage[] };

export default function ChatFeed({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto h-full pr-1 scrollbar-hide">
      {messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-600 text-xs tracking-widest">대기 중...</p>
        </div>
      )}

      {messages.map((msg) => {
        const agent = AGENT_MAP[msg.agentId];
        if (!agent) return null;

        return (
          <div
            key={msg.id}
            className="flex items-start gap-2.5 animate-fadeIn"
          >
            {/* 미니 아바타 */}
            <div
              className="relative rounded-full overflow-hidden shrink-0 mt-0.5"
              style={{
                width: 28,
                height: 28,
                outline: `1.5px solid ${agent.color}60`,
                outlineOffset: 1,
              }}
            >
              <Image
                src={agent.image}
                alt={agent.name}
                fill
                className="object-cover"
                sizes="28px"
              />
            </div>

            {/* 메시지 */}
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                className="text-[10px] font-semibold tracking-wide"
                style={{ color: agent.color }}
              >
                {agent.name} {agent.title}
              </span>
              <p
                className={`text-xs leading-relaxed ${
                  msg.type === "idle"
                    ? "text-slate-500"
                    : msg.type === "done"
                    ? "text-slate-400"
                    : "text-slate-200"
                }`}
              >
                {msg.text}
              </p>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
