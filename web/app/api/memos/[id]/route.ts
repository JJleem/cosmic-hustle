import { proxyJson } from "@/lib/backendProxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJson(request, `/api/memos/${id}`);
}
