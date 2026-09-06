import { NextResponse } from "next/server";

export const runtime = "nodejs";

function assertPublicHttpUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Endpoint URL is invalid."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS endpoints are supported.");
  const host = url.hostname.toLowerCase();
  const blocked = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || host.startsWith("169.254.");
  if (blocked) throw new Error("Private/local endpoints are not available through the hosted connector. Use a public HTTPS endpoint or a local agent.");
  return url;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const connection = body?.connection;
    const args = body?.args && typeof body.args === "object" ? body.args : {};
    if (!connection?.url || !connection?.method) return NextResponse.json({ error: "Invalid API connection." }, { status: 400 });
    const url = assertPublicHttpUrl(connection.url);
    const method = String(connection.method).toUpperCase();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(connection.headers || {})) { if (typeof value === "string") headers[key] = value; }
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30000) };
    if (["GET", "DELETE"].includes(method)) {
      for (const [key, value] of Object.entries(args as Record<string, unknown>)) { if (value !== undefined && value !== null) url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value)); }
    } else {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      init.body = JSON.stringify(args);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    if (text.length > 1000000) return NextResponse.json({ error: "API response exceeded the 1 MB connector limit." }, { status: 413 });
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) return NextResponse.json({ error: `Upstream API returned ${response.status}.`, status: response.status, data }, { status: 502 });
    return NextResponse.json({ status: response.status, data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connector request failed." }, { status: 500 });
  }
}
