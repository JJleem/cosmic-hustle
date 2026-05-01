"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Send } from "lucide-react";
import { AgentDef } from "@/lib/agents";

const AGENT_CONFIG: Record<string, { greeting: string; actions: Array<{ label: string; prompt: string }> }> = {
  wiki:  { greeting: "원하시는 게 있으세요?",               actions: [{ label: "지식 요약", prompt: "현재 위키에 어떤 내용이 저장되어 있는지 요약해줘" }] },
  pocke: { greeting: "뭘 찾아드릴까요? 볼따구 비어있어요.", actions: [{ label: "웹 검색", prompt: "검색해줘: " }] },
  ka:    { greeting: "데이터 있어요? 분석해드릴게요.",       actions: [{ label: "패턴 분석", prompt: "아래 데이터를 분석해줘:\n" }] },
  over:  { greeting: "뭘 써드릴까요... 눈물이 날 것 같은 걸.", actions: [{ label: "글 써주기", prompt: "아래 내용으로 글을 써줘:\n" }] },
  fact:  { greeting: ".",                                    actions: [{ label: "팩트 체크", prompt: "아래 내용을 팩트체크해줘:\n" }] },
  ping:  { greeting: "오! 번뜩! 뭔가 있어요?",              actions: [{ label: "아이디어", prompt: "이 주제로 아이디어를 내줘: " }] },
  plan:  { greeting: "어떤 리서치를 원하세요?",              actions: [{ label: "태스크 분해", prompt: "이 주제를 리서치 태스크로 분해해줘: " }] },
  run:   { greeting: "이미 짰어요. 뭘 만들까요?",            actions: [{ label: "코드 작성", prompt: "아래 기능을 구현해줘:\n" }] },
  pixel: { greeting: "폰트 고민하고 있었어요. 뭘 만들까요?", actions: [{ label: "UI 설계", prompt: "아래 화면을 설계해줘:\n" }] },
  buzz:  { greeting: "바이럴 각이에요? 뭘 마케팅할까요?",    actions: [{ label: "전략 수립", prompt: "아래 제품의 마케팅 전략을 짜줘:\n" }] },
  root:  { greeting: "수동 배포는 범죄예요. 뭘 배포할까요?", actions: [{ label: "배포 계획", prompt: "아래 기능의 배포 계획을 짜줘:\n" }] },
};

type Message = { id: string; role: "agent" | "user"; text: string; loading?: boolean };

type Props = { agent: AgentDef; placeholder?: string; mono?: boolean; initialInput?: string };

export default function ChatPanel({ agent, placeholder, mono = false, initialInput }: Props) {
  const cfg = AGENT_CONFIG[agent.id] ?? { greeting: "무엇을 도와드릴까요?", actions: [] };
  const [messages, setMessages] = useState<Message[]>([{ id: "init", role: "agent", text: cfg.greeting }]);
  const [input, setInput] = useState(initialInput ?? "");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMsg = (role: "agent" | "user", text: string, isLoading = false) => {
    const id = crypto.randomUUID();
    setMessages(prev => [...prev, { id, role, text, loading: isLoading }]);
    return id;
  };
  const updateMsg = (id: string, text: string) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text, loading: false } : m));

  const send = async (prompt: string) => {
    if (loading) return;
    setLoading(true);
    const lid = addMsg("agent", "...", true);
    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: prompt }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = ""; let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as { type: string; result?: { result?: string } };
            if (ev.type === "complete" && ev.result?.result) result = ev.result.result;
          } catch { /* ignore */ }
        }
      }
      updateMsg(lid, result || "완료했어요.");
    } catch { updateMsg(lid, "오류가 생겼어요."); }
    finally { setLoading(false); }
  };

  const handleSend = () => {
    const t = input.trim(); if (!t || loading) return;
    addMsg("user", t); setInput(""); send(t);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 scrollbar-hide">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}>
            {msg.role === "agent" && (
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 relative mt-0.5" style={{ outline: `1px solid ${agent.color}40`, outlineOffset: 1 }}>
                <Image src={agent.image} alt="" fill className="object-cover" sizes="32px" />
              </div>
            )}
            <div
              className={`max-w-[68%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.loading ? "animate-pulse" : ""} ${mono ? "font-mono text-xs" : ""}`}
              style={msg.role === "agent"
                ? { background: "rgba(255,255,255,0.04)", border: `1px solid ${agent.color}20`, color: "#cbd5e1" }
                : { background: `${agent.color}14`, border: `1px solid ${agent.color}28`, color: "#f1f5f9" }
              }
            >
              <pre className={`whitespace-pre-wrap ${mono ? "font-mono" : "font-sans"}`}>{msg.text}</pre>
            </div>
          </div>
        ))}
        {messages.length === 1 && !loading && cfg.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-11">
            {cfg.actions.map(a => (
              <button key={a.label} onClick={() => setInput(a.prompt)}
                className="text-xs px-4 py-2 rounded-full border transition-all hover:opacity-80"
                style={{ borderColor: `${agent.color}40`, color: agent.color, background: `${agent.color}08` }}
              >{a.label}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-8 py-5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={placeholder ?? `${agent.name}에게 말하기...`}
            disabled={loading}
            className={`flex-1 bg-transparent text-sm text-white placeholder:text-slate-700 focus:outline-none ${mono ? "font-mono" : ""}`}
          />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all disabled:opacity-25"
            style={{ background: `${agent.color}20`, border: `1px solid ${agent.color}40` }}
          >
            <Send size={13} style={{ color: agent.color }} />
          </button>
        </div>
      </div>
    </div>
  );
}
