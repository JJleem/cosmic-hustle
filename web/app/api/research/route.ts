import { proxySSE } from "@/lib/backendProxy";

export const maxDuration = 300;

export async function POST(request: Request) {
  return proxySSE(request, "/api/research");
}
