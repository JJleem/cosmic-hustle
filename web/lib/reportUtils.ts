import { AGENT_MAP } from "@/lib/agents";

export type Report = {
  id: string;
  sessionId?: string;
  agentId: string;
  topic: string;
  content: string;
  tags?: string[];
  createdAt: Date;
};

export type ReportVersion = {
  version: number;
  content: string;
  factFeedback: string | null;
  createdAt: string | null;
};

export function extractHtml(content: string): string | null {
  const match = content.match(/```html\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  const trimmed = content.trim();
  if (/^<!DOCTYPE html/i.test(trimmed) || /^<html/i.test(trimmed)) return trimmed;
  return null;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function mdToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul]|<\/[hul]|<li|<\/ul)(.+)$/gm, "$1")
    .replace(/^(.+)$/gm, (line) =>
      /^<(h[123]|ul|li|\/ul|\/li|p)/.test(line) ? line : `<p>${line}</p>`)
    .replace(/<p><\/p>/g, "");
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function printReport(report: Report) {
  const agent = AGENT_MAP[report.agentId];
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ko"><head>
  <meta charset="utf-8"/>
  <title>${report.topic}</title>
  <style>
    body { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1e293b; line-height: 1.8; }
    h1 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem; }
    h2 { font-size: 1.2rem; margin-top: 1.5rem; margin-bottom: 0.4rem; }
    h3 { font-size: 1rem; margin-top: 1.2rem; margin-bottom: 0.3rem; }
    p { margin: 0.6rem 0; }
    ul { padding-left: 1.5rem; margin: 0.5rem 0; }
    li { margin: 0.25rem 0; }
    strong { font-weight: 700; }
    code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
    .meta { display: flex; align-items: center; gap: 12px; margin-bottom: 2rem; padding: 12px 16px; background: #f8fafc; border-radius: 8px; font-size: 0.8rem; color: #64748b; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; background: #e0f2fe; color: #0369a1; }
    @media print { body { margin: 0; } }
  </style>
</head><body>
  <div class="meta">
    <span class="badge">${agent?.name ?? report.agentId} · ${agent?.role ?? ""}</span>
    <span>${report.topic}</span>
    <span style="margin-left:auto">${new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
  </div>
  ${mdToHtml(report.content)}
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
  win.document.close();
}

export function downloadMarkdown(report: Report) {
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${report.agentId}.md`;
  const header = `# ${report.topic}\n\n> 작성: ${AGENT_MAP[report.agentId]?.name ?? report.agentId} · ${new Date(report.createdAt).toLocaleDateString("ko-KR")}\n\n---\n\n`;
  triggerDownload(new Blob([header + report.content], { type: "text/markdown;charset=utf-8" }), filename);
}

export function downloadHtml(report: Report) {
  const html = extractHtml(report.content);
  if (!html) return;
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.html`;
  triggerDownload(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
}

export function downloadTxt(report: Report) {
  const filename = `${report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_")}.txt`;
  triggerDownload(new Blob([stripMarkdown(report.content)], { type: "text/plain;charset=utf-8" }), filename);
}

export async function downloadExport(report: Report, format: "pdf" | "excel") {
  const res = await fetch(`/api/reports/${report.id}/export?format=${format}`);
  if (!res.ok) return;
  const blob = await res.blob();
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const name = report.topic.replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 50);
  triggerDownload(blob, `${name}.${ext}`);
}
