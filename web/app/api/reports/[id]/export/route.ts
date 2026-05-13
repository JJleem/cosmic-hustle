import { type NextRequest } from "next/server";
import { BACKEND_URL } from "@/lib/backendProxy";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/reports/${id}/export?format=${format}`);
  } catch {
    return new Response("Backend unavailable", { status: 503 });
  }

  if (!upstream.ok) {
    return new Response(await upstream.text(), { status: upstream.status });
  }

  const blob = await upstream.arrayBuffer();
  return new Response(blob, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
