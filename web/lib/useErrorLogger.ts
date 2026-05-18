"use client";
import { useEffect } from "react";

export function useErrorLogger() {
  useEffect(() => {
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      orig(...args);
      const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      // React 내부 경고, hydration 노이즈 필터링
      if (message.includes("Warning:") || message.includes("Each child in a list")) return;
      fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "error", source: "frontend", message: message.slice(0, 2000) }),
      }).catch(() => {});
    };
    return () => { console.error = orig; };
  }, []);
}
