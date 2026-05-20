"use client";

import dynamic from "next/dynamic";

const OfficeScene = dynamic(
  () => import("@/components/office/OfficeScene"),
  { ssr: false, loading: () => <Loading /> }
);

function Loading() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080c18",
        color: "#334155",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        letterSpacing: "0.15em",
      }}
    >
      INITIALIZING OFFICE...
    </div>
  );
}

export default function OfficePage() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <OfficeScene />
    </div>
  );
}
