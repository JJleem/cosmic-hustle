import { runAgent, WIKI_DIR } from "../../research/route";

export const maxDuration = 300;

// POST /api/wiki/ingest
// body: { content: string, filename?: string }
//   또는 multipart FormData: file + (optional) filename
export async function POST(request: Request) {
  let content = "";
  let filename = "document";

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      content = await file.text();
      filename = file.name.replace(/\.[^.]+$/, "");
    }
    const nameField = form.get("filename");
    if (typeof nameField === "string") filename = nameField;
  } else {
    const body = await request.json() as { content?: string; filename?: string };
    content = body.content?.trim() ?? "";
    filename = body.filename ?? "document";
  }

  if (!content) return Response.json({ error: "content required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* closed */ }
      };

      send({ type: "agent_start", agentId: "wiki", message: "문서 읽는 중... 조용히 정리할게요." });

      runAgent(
        `당신은 위키 대리입니다. 조용하고 꼼꼼한 사서예요.\n\n` +
        `아래 문서를 wiki-llm CLAUDE.md의 Ingest 워크플로우에 따라 처리해주세요.\n` +
        `파일명(소스 제목 참고용): ${filename}\n\n` +
        `--- 문서 내용 ---\n${content}\n--- 끝 ---\n\n` +
        `처리 순서:\n` +
        `1. 핵심 내용 파악\n` +
        `2. wiki/sources/${filename}.md 요약 페이지 생성\n` +
        `3. 관련 개념이 wiki/concepts/에 없으면 새로 생성, 있으면 보강\n` +
        `4. wiki/index.md에 링크 추가\n` +
        `5. wiki/log.md에 ingest 기록`,
        { allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"], addDirs: [WIKI_DIR], cwd: WIKI_DIR },
        (chunk) => {
          if (chunk.trim()) send({ type: "agent_message", agentId: "wiki", message: "페이지 정리 중..." });
        },
      ).then(() => {
        send({ type: "agent_done", agentId: "wiki", message: "위키에 저장했어요. 다음에 쓸 수 있어요." });
        send({ type: "complete" });
      }).catch((err: Error) => {
        send({ type: "error", message: err.message });
      }).finally(() => {
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
