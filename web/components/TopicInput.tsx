"use client";

import { useState } from "react";

type Props = {
  onSubmit: (topic: string) => void;
  disabled?: boolean;
};

export default function TopicInput({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit(value.trim());
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "팀이 일하는 중..." : "오늘의 주제를 던져보세요..."}
        className="
          flex-1 bg-slate-800/60 border border-slate-700/60 rounded-2xl
          px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600
          focus:outline-none focus:border-slate-500 transition-colors
          disabled:opacity-40
        "
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        className="
          bg-slate-700 hover:bg-slate-600 disabled:opacity-30
          text-white rounded-2xl px-4 py-2.5 text-sm
          transition-colors cursor-pointer
        "
      >
        →
      </button>
    </form>
  );
}
