import {
  isHermesAgentId,
  isLocalRequest,
  runHermesAgent,
  type HermesRunRequest,
} from "@/lib/ops/hermes";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: "local_only", message: "Hermes runs are only available from localhost." },
      { status: 403 },
    );
  }

  let body: Partial<HermesRunRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isHermesAgentId(body.agentId)) {
    return Response.json(
      { error: "invalid_agent", allowed: ["plan", "run", "wiki"] },
      { status: 400 },
    );
  }

  if (typeof body.command !== "string" || body.command.trim().length === 0) {
    return Response.json({ error: "missing_command" }, { status: 400 });
  }

  try {
    const run = await runHermesAgent({
      agentId: body.agentId,
      command: body.command.trim(),
    });
    return Response.json(run);
  } catch (error) {
    return Response.json(
      {
        error: "hermes_failed",
        message: error instanceof Error ? error.message : "Hermes command failed",
      },
      { status: 500 },
    );
  }
}
