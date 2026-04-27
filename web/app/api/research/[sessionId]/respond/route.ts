import { pendingResponses } from "../../route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const body = await request.json() as { response?: string };
  const resolver = pendingResponses.get(sessionId);
  if (!resolver) {
    return Response.json({ ok: false, error: "대기 중인 요청 없음" }, { status: 404 });
  }
  resolver(body.response?.trim() ?? "");
  return Response.json({ ok: true });
}
