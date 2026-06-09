import { isLocalRequest } from "@/lib/ops/hermes";
import {
  getHermesWorkflowHistory,
  runHermesWorkflow,
  type HermesWorkflowRequest,
} from "@/lib/ops/hermesWorkflow";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: "local_only", message: "Hermes workflows are only available from localhost." },
      { status: 403 },
    );
  }

  const history = await getHermesWorkflowHistory();
  return Response.json(history);
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: "local_only", message: "Hermes workflows are only available from localhost." },
      { status: 403 },
    );
  }

  let body: Partial<HermesWorkflowRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.goal !== "string" || body.goal.trim().length === 0) {
    return Response.json({ error: "missing_goal" }, { status: 400 });
  }

  try {
    const workflow = await runHermesWorkflow({
      goal: body.goal.trim(),
      maxSteps: body.maxSteps,
    });
    return Response.json(workflow);
  } catch (error) {
    return Response.json(
      {
        error: "workflow_failed",
        message: error instanceof Error ? error.message : "Hermes workflow failed",
      },
      { status: 500 },
    );
  }
}
