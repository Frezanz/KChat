import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "e2b";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanWorkspacePath(value: string) {
  const path = value.trim();
  if (!path) return "";
  if (path.includes("..")) throw new Error("Parent paths are not allowed");
  return path.startsWith("/") ? path : `/${path}`;
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

function gitWorkspacePath(value: unknown) {
  return cleanWorkspacePath(String(value || "/workspace/repo"));
}

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
      const path = cleanWorkspacePath(String(body.path || ""));
      if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });
      const content = await sandbox.files.read(path);
      return NextResponse.json({ path, content });
    }

    if (action === "write") {
      const path = cleanWorkspacePath(String(body.path || ""));
      const content = String(body.content ?? "");
      if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });
      await sandbox.files.write(path, content);
      return NextResponse.json({ path, ok: true });
    }

    if (action === "import_git") {
      const repoUrl = String(body.repoUrl || "").trim();
      const ref = String(body.ref || "").trim();
      const directory = cleanWorkspacePath(String(body.directory || "/workspace/repo"));
      if (!repoUrl || !/^https:\/\/github\.com\/[^\/]+\/[^\/]+(?:\.git)?$/.test(repoUrl)) return NextResponse.json({ error: "A canonical GitHub HTTPS repository URL is required" }, { status: 400 });
      const token = String(body.githubToken || "").trim();
      const cloneUrl = repoUrl.replace(/\.git$/, "");
      const envs = token ? { GITHUB_TOKEN: token, GIT_ASKPASS: "/tmp/kchat-askpass.sh", GIT_TERMINAL_PROMPT: "0" } : undefined;
      if (token) await sandbox.files.write("/tmp/kchat-askpass.sh", "#!/bin/sh\nprintf '%s\\n' \"$GITHUB_TOKEN\"\n");
      if (token) await sandbox.commands.run("chmod 700 /tmp/kchat-askpass.sh");
      const escaped = directory.replace(/'/g, "'\"'\"'");
      await sandbox.commands.run(`rm -rf '${escaped}'; mkdir -p /workspace; git clone --origin origin --no-tags ${ref ? `--branch '${ref.replace(/'/g, "'\"'\"'")}' ` : ""}${cloneUrl} '${escaped}'`, { envs, timeoutMs: 300000 });
      if (token) await sandbox.commands.run("rm -f /tmp/kchat-askpass.sh");
      return NextResponse.json({ ok: true, sandboxId, directory, repoUrl: cloneUrl, ref: ref || null });
    }

    if (action === "git_branch") {
      const cwd = gitWorkspacePath(body.directory);
      const result = await sandbox.commands.run(`cd ${shellQuote(cwd)} && git branch --show-current`, { timeoutMs: 120000 });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0 });
    }

    if (action === "git_create_branch") {
      const cwd = gitWorkspacePath(body.directory);
      const branch = String(body.branch || "").trim();
      if (!branch) return NextResponse.json({ error: "branch is required" }, { status: 400 });
      if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
        return NextResponse.json({ error: "invalid branch name" }, { status: 400 });
      }
      const result = await sandbox.commands.run(`cd ${shellQuote(cwd)} && git switch -c ${shellQuote(branch)}`, { timeoutMs: 120000 });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0, branch });
    }

    if (action === "git_add") {
      const cwd = gitWorkspacePath(body.directory);
      const paths = Array.isArray(body.paths) ? body.paths.map((value: unknown) => cleanWorkspacePath(String(value))).filter(Boolean) : [];
      const command = paths.length ? `cd ${shellQuote(cwd)} && git add -- ${paths.map(shellQuote).join(" ")}` : `cd ${shellQuote(cwd)} && git add -A`;
      const result = await sandbox.commands.run(command, { timeoutMs: 120000 });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0 });
    }

    if (action === "git_commit") {
      const cwd = gitWorkspacePath(body.directory);
      const message = String(body.message || "").trim();
      if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
      const result = await sandbox.commands.run(`cd ${shellQuote(cwd)} && git commit -m ${shellQuote(message)}`, { timeoutMs: 120000 });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0 });
    }

    if (action === "git_push") {
      const cwd = gitWorkspacePath(body.directory);
      const branch = String(body.branch || "").trim();
      const token = String(body.githubToken || "").trim();
      if (!branch) return NextResponse.json({ error: "branch is required" }, { status: 400 });
      if (!token) return NextResponse.json({ error: "githubToken is required" }, { status: 401 });
      if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
        return NextResponse.json({ error: "invalid branch name" }, { status: 400 });
      }
      const askpass = "/tmp/kchat-askpass.sh";
      const envs = { GITHUB_TOKEN: token, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: "0" };
      await sandbox.files.write(askpass, '#!/bin/sh\nprintf '%s\n' "$GITHUB_TOKEN"\n');
      await sandbox.commands.run(`chmod 700 ${shellQuote(askpass)}`);
      try {
        const result = await sandbox.commands.run(`cd ${shellQuote(cwd)} && git push --set-upstream origin ${shellQuote(branch)}`, { envs, timeoutMs: 180000 });
        return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0, branch });
      } finally {
        await sandbox.commands.run(`rm -f ${shellQuote(askpass)}`);
      }
    }

    if (action === "git_snapshot") {
      const result = await sandbox.commands.run("git status --short && printf '\n---DIFF STAT---\n' && git diff --stat && printf '\n---DIFF---\n' && git diff -- . ':!node_modules' | head -30000", { timeoutMs: 120000 });
      return NextResponse.json({ stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode ?? 0 });
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
