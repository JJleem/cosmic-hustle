import { proxyJson } from "@/lib/backendProxy";

export async function GET(request: Request) {
  return proxyJson(request, "/api/blog/posts");
}
