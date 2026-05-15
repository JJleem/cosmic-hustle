import { proxyJson } from "@/lib/backendProxy";

export async function GET(request: Request) {
  return proxyJson(request, "/api/logs");
}

export async function POST(request: Request) {
  return proxyJson(request, "/api/logs");
}
