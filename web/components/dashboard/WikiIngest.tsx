"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader, RotateCcw, MessageSquare, Users, Calendar, Hash } from "lucide-react";

type Status = "idle" | "loading" | "done" | "error";

interface KakaoPreview {
  roomName: string;
  participants: string[];
  messageCount: number;
  dateRange: { from: string; to: string };
  isKakao: true;
}

// 카카오톡 CSV 헤더 감지
const KAKAO_DATE_ALIASES = ["date", "날짜", "datetime", "일시", "시간"];
const KAKAO_USER_ALIASES = ["user", "사용자", "보낸사람", "이름", "name", "sender"];
const KAKAO_MSG_ALIASES  = ["message", "메시지", "내용", "content", "text"];

function detectKakaoCSV(text: string): KakaoPreview | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

  const firstLine = lines[0];
  const delimiter = (firstLine.match(/\t/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? "\t" : ",";
  const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ""));

  const hasDate = headers.some(h => KAKAO_DATE_ALIASES.some(a => h.includes(a)));
  const hasUser = headers.some(h => KAKAO_USER_ALIASES.some(a => h.includes(a)));
  const hasMsg  = headers.some(h => KAKAO_MSG_ALIASES.some(a => h.includes(a)));

  if (!hasDate || !hasUser || !hasMsg) return null;

  const dateIdx = headers.findIndex(h => KAKAO_DATE_ALIASES.some(a => h.includes(a)));
  const userIdx = headers.findIndex(h => KAKAO_USER_ALIASES.some(a => h.includes(a)));
  const msgIdx  = headers.findIndex(h => KAKAO_MSG_ALIASES.some(a => h.includes(a)));

  const rows = lines.slice(1).map(l => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, "")));
  const valid = rows.filter(r => r.length > Math.max(dateIdx, userIdx, msgIdx) && r[msgIdx]?.length > 2);

  if (valid.length === 0) return null;

  const participants = [...new Set(valid.map(r => r[userIdx]).filter(Boolean))].slice(0, 10);
  const dates = valid.map(r => r[dateIdx]).filter(Boolean);

  return {
    roomName: "",
    participants,
    messageCount: valid.length,
    dateRange: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" },
    isKakao: true,
  };
}

export default function WikiIngest() {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [kakaoPreview, setKakaoPreview] = useState<KakaoPreview | null>(null);
  const [roomName, setRoomName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ingest = async (content: string, name: string) => {
    setStatus("loading");
    setMessage("위키 대리에게 전달 중...");

    try {
      const res = await fetch("/api/wiki/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename: name || "document" }),
      });

      if (!res.ok || !res.body) throw new Error("ingest 실패");

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
            const event = JSON.parse(line.slice(6)) as { type: string; message?: string };
            if (event.type === "agent_message" && event.message) setMessage(event.message);
            else if (event.type === "agent_done") setMessage(event.message ?? "저장 완료");
            else if (event.type === "complete") {
              setStatus("done");
              setMessage("위키에 저장됐어요.");
              setText(""); setFilename(""); setKakaoPreview(null); setRoomName("");
            } else if (event.type === "error") throw new Error(event.message);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "오류 발생");
    }
  };

  const handleFile = async (file: File) => {
    const content = await file.text();
    const name = file.name.replace(/\.[^.]+$/, "");
    setFilename(name);
    setText(content);
    setStatus("idle");

    if (file.name.endsWith(".csv")) {
      const preview = detectKakaoCSV(content);
      setKakaoPreview(preview);
    } else {
      setKakaoPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    const name = kakaoPreview
      ? `KakaoTalk_${roomName || kakaoPreview.roomName || filename || "chat"}`
      : (filename || "document");
    void ingest(text.trim(), name);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <p className="text-[10px] text-slate-300 tracking-[0.2em] uppercase font-bold shrink-0">위키 인제스트</p>

      {/* 파일 드롭 존 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="shrink-0 rounded-xl p-3 flex items-center gap-2 cursor-pointer transition-all group"
        style={{ border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)" }}
      >
        <Upload size={13} className="text-slate-500 group-hover:text-slate-300 shrink-0 transition-colors" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors">
            파일 드래그 또는 클릭
          </span>
          <span className="text-[10px] text-slate-700 ml-2">.md .txt .csv</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
      </div>

      {/* 카카오톡 감지 프리뷰 */}
      {kakaoPreview && (
        <div className="shrink-0 rounded-xl p-3 space-y-2.5 animate-fadeIn"
          style={{ background: "rgba(110,231,183,0.05)", border: "1px solid rgba(110,231,183,0.2)" }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={11} style={{ color: "#6ee7b7" }} />
            <span className="text-[10px] font-bold" style={{ color: "#6ee7b7" }}>카카오톡 대화 감지됨</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5">
              <Hash size={9} className="text-slate-600" />
              <span className="text-[10px] text-slate-400">{kakaoPreview.messageCount.toLocaleString()}개 메시지</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={9} className="text-slate-600" />
              <span className="text-[10px] text-slate-400">{kakaoPreview.participants.length}명 참여</span>
            </div>
            <div className="flex items-start gap-1.5 col-span-2">
              <Calendar size={9} className="text-slate-600 mt-0.5 shrink-0" />
              <span className="text-[10px] text-slate-500 leading-relaxed">
                {kakaoPreview.dateRange.from} ~ {kakaoPreview.dateRange.to}
              </span>
            </div>
          </div>

          {kakaoPreview.participants.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {kakaoPreview.participants.slice(0, 6).map(p => (
                <span key={p} className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(110,231,183,0.1)", color: "#6ee7b7" }}>
                  {p}
                </span>
              ))}
              {kakaoPreview.participants.length > 6 && (
                <span className="text-[9px] text-slate-600">+{kakaoPreview.participants.length - 6}</span>
              )}
            </div>
          )}

          <div>
            <p className="text-[9px] text-slate-600 mb-1">채팅방 이름 (선택)</p>
            <input
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="예: AI 정보 공유방"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-700 focus:outline-none transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(110,231,183,0.2)" }}
            />
          </div>
        </div>
      )}

      {/* 일반 파일명 (비카카오) */}
      {!kakaoPreview && (
        <input
          type="text"
          value={filename}
          onChange={e => setFilename(e.target.value)}
          placeholder="파일명 (선택)"
          className="shrink-0 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        />
      )}

      {/* 텍스트 직접 입력 */}
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setKakaoPreview(null); }}
        placeholder="또는 텍스트 직접 붙여넣기..."
        className="flex-1 min-h-0 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-700 focus:outline-none resize-none transition-colors"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      />

      {/* 상태 메시지 */}
      {status !== "idle" && (
        <div className={`shrink-0 flex items-center gap-2 text-xs px-3 py-2 rounded-xl border ${
          status === "error" ? "border-red-500/40 bg-red-900/20 text-red-300" :
          status === "done"  ? "border-green-500/40 bg-green-900/20 text-green-300" :
          "border-slate-700 bg-slate-800/40 text-slate-300"
        }`}>
          {status === "loading" && <Loader size={11} className="animate-spin shrink-0" />}
          <span className="flex-1">{message}</span>
          {status === "error" && text.trim() && (
            <button onClick={() => void ingest(text.trim(), filename)}
              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium text-red-200 hover:text-white hover:bg-red-500/20 transition-all">
              <RotateCcw size={10} />재시도
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!text.trim() || status === "loading"}
        className="shrink-0 rounded-xl px-4 py-2 text-xs text-white font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <FileText size={12} />
        {kakaoPreview ? "카카오톡 대화 위키에 저장" : "위키에 저장"}
      </button>
    </div>
  );
}
