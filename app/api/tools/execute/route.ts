import { NextRequest, NextResponse } from "next/server";

const githubBase = "https://api.github.com";
const netlifyBase = "https://api.netlify.com/api/v1";

type Body = { tool: string; args?: Record<string, unknown>; credentials?: { githubToken?: string; netlifyToken?: string } };

function jsonError(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
async function upstream(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) }, cache: "no-store" });
  const text = await response.text();
  let data: unknown; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : `Upstream request failed (${response.status})`);
  return data;
}
function token(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function required(args: Record<string, unknown>, key: string) { const value = token(args[key]); if (!value) throw new Error(`${key} is required`); return value; }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Body;
    const args = body.args || {};
    const githubToken = token(body.credentials?.githubToken);
    const netlifyToken = token(body.credentials?.netlifyToken);
    const tool = body.tool;
    if (!tool) return jsonError("tool is required");

    if (tool.startsWith("e2b_git_")) {
      const sandboxId = required(args, "sandboxId");
      const action = tool.slice("e2b_".length);
      const payload: Record<string, unknown> = { action, sandboxId, directory: token(args.directory) || "/workspace/repo" };
      if (action === "git_create_branch" || action === "git_push") payload.branch = required(args, "branch");
      if (action === "git_commit") payload.message = required(args, "message");
      if (action === "git_add") payload.paths = Array.isArray(args.paths) ? args.paths : [];
      if (action === "git_push") payload.githubToken = githubToken;
      const runtimeUrl = new URL("/api/runtime", request.url);
      const response = await fetch(runtimeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await response.text();
      let data: unknown; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!response.ok) return NextResponse.json(data, { status: response.status });
      return NextResponse.json(data);
    }

    if (tool.startsWith("github_")) {
      if (!githubToken) return jsonError("Connect GitHub first.", 401);
      if (tool === "github_list_repositories" && token(args.action) === "import_to_e2b") {
        const owner = required(args, "owner");
        const repo = required(args, "repo");
        const sandboxId = required(args, "sandboxId");
        const repoUrl = `https://github.com/${owner}/${repo}.git`;
        const runtimeUrl = new URL("/api/runtime", request.url);
        const runtimeResponse = await fetch(runtimeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import_git", sandboxId, repoUrl, ref: token(args.ref), directory: token(args.directory) || "/workspace/repo", githubToken }) });
        const runtimeText = await runtimeResponse.text();
        let runtimeData: unknown; try { runtimeData = runtimeText ? JSON.parse(runtimeText) : null; } catch { runtimeData = runtimeText; }
        if (!runtimeResponse.ok) return NextResponse.json(runtimeData, { status: runtimeResponse.status });
        return NextResponse.json(runtimeData);
      }
      const headers = { Authorization: `Bearer ${githubToken}`, "X-GitHub-Api-Version": "2022-11-28" };
      if (tool === "github_list_repositories") return NextResponse.json(await upstream(`${githubBase}/user/repos?per_page=100&sort=updated`, { headers }));
      if (tool === "github_read_file") {
        const owner = required(args, "owner"), repo = required(args, "repo"), path = required(args, "path"), ref = token(args.ref);
        const url = `${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
        const data = await upstream(url, { headers }) as { content?: string; encoding?: string; sha?: string; path?: string };
        if (data.encoding === "base64" && data.content) data.content = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
        return NextResponse.json(data);
      }
      if (tool === "github_write_file") {
        const owner = required(args, "owner"), repo = required(args, "repo"), path = required(args, "path"), content = token(args.content), message = required(args, "message");
        const branch = token(args.branch) || "main"; const sha = token(args.sha);
        const url = `${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
        return NextResponse.json(await upstream(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message, content: Buffer.from(content, "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) }) }));
      }
      if (tool === "github_commit_multiple_files") {
        const owner = required(args, "owner"), repo = required(args, "repo"), branch = required(args, "branch"), message = required(args, "message");
        const baseBranch = token(args.base_branch) || "main";
        const upserts = Array.isArray(args.upserts) ? args.upserts as Array<{ path?: unknown; content?: unknown }> : [];
        const deletes = Array.isArray(args.deletes) ? args.deletes.map((value) => String(value)) : [];
        if (!upserts.length && !deletes.length) throw new Error("upserts or deletes are required");
        const refPath = `${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`;
        let baseSha: string;
        try { const ref = await upstream(refPath, { headers }) as { object?: { sha?: string } }; baseSha = String(ref.object?.sha || ""); }
        catch { const source = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(baseBranch)}`, { headers }) as { object?: { sha?: string } }; baseSha = String(source.object?.sha || ""); if (!baseSha) throw new Error("Could not resolve the base branch."); await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }) }); }
        const baseCommit = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(baseSha)}`, { headers }) as { tree?: { sha?: string } };
        const treeItems: Array<Record<string, string>> = [];
        for (const item of upserts) { const path = token(item.path); if (!path) throw new Error("Each upsert needs a path."); const blob = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ content: String(item.content ?? ""), encoding: "utf-8" }) }) as { sha?: string }; treeItems.push({ path, mode: "100644", type: "blob", sha: String(blob.sha || "") }); }
        for (const path of deletes) treeItems.push({ path, mode: "100644", type: "blob", sha: "" });
        const tree = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: baseCommit.tree?.sha, tree: treeItems }) }) as { sha?: string };
        const commit = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }) }) as { sha?: string; html_url?: string };
        await upstream(refPath, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sha: commit.sha, force: false }) });
        return NextResponse.json({ commitSha: commit.sha, commitUrl: commit.html_url, branch });
      }
      if (tool === "github_create_branch") { const owner = required(args, "owner"), repo = required(args, "repo"), branch = required(args, "branch"), from = required(args, "from"); const base = await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(from)}`, { headers }) as { object: { sha: string } }; return NextResponse.json(await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }) })); }
      if (tool === "github_get_pull_request") { const owner = required(args, "owner"), repo = required(args, "repo"), pullNumber = required(args, "pull_number"); return NextResponse.json(await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(pullNumber)}`, { headers })); }
      if (tool === "github_list_checks") { const owner = required(args, "owner"), repo = required(args, "repo"), ref = required(args, "ref"); return NextResponse.json(await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/check-runs?per_page=100`, { headers })); }
      if (tool === "github_create_pull_request") { const owner = required(args, "owner"), repo = required(args, "repo"), head = required(args, "head"), base = required(args, "base"), title = required(args, "title"); return NextResponse.json(await upstream(`${githubBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ head, base, title, body: token(args.body), draft: args.draft === true }) })); }
      return jsonError(`Unknown GitHub tool: ${tool}`, 404);
    }
    if (tool.startsWith("netlify_")) {
      if (!netlifyToken) return jsonError("Connect Netlify first.", 401);
      const headers = { Authorization: `Bearer ${netlifyToken}` };
      if (tool === "netlify_list_sites") return NextResponse.json(await upstream(`${netlifyBase}/sites?per_page=100`, { headers }));
      if (tool === "netlify_get_site") return NextResponse.json(await upstream(`${netlifyBase}/sites/${encodeURIComponent(required(args, "siteId"))}`, { headers }));
      if (tool === "netlify_list_deploys") return NextResponse.json(await upstream(`${netlifyBase}/sites/${encodeURIComponent(required(args, "siteId"))}/deploys?per_page=100`, { headers }));
      if (tool === "netlify_get_deploy") return NextResponse.json(await upstream(`${netlifyBase}/sites/${encodeURIComponent(required(args, "siteId"))}/deploys/${encodeURIComponent(required(args, "deployId"))}`, { headers }));
      if (tool === "netlify_trigger_build") { const siteId = required(args, "siteId"); const query = new URLSearchParams(); if (token(args.branch)) query.set("branch", token(args.branch)); if (args.clear_cache === true) query.set("clear_cache", "true"); if (token(args.title)) query.set("title", token(args.title)); return NextResponse.json(await upstream(`${netlifyBase}/sites/${encodeURIComponent(siteId)}/builds${query.toString() ? `?${query}` : ""}`, { method: "POST", headers })); }
      return jsonError(`Unknown Netlify tool: ${tool}`, 404);
    }
    return jsonError(`Unknown tool: ${tool}`, 404);
  } catch (error) { return jsonError(error instanceof Error ? error.message : "Tool execution failed", 500); }
}
