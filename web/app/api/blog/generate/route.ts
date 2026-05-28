import { proxyJson } from "@/lib/backendProxy";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agent_id");
  return proxyJson(request, `/api/blog/generate${agentId ? `?agent_id=${agentId}` : ""}`);
}
