import { proxyJson } from "@/lib/backendProxy";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return proxyJson(request, `/api/blog/posts/${slug}`);
}
