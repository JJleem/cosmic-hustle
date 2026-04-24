"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X, Send, Upload, Info } from "lucide-react";
import { AgentDef, DEPT_MAP } from "@/lib/agents";
import AgentProfile from "./AgentProfile";

// 에이전트별 초기 인사 & 퀵액션 정의
const AGENT_CONFIG: Record<string, {
  greeting: string;
  actions: Array<{ label: string; prompt?: string; special?: string }>;
}> = {
  wiki: {
    greeting: "원하시는 게 있으세요?",
    actions: [
      { label: "문서 저장하기", special: "ingest" },
      { label: "지식 베이스 조회", prompt: "현재 위키에 어떤 내용이 저장되어 있는지 요약해줘" },
    ],
  },
  pocke: {
    greeting: "뭘 찾아드릴까요? 볼따구 비어있어요.",
    actions: [
      { label: "웹 검색", prompt: "검색해줘: " },
    ],
  },
  ka: {
    greeting: "데이터 있어요? 분석해드릴게요.",
    actions: [
      { label: "패턴 분석", prompt: "아래 데이터를 분석해줘:\n" },
    ],
  },
  over: {
    greeting: "뭘 써드릴까요... 눈물이 날 것 같은 걸 써드릴게요.",
    actions: [
      { label: "글 써주기", prompt: "아래 내용으로 감동적인 글을 써줘:\n" },
    ],
  },
  fact: {
    greeting: ".",
    actions: [
      { label: "팩트 체크", prompt: "아래 내용을 팩트체크해줘:\n" },
    ],
  },
  ping: {
    greeting: "오! 뭔가 있어요? 번뜩!",
    actions: [
      { label: "아이디어 내기", prompt: "이 주제로 아이디어를 내줘: " },
    ],
  },
};

type Message = {
  id: string;
  role: "agent" | "user";
  text: string;
  loading?: boolean;
};

type Props = { agent: AgentDef; onClose: () => void };

export default function AgentChat({ agent, onClose }: Props) {
  const config = AGENT_CONFIG[agent.id] ?? { greeting: "무엇을 도와드릴까요?", actions: [] };
  const dept = DEPT_MAP[agent.departmentId];

  const [messages, setMessages] = useState<Message[]>([
    { id: "greeting", role: "agent", text: config.greeting },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIngest, setShowIngest] = useState(false);
  const [ingestText, setIngestText] = useState("");
  const [ingestFilename, setIngestFilename] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addAgentMsg = (text: string, loading = false) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, role: "agent", text, loading }]);
    return id;
  };

  const updateMsg = (id: string, text: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, text, loading: false } : m));
  };

  const sendToAgent = async (prompt: string) => {
    if (loading) return;
    setLoading(true);
    const loadingId = addAgentMsg("...", true);

    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: prompt }),
      });

      if (!res.ok || !res.body) throw new Error("응답 오류");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let resultText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; result?: Record<string, unknown>; message?: string };
            if (event.type === "complete" && event.result) {
              const r = event.result;
              resultText = typeof r.result === "string" ? r.result : JSON.stringify(r, null, 2);
            }
          } catch { /* ignore */ }
        }
      }

      updateMsg(loadingId, resultText || "완료했어요.");
    } catch (err) {
      updateMsg(loadingId, `오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    sendToAgent(text);
  };

  const handleAction = (action: typeof config.actions[0]) => {
    if (action.special === "ingest") {
      setShowIngest(true);
      addAgentMsg("어떤 문서를 저장할까요? 텍스트를 붙여넣거나 파일을 드래그하세요.");
    } else if (action.prompt) {
      setInput(action.prompt);
    }
  };

  const handleIngest = async () => {
    if (!ingestText.trim() || loading) return;
    setShowIngest(false);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: `[문서 저장: ${ingestFilename || "document"}]` },
    ]);
    setLoading(true);
    const loadingId = addAgentMsg("문서 읽는 중...", true);

    try {
      const res = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: ingestText, filename: ingestFilename || "document" }),
      });

      if (!res.body) throw new Error("오류");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const e = JSON.parse(line.slice(6)) as { type: string; message?: string };
            if (e.type === "agent_message" && e.message) updateMsg(loadingId, e.message);
            if (e.type === "agent_done") updateMsg(loadingId, e.message ?? "저장 완료.");
          } catch { /* ignore */ }
        }
      }
    } catch {
      updateMsg(loadingId, "저장 중 오류가 생겼어요.");
    } finally {
      setLoading(false);
      setIngestText("");
      setIngestFilename("");
    }
  };

  const handleFile = async (file: File) => {
    const content = await file.text();
    setIngestFilename(file.name.replace(/\.[^.]+$/, ""));
    setIngestText(content);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center pb-24"
        style={{ pointerEvents: "none" }}
      >
        <div
          className="relative flex flex-col w-96 max-h-[520px] rounded-2xl border border-slate-600 bg-[#0f1629] shadow-2xl overflow-hidden"
          style={{
            pointerEvents: "all",
            boxShadow: `0 0 60px 6px ${agent.glow}`,
            borderColor: `${agent.color}40`,
          }}
        >
          {/* 헤더 */}
          <div
            className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: `${agent.color}25` }}
          >
            <div
              className="relative rounded-full overflow-hidden shrink-0"
              style={{ width: 36, height: 36, outline: `1.5px solid ${agent.color}`, outlineOffset: 2 }}
            >
              <Image src={agent.image} alt={agent.name} fill className="object-cover" sizes="36px" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{agent.name}</p>
              <p className="text-[10px] text-slate-400">{agent.title} · {agent.role}</p>
            </div>

            {dept && (
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${dept.color}20`, color: dept.color, border: `1px solid ${dept.color}40` }}
              >
                {dept.label}
              </span>
            )}

            <button onClick={() => setShowProfile(true)} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
              <Info size={13} />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "agent" && (
                  <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 mr-2 mt-0.5 relative">
                    <Image src={agent.image} alt="" fill className="object-cover" sizes="20px" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-slate-600 text-white rounded-tr-sm"
                      : "text-slate-200 rounded-tl-sm"
                  } ${msg.loading ? "animate-pulse" : ""}`}
                  style={msg.role === "agent" ? {
                    background: "#13182a",
                    border: `1px solid ${agent.color}30`,
                  } : {}}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                </div>
              </div>
            ))}

            {/* 퀵액션 — 마지막 인사 아래 */}
            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-2 pl-7">
                {config.actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => handleAction(a)}
                    className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
                    style={{
                      borderColor: `${agent.color}50`,
                      color: agent.color,
                      background: `${agent.color}10`,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 인제스트 영역 */}
          {showIngest && (
            <div
              className="shrink-0 border-t px-4 py-3 space-y-2"
              style={{ borderColor: `${agent.color}25` }}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
            >
              <div
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 border border-dashed rounded-xl px-3 py-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors"
                style={{ borderColor: `${agent.color}30` }}
              >
                <Upload size={11} />
                파일 드래그 또는 클릭
                <input ref={fileRef} type="file" accept=".md,.txt,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              <input
                type="text"
                value={ingestFilename}
                onChange={(e) => setIngestFilename(e.target.value)}
                placeholder="파일명 (선택)"
                className="w-full bg-slate-800 border rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
                style={{ borderColor: `${agent.color}30` }}
              />
              <textarea
                value={ingestText}
                onChange={(e) => setIngestText(e.target.value)}
                placeholder="텍스트 붙여넣기..."
                className="w-full h-20 bg-slate-800 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none resize-none"
                style={{ borderColor: `${agent.color}30` }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowIngest(false)}
                  className="flex-1 text-xs py-1.5 rounded-xl border border-slate-600 text-slate-400 hover:text-white transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleIngest}
                  disabled={!ingestText.trim() || loading}
                  className="flex-1 text-xs py-1.5 rounded-xl font-medium disabled:opacity-30 transition-colors"
                  style={{ background: `${agent.color}25`, color: agent.color, border: `1px solid ${agent.color}50` }}
                >
                  저장하기
                </button>
              </div>
            </div>
          )}

          {/* 입력창 */}
          {!showIngest && (
            <div
              className="shrink-0 flex items-center gap-2 px-4 py-3 border-t"
              style={{ borderColor: `${agent.color}25` }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`${agent.name}에게 말하기...`}
                disabled={loading}
                className="flex-1 bg-slate-800 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50 transition-colors"
                style={{ borderColor: `${agent.color}30` }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30 transition-all"
                style={{ background: `${agent.color}25`, border: `1px solid ${agent.color}50` }}
              >
                <Send size={12} style={{ color: agent.color }} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 배경 닫기 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {showProfile && <AgentProfile agent={agent} onClose={() => setShowProfile(false)} />}
    </>
  );
}
