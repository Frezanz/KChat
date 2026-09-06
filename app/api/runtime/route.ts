import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "e2b";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function connectSandbox(id: string) {
  if (!process.env.E2B_API_KEY) throw new Error("E2B is not configured. Add E2B_API_KEY to the KChat deployment environment.");
  return Sandbox.connect(id);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "create") {
      if (!process.env.E2B_API_KEY) return NextResponse.json({ error: "E2B is not configured. Add E2B_API_KEY to the KChat deployment environment." }, { status: 503 });
      const sandbox = await Sandbox.create();
      return NextResponse.json({ sandboxId: sandbox.sandboxId, domain: sandbox.sandboxDomain });
    }

    const sandboxId = String(body.sandboxId || "");
    if (!sandboxId) return NextResponse.json({ error: "sandboxId is required" }, { status: 400 });
    const sandbox = await connectSandbox(sandboxId);

    if (action === "run") {
      const command = String(body.command || "").trim();
      if (!command) return NextResponse.json({ error: "command is required" }, { status: 400 });
      const result = await sandbox.commands.run(command, { timeoutMs: Math.min(Number(body.timeoutMs) || 120000, 300000) });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0 });
    }

    if (action === "read") {
      const path = String(body.path || "");
      if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });
      const content = await sandbox.files.read(path);
      return NextResponse.json({ path, content });
    }

    if (action === "write") {
      const path = String(body.path || "");
      const content = String(body.content ?? "");
      if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });
      if (path.includes("..")) return NextResponse.json({ error: "Parent paths are not allowed" }, { status: 400 });
      await sandbox.files.write(path, content);
      return NextResponse.json({ path, ok: true });
    }

    if (action === "preview") {
      const port = Math.max(1, Math.min(Number(body.port) || 3000, 65535));
      return NextResponse.json({ url: sandbox.getHost(port) });
    }

    if (action === "kill") {
      await sandbox.kill();
      return NextResponse.json({ ok: true });
    }

    if (action === "info") {
      const info = await sandbox.getInfo();
      return NextResponse.json({ sandboxId: info.sandboxId, state: info.state, templateId: info.templateId, endAt: info.endAt });
    }

    return NextResponse.json({ error: "Unknown runtime action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "E2B runtime request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
