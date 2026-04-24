"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Zap, Sparkles, Upload } from "lucide-react";
import { AgentDef, AgentStatus, DEPT_MAP } from "@/lib/agents";
import AgentImage from "./AgentImage";

export type Idea = { title: string; spark: string };

type TaskState = "idle" | "working" | "done";

type Props = {
  agent: AgentDef;
  pingIdeas: Idea[];
  lastTopic: string;
  onClose: () => void;
};

// ── 에이전트별 워크스페이스 메타 ──────────────────────────────────────────
const WORKSPACE_META: Record<string, { title: string; desc: string; placeholder: string }> = {
  wiki:  { title: "위키 사서실",    desc: "지식을 저장하거나 기존 자료를 조회해요.",         placeholder: "위키에 뭔가 저장하거나 찾아달라고 해보세요..." },
  pocke: { title: "포케의 주머니",  desc: "뭐든 검색해드려요. 볼따구 비어있어요.",           placeholder: "검색할 키워드나 주제를 던져보세요..." },
  ka:    { title: "카의 분석 테이블", desc: "데이터를 주면 패턴을 찾아드려요.",              placeholder: "분석할 데이터나 주제를 입력하세요..." },
  over:  { title: "오버의 작업실",  desc: "감동적인 글을 써드릴게요. 눈물이 날 것 같아요.", placeholder: "어떤 내용으로 써드릴까요..." },
  fact:  { title: "팩트 검토실",    desc: ".",                                               placeholder: "팩트체크할 내용을 입력하세요..." },
  ping:  { title: "핑의 아이디어 보드", desc: "최근 리서치에서 파생된 아이디어들이에요.",    placeholder: "이 주제로 아이디어 더 내줘..." },
};

function tryParseIdeas(text: string): Idea[] {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { ideas?: Idea[] };
    return parsed.ideas ?? [];
  } catch {
    return [];
  }
}

// ── 핑 아이디어 보드 ─────────────────────────────────────────────────────
function PingIdeaBoard({
  ideas,
  lastTopic,
  taskState,
  agentColor,
  onFetch,
  onIdeaClick,
}: {
  ideas: Idea[];
  lastTopic: string;
  taskState: TaskState;
  agentColor: string;
  onFetch: () => void;
  onIdeaClick: (title: string) => void;
}) {
  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
          style={{ background: `${agentColor}15`, border: `1px solid ${agentColor}30` }}
        >
          ✨
        </div>
        <div>
          <p className="text-sm text-slate-300 font-medium">아직 아이디어가 없어요</p>
          <p className="text-xs text-slate-500 mt-1">
            {lastTopic ? `"${lastTopic}" 리서치 기반으로 가져올 수 있어요` : "리서치를 먼저 진행해보세요"}
          </p>
        </div>
        {lastTopic && (
          <button
            onClick={onFetch}
            disabled={taskState === "working"}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 transition-all"
            style={{ background: `${agentColor}20`, color: agentColor, border: `1px solid ${agentColor}45` }}
          >
            <Zap size={14} />
            아이디어 가져오기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
          캡처된 아이디어 {ideas.length}개
        </p>
        {lastTopic && (
          <button
            onClick={onFetch}
            disabled={taskState === "working"}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium disabled:opacity-40 transition-all"
            style={{ background: `${agentColor}15`, color: agentColor, border: `1px solid ${agentColor}35` }}
          >
            <Sparkles size={10} />
            새로 뽑기
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {ideas.map((idea, i) => (
          <button
            key={i}
            onClick={() => onIdeaClick(idea.title)}
            className="text-left rounded-xl p-3 transition-all group"
            style={{
              background: `${agentColor}08`,
              border: `1px solid ${agentColor}25`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${agentColor}15`;
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${agentColor}50`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = `${agentColor}08`;
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${agentColor}25`;
            }}
          >
            <p className="text-xs font-semibold text-white leading-snug mb-1">{idea.title}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{idea.spark}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 인제스트 패널 (위키 전용) ─────────────────────────────────────────────
function IngestPanel({
  agentColor,
  onCancel,
  onSave,
}: {
  agentColor: string;
  onCancel: () => void;
  onSave: (content: string, filename: string) => void;
}) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const content = await file.text();
    setFilename(file.name.replace(/\.[^.]+$/, ""));
    setText(content);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-300 font-medium">어떤 문서를 저장할까요?</p>
      <div
        className="flex items-center gap-2 border border-dashed rounded-xl px-3 py-2.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors"
        style={{ borderColor: `${agentColor}35` }}
        onClick={() => fileRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload size={12} />
        파일 드래그 또는 클릭 (.md, .txt, .csv)
        <input ref={fileRef} type="file" accept=".md,.txt,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      <input
        type="text"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        placeholder="파일명 (선택)"
        className="w-full bg-slate-800/60 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
        style={{ borderColor: `${agentColor}30` }}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="텍스트 직접 붙여넣기..."
        className="w-full h-28 bg-slate-800/60 border rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none resize-none"
        style={{ borderColor: `${agentColor}30` }}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-xs py-2 rounded-xl border border-slate-600 text-slate-400 hover:text-white transition-colors"
        >
          취소
        </button>
        <button
          onClick={() => text.trim() && onSave(text, filename)}
          disabled={!text.trim()}
          className="flex-1 text-xs py-2 rounded-xl font-medium disabled:opacity-30 transition-all"
          style={{ background: `${agentColor}20`, color: agentColor, border: `1px solid ${agentColor}45` }}
        >
          저장하기
        </button>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
export default function AgentWorkspace({ agent, pingIdeas, lastTopic, onClose }: Props) {
  const dept = DEPT_MAP[agent.departmentId];
  const meta = WORKSPACE_META[agent.id] ?? { title: "워크스페이스", desc: "무엇을 도와드릴까요?", placeholder: "지시사항을 입력하세요..." };

  const [taskState, setTaskState] = useState<TaskState>("idle");
  const [streamMsg, setStreamMsg] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>(pingIdeas);
  const [input, setInput] = useState("");
  const [showIngest, setShowIngest] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "agent"; text: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 올 때 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamMsg]);

  // 외부에서 pingIdeas 업데이트되면 반영
  useEffect(() => {
    if (pingIdeas.length > 0) setIdeas(pingIdeas);
  }, [pingIdeas]);

  const imageStatus: AgentStatus =
    taskState === "working" ? "active" : taskState === "done" ? "done" : "idle";

  const callAgent = async (task: string, context?: string) => {
    if (taskState === "working") return;
    setTaskState("working");
    setStreamMsg("작업 중...");
    setResult(null);

    try {
      const res = await fetch(`/api/agent/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context }),
      });

      if (!res.ok || !res.body) throw new Error("응답 오류");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalResult = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              result?: Record<string, unknown>;
              message?: string;
            };
            if (event.type === "agent_message" && event.message) {
              setStreamMsg(event.message);
            }
            if (event.type === "complete" && event.result) {
              finalResult =
                typeof event.result.result === "string"
                  ? event.result.result
                  : JSON.stringify(event.result, null, 2);

              if (agent.id === "ping") {
                const parsed = tryParseIdeas(finalResult);
                if (parsed.length > 0) setIdeas(parsed);
              }
            }
          } catch { /* ignore */ }
        }
      }

      setResult(finalResult || "완료했어요.");
      setStreamMsg("");
      setTaskState("done");

      if (agent.id !== "ping") {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "agent", text: finalResult || "완료했어요." },
        ]);
      }

      setTimeout(() => setTaskState("idle"), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setStreamMsg(`오류: ${msg}`);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "agent", text: `오류: ${msg}` }]);
      setTaskState("idle");
    }
  };

  const callIngest = async (content: string, filename: string) => {
    setShowIngest(false);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: `[문서 저장: ${filename || "document"}]` }]);
    setTaskState("working");
    setStreamMsg("문서 읽는 중...");

    try {
      const res = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename: filename || "document" }),
      });

      if (!res.body) throw new Error("오류");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let doneMsg = "저장 완료.";

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
            if (e.type === "agent_message" && e.message) setStreamMsg(e.message);
            if (e.type === "agent_done") doneMsg = e.message ?? "저장 완료.";
          } catch { /* ignore */ }
        }
      }

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "agent", text: doneMsg }]);
      setTaskState("done");
      setStreamMsg("");
      setTimeout(() => setTaskState("idle"), 2500);
    } catch {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "agent", text: "저장 중 오류가 생겼어요." }]);
      setTaskState("idle");
      setStreamMsg("");
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || taskState === "working") return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    callAgent(text);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex w-[92vw] max-w-5xl rounded-3xl overflow-hidden"
        style={{
          height: "88vh",
          background: "#090d1a",
          border: `1px solid ${agent.color}28`,
          boxShadow: `0 0 100px 8px ${agent.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 닫기 버튼 ── */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
        >
          <X size={14} />
        </button>

        {/* ══ 왼쪽: 캐릭터 패널 ══════════════════════════════════════════ */}
        <div
          className="w-64 shrink-0 flex flex-col border-r"
          style={{ borderColor: `${agent.color}18` }}
        >
          {/* 캐릭터 이미지 */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{ height: 260, background: `${agent.color}06` }}
          >
            <AgentImage defaultSrc={agent.image} size={256} status={imageStatus} />

            {/* working 오버레이 */}
            {taskState === "working" && (
              <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium"
                  style={{ background: "rgba(0,0,0,0.7)", border: `1px solid ${agent.color}40`, color: agent.color }}
                >
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: agent.color }} />
                  작업 중...
                </div>
              </div>
            )}

            {/* done 오버레이 */}
            {taskState === "done" && (
              <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold"
                  style={{ background: "rgba(0,0,0,0.7)", border: `1px solid ${agent.color}60`, color: agent.color }}
                >
                  여기있어!
                </div>
              </div>
            )}

            {/* 하단 그라디언트 */}
            <div
              className="absolute bottom-0 inset-x-0 h-16 pointer-events-none"
              style={{ background: "linear-gradient(to top, #090d1a, transparent)" }}
            />
          </div>

          {/* 이름/직책 */}
          <div className="px-5 pt-3 pb-3 border-b shrink-0" style={{ borderColor: `${agent.color}15` }}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-white">{agent.name}</h2>
              <span className="text-xs text-slate-500">{agent.title}</span>
            </div>
            <p className="text-xs font-medium mt-0.5" style={{ color: agent.color }}>
              {agent.role}
            </p>
            {dept && (
              <div
                className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider"
                style={{ background: `${dept.color}18`, border: `1px solid ${dept.color}38`, color: dept.color }}
              >
                <dept.icon size={8} />
                {dept.label}
              </div>
            )}
          </div>

          {/* 캐릭터 특성 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-hide">
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase font-bold text-slate-600 mb-1.5">출신 행성</p>
              <p className="text-[11px] text-slate-300 leading-relaxed">{agent.planet}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase font-bold text-slate-600 mb-1.5">성격</p>
              <p className="text-[11px] text-slate-300 leading-relaxed">{agent.personality}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase font-bold text-slate-600 mb-1.5">약점</p>
              <p className="text-[11px] text-slate-300 leading-relaxed">{agent.weakness}</p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.2em] uppercase font-bold text-slate-600 mb-1.5">담당 업무</p>
              <ul className="space-y-1">
                {agent.responsibilities.map((r) => (
                  <li key={r} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                    <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: agent.color }} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ══ 오른쪽: 워크스페이스 ════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 헤더 */}
          <div className="shrink-0 px-6 py-4 border-b" style={{ borderColor: `${agent.color}18` }}>
            <h3 className="text-sm font-bold text-white">{meta.title}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{meta.desc}</p>
          </div>

          {/* 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-hide">

            {/* 핑 전용: 아이디어 보드 */}
            {agent.id === "ping" && !showIngest && (
              <PingIdeaBoard
                ideas={ideas}
                lastTopic={lastTopic}
                taskState={taskState}
                agentColor={agent.color}
                onFetch={() =>
                  callAgent(
                    `주제: "${lastTopic || "일반"}". 이 리서치에서 파생될 수 있는 창의적인 아이디어, 연결 가능한 주제를 5개 찾아보세요.\n` +
                    `JSON으로만 응답: {"ideas": [{"title": "아이디어 제목", "spark": "한 줄 설명"}]}`
                  )
                }
                onIdeaClick={(title) =>
                  setInput(`이 아이디어를 더 발전시켜줘: ${title}`)
                }
              />
            )}

            {/* 위키 전용: 인제스트 패널 */}
            {agent.id === "wiki" && showIngest && (
              <IngestPanel
                agentColor={agent.color}
                onCancel={() => setShowIngest(false)}
                onSave={callIngest}
              />
            )}

            {/* 위키 퀵액션 */}
            {agent.id === "wiki" && !showIngest && messages.length === 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowIngest(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}35` }}
                >
                  <Upload size={11} />
                  문서 저장하기
                </button>
                <button
                  onClick={() => callAgent("현재 위키에 어떤 내용이 저장되어 있는지 목록과 함께 간략히 요약해줘")}
                  disabled={taskState === "working"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-40"
                  style={{ background: `${agent.color}15`, color: agent.color, border: `1px solid ${agent.color}35` }}
                >
                  지식 베이스 조회
                </button>
              </div>
            )}

            {/* 일반 에이전트 퀵액션 힌트 */}
            {agent.id !== "ping" && agent.id !== "wiki" && messages.length === 0 && (
              <div className="text-center py-8">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-3"
                  style={{ background: `${agent.color}12`, border: `1px solid ${agent.color}28` }}
                >
                  {agent.id === "pocke" ? "🐹" : agent.id === "ka" ? "📊" : agent.id === "over" ? "✍️" : "🔍"}
                </div>
                <p className="text-xs text-slate-400">{meta.placeholder}</p>
              </div>
            )}

            {/* 대화 메시지 */}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed"
                  style={
                    msg.role === "user"
                      ? { background: "#1e2a3d", color: "#e2e8f0" }
                      : {
                          background: `${agent.color}0c`,
                          border: `1px solid ${agent.color}28`,
                          color: "#e2e8f0",
                        }
                  }
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                </div>
              </div>
            ))}

            {/* 스트리밍 진행 표시 */}
            {taskState === "working" && streamMsg && agent.id !== "ping" && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 rounded-2xl px-4 py-3 text-xs"
                  style={{ background: `${agent.color}0c`, border: `1px solid ${agent.color}28`, color: agent.color }}
                >
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1 h-1 rounded-full animate-bounce"
                        style={{ background: agent.color, animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  {streamMsg}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 입력 영역 */}
          {!showIngest && (
            <div className="shrink-0 px-6 py-4 border-t" style={{ borderColor: `${agent.color}18` }}>
              <div className="flex gap-3 items-end">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={meta.placeholder}
                  disabled={taskState === "working"}
                  className="flex-1 bg-slate-800/50 border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50 transition-all"
                  style={{ borderColor: `${agent.color}30` }}
                  onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = `${agent.color}60`; }}
                  onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = `${agent.color}30`; }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || taskState === "working"}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-30 transition-all"
                  style={{
                    background: `${agent.color}22`,
                    color: agent.color,
                    border: `1px solid ${agent.color}45`,
                  }}
                >
                  <Send size={12} />
                  전송
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
