"use client";

import { type Report } from "@/lib/reportUtils";
import ReportList from "@/components/dashboard/ReportList";

type Props = {
  reports: Report[];
  onSelect: (report: Report) => void;
  onDelete?: (id: string) => void;
};

export default function ReportBoard({ reports, onSelect, onDelete }: Props) {
  return (
    <ReportList
      reports={reports}
      onSelect={onSelect}
      onDelete={(id) => onDelete?.(id)}
    />
  );
}
