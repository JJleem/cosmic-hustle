import { proxyJson } from "@/lib/backendProxy";

export async function POST(request: Request) {
  return proxyJson(request, "/api/wiki/ingest-local");
}
