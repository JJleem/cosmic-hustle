export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Forward a request to FastAPI, returning the raw Response. */
export async function proxyTo(request: Request, backendPath: string): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = `${BACKEND_URL}${backendPath}${url.search}`;

  const isGet = request.method === "GET" || request.method === "HEAD";
  const body = isGet ? undefined : await request.text();

  const headers: Record<string, string> = {};
  if (!isGet) headers["Content-Type"] = "application/json";

  return fetch(targetUrl, { method: request.method, headers, body });
}

/** Proxy a regular JSON endpoint — returns a Next.js Response with JSON body. */
export async function proxyJson(request: Request, backendPath: string): Promise<Response> {
  const upstream = await proxyTo(request, backendPath);
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Proxy an SSE endpoint — streams the body directly to the client. */
export async function proxySSE(request: Request, backendPath: string): Promise<Response> {
  const upstream = await proxyTo(request, backendPath);
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "backend unavailable" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
