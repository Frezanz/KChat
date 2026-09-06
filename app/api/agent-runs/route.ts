import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanStatus(value: unknown) {
  const v = String(value || "running");
  return ["running", "waiting_approval", "completed", "failed", "cancelled"].includes(v) ? v : "running";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const body = await request.json();
    const id = String(body.id || "").trim();
    const prompt = String(body.prompt || "").trim();
    const agentName = String(body.agentName || "Agent").trim();
    if (!id || !prompt) return NextResponse.json({ error: "id and prompt are required." }, { status: 400 });
    const status = cleanStatus(body.status);
    const sandboxId = body.sandboxId ? String(body.sandboxId) : null;
    const step = Number.isFinite(Number(body.step)) ? Math.max(0, Number(body.step)) : 0;
    const transcript = Array.isArray(body.transcript) ? body.transcript.slice(-50) : [];
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const agentId = body.agentId ? String(body.agentId) : null;
    await db.query(`
      INSERT INTO agent_runs (id,user_id,agent_id,agent_name,prompt,status,sandbox_id,step,transcript,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        agent_id=EXCLUDED.agent_id, agent_name=EXCLUDED.agent_name, status=EXCLUDED.status,
        sandbox_id=EXCLUDED.sandbox_id, step=EXCLUDED.step, transcript=EXCLUDED.transcript,
        metadata=EXCLUDED.metadata, updated_at=now()
    `, [id,user.id,agentId,agentName,prompt,status,sandboxId,step,JSON.stringify(transcript),JSON.stringify(metadata)]);
    return NextResponse.json({ ok: true, id, status, step });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent run persistence failed." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const result = await db.query(`SELECT id,agent_id,agent_name,prompt,status,sandbox_id,step,transcript,metadata,created_at,updated_at FROM agent_runs WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`, [user.id]);
    return NextResponse.json({ runs: result.rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load agent runs." }, { status: 500 });
  }
}
