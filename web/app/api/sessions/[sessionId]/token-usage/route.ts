import { proxyJson } from "@/lib/backendProxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  return proxyJson(request, `/api/sessions/${sessionId}/token-usage`);
}
