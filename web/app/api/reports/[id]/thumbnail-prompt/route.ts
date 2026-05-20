import { proxySSE } from "@/lib/backendProxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxySSE(request, `/api/reports/${id}/thumbnail-prompt`);
}
