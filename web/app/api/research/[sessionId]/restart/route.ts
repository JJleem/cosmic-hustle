import { proxySSE } from "@/lib/backendProxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return proxySSE(request, `/api/research/${sessionId}/restart`);
}
