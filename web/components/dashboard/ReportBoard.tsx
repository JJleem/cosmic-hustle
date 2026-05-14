"use client";

import { useState } from "react";
import { type Report } from "@/lib/reportUtils";
import ReportList from "@/components/dashboard/ReportList";
import ReportViewer from "@/components/dashboard/ReportViewer";

type Props = {
  reports: Report[];
  drafts?: Record<string, string>;
  onDelete?: (id: string) => void;
  onUpdate?: (updated: Report) => void;
  onDeepDive?: (topic: string) => void;
};

export default function ReportBoard({ reports, drafts = {}, onDelete, onUpdate, onDeepDive }: Props) {
  const [selected, setSelected] = useState<Report | null>(null);

  const handleDelete = (id: string) => {
    onDelete?.(id);
    if (selected?.id === id) setSelected(null);
  };

  return (
    <>
      <ReportList
        reports={reports}
        onSelect={setSelected}
        onDelete={handleDelete}
      />
      {selected && (
        <ReportViewer
          report={selected}
          drafts={drafts}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUpdate={(updated) => { setSelected(updated); onUpdate?.(updated); }}
          onDeepDive={onDeepDive}
        />
      )}
    </>
  );
}
