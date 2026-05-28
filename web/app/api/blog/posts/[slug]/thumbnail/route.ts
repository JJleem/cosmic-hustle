import { proxyJson } from "@/lib/backendProxy";

// PATCH: thumbnail_url 직접 교체
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // slug로 post_id를 먼저 조회한 뒤 PATCH해야 하므로 백엔드에 slug 기반 PATCH를 씀
  // 백엔드 PATCH /api/blog/posts/{post_id} 대신 slug 기반을 위해 아래처럼 처리
  const body = await request.json();

  // 1. slug로 post 조회
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const getRes = await fetch(`${backendUrl}/api/blog/posts/${slug}`);
  if (!getRes.ok) return new Response("Not found", { status: 404 });
  const post = await getRes.json();

  // 2. post.id로 PATCH
  const patchRes = await fetch(`${backendUrl}/api/blog/posts/${post.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await patchRes.json();
  return new Response(JSON.stringify(data), {
    status: patchRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
