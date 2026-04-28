"use client";

import { motion } from "framer-motion";

type Props = {
  color: string;
  dissolving: boolean;
};

export default function HologramPartition({ color, dissolving }: Props) {
  return (
    <motion.div
      className="relative shrink-0 self-stretch overflow-visible"
      style={{ width: 1 }}
      animate={
        dissolving
          ? { opacity: 0, scaleX: 3, filter: "blur(8px)" }
          : { opacity: 1, scaleX: 1, filter: "blur(0px)" }
      }
      transition={{ duration: 0.45, ease: "easeInOut" }}
    >
      {/* 메인 라인 */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, transparent 0%, ${color}60 20%, ${color}90 50%, ${color}60 80%, transparent 100%)`,
          boxShadow: `0 0 6px 1px ${color}50, 0 0 18px 3px ${color}20`,
        }}
      />

      {/* 스캔라인 */}
      <motion.div
        className="absolute left-0 w-px"
        style={{
          height: 60,
          background: `linear-gradient(to bottom, transparent, ${color}, ${color}cc, transparent)`,
          filter: `drop-shadow(0 0 4px ${color})`,
        }}
        animate={{ y: ["-10%", "110%"] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 0.5 }}
      />

      {/* 중앙 마름모 */}
      <div
        className="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rotate-45"
        style={{
          background: color,
          boxShadow: `0 0 8px 2px ${color}80`,
        }}
      />
    </motion.div>
  );
}
