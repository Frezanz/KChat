"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ShieldCheck,
  ChevronDown,
  Copy,
  Download,
  FileText,
  KeyRound,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Moon,
  Trash2,
  UserRound,
  X,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Plug,
  Github,
  Globe2,
  Code2,
  Terminal,
  FolderTree,
  MonitorPlay,
  Bot,
  Play,
  GitBranch,
  Command,
  PanelTop,
  SplitSquareHorizontal,
} from "lucide-react";

type Role = "user" | "assistant";
type WorkspaceMode = "chat" | "code" | "agent";
type Message = { id: string; role: Role; content: string };
type ContextMode = "isolated" | "connected" | "global";
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number; contextMode: ContextMode; connectedChats: string[]; connectionIds: string[]; modelId?: string };
type Settings = { model: string; system: string; temperature: number; maxOutputTokens: number; enterToSend: boolean; showActivityLog: boolean; persistChats: boolean; persistSettings: boolean };
type ModelConnection = { id: string; name: string; provider: string; baseUrl: string; protocol: "responses" | "chat"; model: string; apiKey: string; authHeader: string; authPrefix: string };
type ApiConnection = { id: string; kind: "api"; name: string; description: string; url: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; headers: Record<string, string>; inputSchema: Record<string, unknown> };
type McpConnection = { id: string; kind: "mcp"; name: string; description: string; serverUrl: string; headers: Record<string, string>; requireApproval: "always" | "never" };
type Connection = ApiConnection | McpConnection;
type RuntimeStatus = "disconnected" | "starting" | "ready" | "error";

type AgentDefinition = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  modelId: string;
  tools: string[];
  memory: "none" | "conversation" | "persistent";
  approval: "always" | "sensitive" | "never";
  enabled: boolean;
};

const AGENTS_STORAGE = "kchat-agents-v1";
const DEFAULT_AGENT: AgentDefinition = {
  id: "", name: "New Agent", description: "A focused AI teammate.",
  instructions: "You are a capable AI agent. Plan before acting, use available tools carefully, and report what you changed.",
  modelId: "", tools: [], memory: "conversation", approval: "sensitive", enabled: true
};


const KEY = "kchat-api-key";
const MODEL_CONNECTIONS = "kchat-model-connections-v1";
const ACTIVE_MODEL = "kchat-active-model-v1";
const GRID_MAX = 16;
const CHATS = "kchat-chats-v3";
const SETTINGS = "kchat-settings-v3";
const CONNECTIONS = "kchat-connections-v1";
const DEFAULT_SETTINGS: Settings = {
  model: "gpt-6",
  temperature: 0.7,
  maxOutputTokens: 4096,
  system: "You are KChat, a capable, thoughtful AI assistant. Be clear, useful, and concise.",
  enterToSend: true,
  showActivityLog: true,
  persistChats: true,
  persistSettings: true,
};


const MODEL_PRESETS: Record<string, Partial<ModelConnection>> = {
  OpenAI: { baseUrl: "https://api.openai.com/v1", protocol: "responses", model: "gpt-5.6-luna", authHeader: "Authorization", authPrefix: "Bearer" },
  Gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", protocol: "chat", model: "gemini-3.8-flash", authHeader: "Authorization", authPrefix: "Bearer" },
  OpenRouter: { baseUrl: "https://openrouter.ai/api/v1", protocol: "chat", model: "openai/gpt-5.4-pro", authHeader: "Authorization", authPrefix: "Bearer" },
  Groq: { baseUrl: "https://api.groq.com/openai/v1", protocol: "responses", model: "openai/gpt-oss-120b", authHeader: "Authorization", authPrefix: "Bearer" },
  Mistral: { baseUrl: "https://api.mistral.ai/v1", protocol: "chat", model: "mistral-large-latest", authHeader: "Authorization", authPrefix: "Bearer" },
  Custom: { baseUrl: "", protocol: "chat", model: "", authHeader: "Authorization", authPrefix: "Bearer" },
};

function modelEndpoint(connection: ModelConnection) {
  const base = connection.baseUrl.trim().replace(/\/$/, "");
  if (/\/(chat\/completions|responses)$/i.test(base)) return base;
  return `${base}/${connection.protocol === "responses" ? "responses" : "chat/completions"}`;
}

function modelHeaders(connection: ModelConnection) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (connection.apiKey) headers[connection.authHeader || "Authorization"] = connection.authPrefix ? `${connection.authPrefix} ${connection.apiKey}` : connection.apiKey;
  if (connection.provider.toLowerCase() === "gemini") {
    headers["x-goog-api-client"] = "kchat/1.0.0";
  }
  return headers;
}

async function modelError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.message || data?.error;
    if (typeof message === "string" && message.trim()) return message;
  } catch {}
  return text.trim() || `Request failed (${response.status})`;
}

const starters = [
  { icon: "✦", title: "Create something", text: "Help me turn an idea into a useful product. Start by asking the most important questions." },
  { icon: "◈", title: "Learn deeply", text: "Teach me a difficult concept from first principles, with intuition, examples, and a practical exercise." },
  { icon: "⌁", title: "Think clearly", text: "Challenge my assumptions and help me reason through a difficult decision without sugarcoating it." },
  { icon: "↗", title: "Build a plan", text: "Build me a realistic step-by-step plan for achieving an ambitious goal with limited resources." },
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeChat(): Chat {
  return { id: uid(), title: "New conversation", messages: [], updatedAt: Date.now(), contextMode: "isolated", connectedChats: [], connectionIds: [], modelId: undefined };
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function repairMojibake(value: string) {
  return value
    .replace(/\u00e2\u0080\u0094/g, "—")
    .replace(/\u00e2\u0080\u0093/g, "–")
    .replace(/\u00e2\u0080\u0098/g, "‘")
    .replace(/\u00e2\u0080\u0099/g, "’")
    .replace(/\u00e2\u0080\u009c/g, "“")
    .replace(/\u00e2\u0080\u009d/g, "”")
    .replace(/\u00e2\u0080\xa2/g, "•")
    .replace(/\u00e2\u0080\xa6/g, "…")
    .replace(/\u00e2\u008c\x98/g, "⌘")
    .replace(/\u00e2\x9c\xa6/g, "✦")
    .replace(/\u00e2\x97\x88/g, "◈")
    .replace(/\u00e2\x8c\x81/g, "⌁")
    .replace(/\u00e2\x86\x97/g, "↗")
    .replace(/\u00c2·/g, "·");
}

function getKey() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(KEY) || "";
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>(() => load(CHATS, [makeChat()]));
  const [activeId, setActiveId] = useState("");
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...load(SETTINGS, {}) }));
  const [settingsTab, setSettingsTab] = useState<"model" | "behavior" | "privacy">("model");
  const [apiKey, setApiKey] = useState("");
  const [modelConnections, setModelConnections] = useState<ModelConnection[]>([]);
  const [activeModelId, setActiveModelId] = useState("");
  const [modelForm, setModelForm] = useState<ModelConnection>({ id: "", name: "", provider: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "responses", model: "gpt-5.6-luna", apiKey: "", authHeader: "Authorization", authPrefix: "Bearer" });
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [keyTesting, setKeyTesting] = useState(false);
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; time: string; type: "info" | "success" | "error"; text: string }>>([]);
  const [dark, setDark] = useState(true);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<{ email: string } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [netlifyToken, setNetlifyToken] = useState("");
  const [integrationStatus, setIntegrationStatus] = useState<{ github: string; netlify: string }>({ github: "", netlify: "" });
  const [chatSettingsId, setChatSettingsId] = useState<string | null>(null);
  const [contextModeOpen, setContextModeOpen] = useState(false);
  const [attachedName, setAttachedName] = useState("");
  const [attachedText, setAttachedText] = useState("");
  const [gridOpen, setGridOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("chat");
  const [codePane, setCodePane] = useState<"files" | "terminal" | "browser" | "agent">("files");
  const [codeCommand, setCodeCommand] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("disconnected");
  const [sandboxId, setSandboxId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [runtimeFileContent, setRuntimeFileContent] = useState("");
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [agentBuilderOpen, setAgentBuilderOpen] = useState(false);
  const [agentDraft, setAgentDraft] = useState<AgentDefinition>(DEFAULT_AGENT);
  const [agentTestOutput, setAgentTestOutput] = useState("");
  const [agentTestPrompt, setAgentTestPrompt] = useState("");
  const [agentRunOutput, setAgentRunOutput] = useState("");
  const [pendingAgentApproval, setPendingAgentApproval] = useState<{ tool: string; args: Record<string, unknown> } | null>(null);
  const agentApprovalResolver = useRef<((approved: boolean) => void) | null>(null);

  const [codeProject, setCodeProject] = useState("KChat");
  const [codeFile, setCodeFile] = useState("app/page.tsx");
  const [codeLog, setCodeLog] = useState<string[]>(["Workspace ready.", "Project folder: KChat", "No local terminal attached — connect a workspace agent to execute commands."]);
  const [gridIds, setGridIds] = useState<string[]>([]);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [gridDrafts, setGridDrafts] = useState<Record<string, string>>({});
  const [gridSending, setGridSending] = useState<Record<string, boolean>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionTab, setConnectionTab] = useState<"api" | "mcp">("api");
  const [connectionFormOpen, setConnectionFormOpen] = useState(false);
  const [apiForm, setApiForm] = useState({ name: "", description: "", url: "", method: "GET" as ApiConnection["method"], headers: "{}", inputSchema: '{"type":"object","properties":{}}' });
  const [mcpForm, setMcpForm] = useState({ name: "", description: "", serverUrl: "", headers: "{}", requireApproval: "never" as McpConnection["requireApproval"] });
  const [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    setGithubToken(sessionStorage.getItem("kchat-github-token") || "");
    setNetlifyToken(sessionStorage.getItem("kchat-netlify-token") || "");
    try {
      const raw = sessionStorage.getItem(CONNECTIONS);
      if (raw) setConnections(JSON.parse(raw) as Connection[]);
      const modelRaw = sessionStorage.getItem(MODEL_CONNECTIONS);
      const legacyKey = sessionStorage.getItem(KEY) || "";
      const savedModels = modelRaw ? JSON.parse(modelRaw) as ModelConnection[] : [];
      if (savedModels.length) {
        setModelConnections(savedModels);
        const savedActive = sessionStorage.getItem(ACTIVE_MODEL) || savedModels[0].id;
        const selected = savedModels.find((item) => item.id === savedActive) || savedModels[0];
        setActiveModelId(selected.id); setApiKey(selected.apiKey); setSettings((prev) => ({ ...prev, model: selected.model }));
      } else if (legacyKey) {
        const legacy: ModelConnection = { id: uid(), name: "OpenAI", provider: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "responses", model: settings.model, apiKey: legacyKey, authHeader: "Authorization", authPrefix: "Bearer" };
        setModelConnections([legacy]); setActiveModelId(legacy.id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    sessionStorage.setItem(CONNECTIONS, JSON.stringify(connections));
  }, [connections]);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data?.user) setProfileUser(data.user); }).catch(() => {});
  }, []);
  const gridAbortRef = useRef<Record<string, AbortController | null>>({});
  const abortRef = useRef<Record<string, AbortController | null>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setChats(prev => prev.map(chat => ({ ...chat, contextMode: chat.contextMode || "isolated", connectedChats: chat.connectedChats || [], connectionIds: chat.connectionIds || [], modelId: chat.modelId || undefined })));
  }, []);

  useEffect(() => {
    if (!activeId && chats[0]) setActiveId(chats[0].id);
    setApiKey(getKey());
  }, [chats, activeId]);

  useEffect(() => {
    if (settings.persistChats) localStorage.setItem(CHATS, JSON.stringify(chats));
    else localStorage.removeItem(CHATS);
  }, [chats, settings.persistChats]);

  useEffect(() => {
    if (activeId) {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }, [activeId]);

  useEffect(() => {
    if (settings.persistSettings) localStorage.setItem(SETTINGS, JSON.stringify(settings));
    else localStorage.removeItem(SETTINGS);
  }, [settings]);

  useEffect(() => {
    try { const raw = localStorage.getItem(AGENTS_STORAGE); if (raw) setAgents(JSON.parse(raw)); } catch {}
  }, []);
  useEffect(() => { localStorage.setItem(AGENTS_STORAGE, JSON.stringify(agents)); }, [agents]);


  const active = chats.find((chat) => chat.id === activeId) || chats[0] || makeChat();
  const activeModel = modelConnections.find((connection) => connection.id === activeModelId) || modelConnections[0] || null;
  function modelForChat(chat: Chat) {
    return (chat.modelId ? modelConnections.find((connection) => connection.id === chat.modelId) : null) || activeModel;
  }
  const visibleChats = useMemo(
    () => chats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())),
    [chats, query],
  );

  async function runtimeRequest(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sandboxId, ...payload }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Runtime request failed (${response.status})`);
    return data;
  }

  async function startRuntime() {
    if (runtimeStatus === "starting") return;
    try {
      setRuntimeStatus("starting");
      const saved = sessionStorage.getItem("kchat-e2b-sandbox-id") || "";
      if (saved) {
        try {
          const data = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "info", sandboxId: saved }) }).then(async (r) => ({ ok: r.ok, data: await r.json() }));
          if (data.ok) { setSandboxId(saved); setRuntimeStatus("ready"); setCodeLog((prev) => [...prev, `E2B sandbox reconnected: ${saved.slice(0, 10)}…`]); return; }
        } catch {}
      }
      const response = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create E2B sandbox");
      setSandboxId(data.sandboxId);
      sessionStorage.setItem("kchat-e2b-sandbox-id", data.sandboxId);
      setRuntimeStatus("ready");
      setCodeLog((prev) => [...prev, `E2B sandbox ready: ${String(data.sandboxId).slice(0, 10)}…`]);
    } catch (e) {
      setRuntimeStatus("error");
      setCodeLog((prev) => [...prev, `E2B error: ${e instanceof Error ? e.message : "Unable to start sandbox"}`]);
    }
  }

  async function runRuntimeCommand() {
    const value = codeCommand.trim();
    if (!value) return;
    try {
      if (!sandboxId || runtimeStatus !== "ready") await startRuntime();
      const id = sandboxId || sessionStorage.getItem("kchat-e2b-sandbox-id") || "";
      if (!id) throw new Error("E2B sandbox is not available");
      const response = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: id, command: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Command failed");
      setCodeLog((prev) => [...prev, `$ ${value}`, data.stdout || "(no stdout)", ...(data.stderr ? [`stderr: ${data.stderr}`] : []), `exit code: ${data.exitCode}`]);
      setCodeCommand("");
      setSandboxId(id); setRuntimeStatus("ready");
    } catch (e) {
      setCodeLog((prev) => [...prev, `Command error: ${e instanceof Error ? e.message : "Command failed"}`]);
    }
  }

  async function readRuntimeFile(path: string) {
    if (!sandboxId || runtimeStatus !== "ready") return;
    try {
      const data = await runtimeRequest("read", { path });
      setRuntimeFileContent(String(data.content || ""));
      setCodeLog((prev) => [...prev, `Read ${path}`]);
    } catch (e) {
      setCodeLog((prev) => [...prev, `Read error: ${e instanceof Error ? e.message : "Unable to read file"}`]);
    }
  }

  async function saveRuntimeFile(path: string, content: string) {
    try {
      if (!sandboxId || runtimeStatus !== "ready") await startRuntime();
      const id = sandboxId || sessionStorage.getItem("kchat-e2b-sandbox-id") || "";
      if (!id) throw new Error("E2B sandbox is not available");
      const response = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "write", sandboxId: id, path, content }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save file");
      setSandboxId(id); setRuntimeStatus("ready");
      setCodeLog((prev) => [...prev, `Saved ${path}`]);
    } catch (e) {
      setCodeLog((prev) => [...prev, `Save error: ${e instanceof Error ? e.message : "Unable to save file"}`]);
    }
  }

  async function openRuntimePreview() {
    try {
      if (!sandboxId || runtimeStatus !== "ready") await startRuntime();
      const id = sandboxId || sessionStorage.getItem("kchat-e2b-sandbox-id") || "";
      if (!id) throw new Error("E2B sandbox is not available");
      const response = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", sandboxId: id, port: 3000 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create preview URL");
      setPreviewUrl(data.url); setCodeLog((prev) => [...prev, `Preview: ${data.url}`]);
    } catch (e) { setCodeLog((prev) => [...prev, `Preview error: ${e instanceof Error ? e.message : "Unable to open preview"}`]); }
  }

  async function stopRuntime() {
    if (!sandboxId) return;
    try { await runtimeRequest("kill"); } catch {}
    sessionStorage.removeItem("kchat-e2b-sandbox-id");
    setSandboxId(""); setPreviewUrl(""); setRuntimeStatus("disconnected");
    setCodeLog((prev) => [...prev, "E2B sandbox stopped."]);
  }

  function openGrid() {
    setGridIds((prev) => {
      if (prev.length) return prev;
      return chats.slice(0, Math.min(GRID_MAX, chats.length)).map((chat) => chat.id);
    });
    setGridOpen(true);
    setMobileOpen(false);
  }

  function addGridChat(id: string) {
    setGridIds((prev) => prev.includes(id) || prev.length >= GRID_MAX ? prev : [...prev, id]);
  }

  function removeGridChat(id: string) {
    if (fullscreenId === id) setFullscreenId(null);
    setGridIds((prev) => prev.filter((item) => item !== id));
  }

  function setChatModel(chatId: string, modelId: string) {
    setChats((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, modelId: modelId || undefined, updatedAt: Date.now() } : chat));
  }

  async function runAllGridChats() {
    const targets = gridIds.filter((id) => (gridDrafts[id] || "").trim() && !gridSending[id]);
    if (!targets.length) return;
    const missing = targets.some((id) => !modelForChat(chats.find((chat) => chat.id === id)!));
    if (missing) { setKeyOpen(true); return; }
    await Promise.all(targets.map((id) => sendGrid(id)));
  }

  function updateChatById(chatId: string, messages: Message[], title?: string) {
    setChats((prev) => prev.map((chat) => chat.id === chatId
      ? { ...chat, messages, title: title ?? chat.title, updatedAt: Date.now() }
      : chat));
  }

  function contextMessages(chat: Chat, history: Message[]) {
    const sources = chat.contextMode === "global"
      ? chats.filter((item) => item.id !== chat.id)
      : chat.contextMode === "connected"
        ? chats.filter((item) => chat.connectedChats.includes(item.id))
        : [];
    if (!sources.length) return history;
    const context = sources.flatMap((source) => source.messages.slice(-12).map((m) => ({
      role: m.role,
      content: `[Context from ${source.title}] ${m.content}`,
    })));
    return [...context, ...history];
  }

  function parseJsonObject(value: string, label: string) {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
    return parsed as Record<string, unknown>;
  }

  function toolName(connection: ApiConnection) {
    const base = `api_${connection.name}_${connection.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return base.slice(0, 64);
  }

  function attachedConnections(chat: Chat) {
    return connections.filter((connection) => chat.connectionIds?.includes(connection.id));
  }

  function buildTools(chat: Chat) {
    return attachedConnections(chat).map((connection) => connection.kind === "mcp"
      ? {
          type: "mcp",
          server_label: connection.name.slice(0, 64),
          server_url: connection.serverUrl,
          ...(Object.keys(connection.headers).length ? { headers: connection.headers } : {}),
          require_approval: connection.requireApproval,
          ...(connection.description ? { server_description: connection.description } : {}),
        }
      : {
          type: "function",
          name: toolName(connection),
          description: connection.description || `Call the ${connection.name} API.`,
          parameters: connection.inputSchema,
          strict: false,
        });
  }

  async function executeApiConnection(connection: ApiConnection, args: Record<string, unknown>, signal: AbortSignal) {
    const response = await fetch("/api/connectors/api", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection, args }),
    });
    const data = await response.json().catch(() => ({ error: "Invalid connector response." }));
    if (!response.ok) throw new Error(data?.error || `API tool failed (${response.status})`);
    return data;
  }

  async function runConfiguredAgent(agent: AgentDefinition, prompt: string) {
    const model = modelConnections.find(m => m.id === agent.modelId) || activeModel;
    if (!model) throw new Error("Connect a model before running the agent.");
    const controller = new AbortController();
    const fakeChat: Chat = { id: "agent-runtime", title: agent.name, messages: [], updatedAt: Date.now(), contextMode: "isolated", connectedChats: [], connectionIds: [] };
    let sandbox = sandboxId || sessionStorage.getItem("kchat-e2b-sandbox-id") || "";
    const transcript: string[] = [];
    const maxSteps = 10;
    const hasConnector = agent.tools.some(tool => ["GitHub", "Netlify", "API tools"].includes(tool));

    if (agent.tools.includes("Code runtime")) {
      if (!sandbox) {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not create E2B sandbox");
        sandbox = String(d.sandboxId);
        sessionStorage.setItem("kchat-e2b-sandbox-id", sandbox);
        setSandboxId(sandbox);
        setRuntimeStatus("ready");
        transcript.push(`sandbox created: ${sandbox.slice(0, 10)}…`);
      }
    }

    const customApis = connections.filter((connection): connection is ApiConnection => connection.kind === "api");
    const enabledConnectorTools = [
      ...(agent.tools.includes("GitHub") ? ["github_list_repositories", "github_read_file", "github_write_file", "github_create_branch", "github_commit_multiple_files", "github_create_pull_request", "github_get_pull_request", "github_list_checks"] : []),
      ...(agent.tools.includes("Netlify") ? ["netlify_list_sites", "netlify_get_site", "netlify_list_deploys", "netlify_get_deploy", "netlify_trigger_build"] : []),
      ...(agent.tools.includes("API tools") ? customApis.map(connection => `custom_api:${connection.id}`) : []),
    ];

    async function executeAgentConnector(action: any) {
      const tool = String(action.tool || "");
      if (!tool) throw new Error("external_tool requires a tool name.");
      const args = action.args && typeof action.args === "object" ? action.args : {};
      const destructive = tool.includes("write") || tool.includes("create_branch") || tool.includes("commit_multiple_files") || tool.includes("create_pull_request") || tool.includes("trigger_build");
      if (destructive && agent.approval !== "never") {
        const approved = await new Promise<boolean>((resolve) => {
          agentApprovalResolver.current = resolve;
          setPendingAgentApproval({ tool, args });
        });
        setPendingAgentApproval(null);
        agentApprovalResolver.current = null;
        if (!approved) throw new Error(`User denied approval for ${tool}.`);
      }

      if (tool.startsWith("custom_api:")) {
        const connection = customApis.find(item => item.id === tool.slice("custom_api:".length));
        if (!connection) throw new Error("The selected API connection is no longer available.");
        const result = await executeApiConnection(connection, args, controller.signal);
        transcript.push(`API ${connection.name}:\n${JSON.stringify(result).slice(0, 12000)}`);
        return result;
      }

      if (tool.startsWith("github_") || tool.startsWith("netlify_")) {
        const github = sessionStorage.getItem("kchat-github-token") || "";
        const netlify = sessionStorage.getItem("kchat-netlify-token") || "";
        const credentials = tool.startsWith("github_") ? { githubToken: github } : { netlifyToken: netlify };
        const response = await fetch("/api/tools/execute", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, args, credentials }),
        });
        const data = await response.json().catch(() => ({ error: "Invalid connector response." }));
        if (!response.ok) throw new Error(data?.error || `${tool} failed (${response.status})`);
        transcript.push(`${tool}:\n${JSON.stringify(data).slice(0, 12000)}`);
        return data;
      }
      throw new Error(`Unsupported external tool: ${tool}`);
    }

    let task = prompt.trim();
    for (let step = 1; step <= maxSteps; step++) {
      const instruction = `${agent.instructions}\n\nYou are operating as an autonomous coding/product agent. Step ${step}/${maxSteps}.\nAvailable configured tools: ${agent.tools.join(", ") || "none"}.\n${agent.tools.includes("Code runtime") ? "E2B runtime is available. You may inspect, edit and run the workspace." : "No code runtime is available."}\n${hasConnector ? `External connector tools available: ${enabledConnectorTools.join(", ")}. For custom APIs use tool=custom_api:<connectionId>. GitHub workflow: inspect the repository, create a feature branch with github_commit_multiple_files (base_branch=main), inspect the commit/diff, create a pull request, then use github_get_pull_request and github_list_checks to report CI status. Never merge automatically.` : "No external connectors are enabled."}\n${agent.tools.includes("Remote MCP") ? "Remote MCP is configured for normal KChat Responses requests, but this bounded JSON agent loop cannot directly approve MCP calls." : ""}\nReturn ONLY one JSON object with this shape: {"action":"read_file|write_file|run_command|list_files|search_files|git_status|git_diff|external_tool|done","path":"...","content":"...","command":"...","query":"...","tool":"...","args":{},"message":"..."}.\nUse read_file before editing when useful. Use write_file for complete file content. Use run_command for tests/builds. Use external_tool for GitHub, Netlify or configured API actions. When the task is complete, return action=done.\n\nTask: ${task}\n\nPrevious tool results:\n${transcript.slice(-8).join("\n")}`;
      const reply = await requestChatCompletion(fakeChat, [], { id: `agent-${step}`, role: "user", content: instruction }, controller, model);
      const match = reply.match(/\{[\s\S]*\}/);
      if (!match) { transcript.push(`agent: ${reply.slice(0, 1000)}`); break; }
      let action: any;
      try { action = JSON.parse(match[0]); } catch { transcript.push(`invalid agent JSON: ${reply.slice(0, 500)}`); break; }
      if (action.action === "done") { transcript.push(`done: ${String(action.message || "Task completed")}`); break; }
      if (action.action === "external_tool") {
        await executeAgentConnector(action);
      } else if (!sandbox && ["read_file", "write_file", "run_command", "list_files", "search_files", "git_status", "git_diff"].includes(action.action)) {
        throw new Error("Code runtime is not available for this agent.");
      } else if (action.action === "list_files") {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: sandbox, command: "find . -maxdepth 3 -type f -not -path './.git/*' | sort | head -300", timeoutMs: 30000 }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "list_files failed");
        transcript.push(`files:\n${String(d.stdout || "").slice(0, 12000)}`);
      } else if (action.action === "search_files") {
        const q = String(action.query || action.pattern || "").replace(/[^\w ._@/-]/g, "").trim();
        if (!q) throw new Error("search_files requires a query");
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: sandbox, command: `grep -RIn --exclude-dir=.git --exclude-dir=node_modules -- ${JSON.stringify(q)} . | head -100`, timeoutMs: 30000 }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "search_files failed");
        transcript.push(`search ${q}:\n${String(d.stdout || d.stderr || "No matches").slice(0, 12000)}`);
      } else if (action.action === "git_status") {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: sandbox, command: "git status --short --branch", timeoutMs: 30000 }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "git_status failed");
        transcript.push(`git status:\n${String(d.stdout || d.stderr || "").slice(0, 8000)}`);
      } else if (action.action === "git_diff") {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: sandbox, command: "git diff --stat && git diff -- . ':!node_modules' | head -20000", timeoutMs: 30000 }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "git_diff failed");
        transcript.push(`git diff:\n${String(d.stdout || d.stderr || "").slice(0, 20000)}`);
      } else if (action.action === "read_file") {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", sandboxId: sandbox, path: String(action.path || "") }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "read_file failed");
        transcript.push(`read ${action.path}:\n${String(d.content || "").slice(0, 10000)}`);
      } else if (action.action === "write_file") {
        if (agent.approval !== "never") throw new Error("Approval required for file writes. Set this agent's approval policy to Never ask, or use an interactive approval flow.");
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "write", sandboxId: sandbox, path: String(action.path || ""), content: String(action.content || "") }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "write_file failed"); transcript.push(`wrote ${action.path}`);
      } else if (action.action === "run_command") {
        const r = await fetch("/api/runtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", sandboxId: sandbox, command: String(action.command || ""), timeoutMs: 120000 }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "run_command failed"); transcript.push(`$ ${action.command}\n${String(d.stdout || "")}\n${String(d.stderr || "")}\nexit ${d.exitCode ?? 0}`);
      } else {
        transcript.push(`unknown action: ${String(action.action)}`);
      }
      task = "Continue from the latest tool result. Inspect before changing anything, verify changes with tests or diffs, and finish only when the original task is satisfied.";
    }
    return transcript.join("\n\n") || "Agent finished without a transcript.";
  }

  async function sendGrid(chatId: string) {
    const value = (gridDrafts[chatId] || "").trim();
    const chat = chats.find((item) => item.id === chatId); if (!chat) return;
    const model = modelForChat(chat);
    if (!value || gridSending[chatId] || !model) { if (!model) setKeyOpen(true); return; }
    const history = chat.messages;
    const user: Message = { id: uid(), role: "user", content: value };
    const assistant: Message = { id: uid(), role: "assistant", content: "" };
    const title = history.length ? chat.title : value.slice(0, 44);
    setGridDrafts((prev) => ({ ...prev, [chatId]: "" })); setGridSending((prev) => ({ ...prev, [chatId]: true })); setError("");
    updateChatById(chatId, [...history, user, assistant], title);
    const controller = new AbortController(); gridAbortRef.current[chatId] = controller;
    try {
      const answer = model.protocol === "chat" && !attachedConnections(chat).length ? await requestChatCompletion(chat, history, user, controller, model) : await requestWithTools(chat, history, user, controller, model);
      updateChatById(chatId, [...history, user, { ...assistant, content: answer }], title);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setError((e as Error).message.replace(/\s+/g, " ").slice(0, 320)); updateChatById(chatId, [...history, user], title); }
    } finally { gridAbortRef.current[chatId] = null; setGridSending((prev) => ({ ...prev, [chatId]: false })); }
  }

  function stopGrid(chatId: string) {
    gridAbortRef.current[chatId]?.abort();
    setGridSending((prev) => ({ ...prev, [chatId]: false }));
  }

  function newChat() {
    const chat = makeChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setDraft("");
    setError("");
    setMobileOpen(false);
  }

  function selectChat(id: string) {
    setActiveId(id);
    setMobileOpen(false);
    setError("");
  }

  function deleteChat(chatId: string) {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== chatId);
      if (!next.length) {
        const fresh = makeChat();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (chatId === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function updateActive(messages: Message[], title?: string) {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === active.id
          ? { ...chat, messages, title: title ?? chat.title, updatedAt: Date.now() }
          : chat,
      ),
    );
  }

  async function send(text = draft) {
    let value = text.trim();
    if (attachedText) value += `\n\n[Attached file: ${attachedName}]\n${attachedText}`;
    if (!value) return;
    if (!activeModel) { setKeyOpen(true); return; }
    const chat = chats.find((item) => item.id === activeId); if (!chat || sending[chat.id]) return;
    const model = modelForChat(chat);
    if (!model) { setKeyOpen(true); return; }
    setDraft(""); setError(""); addActivityLog("info", `${activeModel.provider} request started · ${activeModel.model}`); setSending((prev) => ({ ...prev, [chat.id]: true }));
    const user: Message = { id: uid(), role: "user", content: value };
    const assistant: Message = { id: uid(), role: "assistant", content: "" };
    const history = chat.messages; const title = history.length ? chat.title : value.slice(0, 44);
    updateChatById(chat.id, [...history, user, assistant], title);
    const controller = new AbortController(); abortRef.current[chat.id] = controller;
    try {
      const answer = attachedConnections(chat).length ? await requestWithTools(chat, history, user, controller, model) : await requestChatCompletion(chat, history, user, controller, model);
      updateChatById(chat.id, [...history, user, { ...assistant, content: answer }], title);
      addActivityLog("success", `${model.provider} response completed.`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { setError((e as Error).message.replace(/\s+/g, " ").slice(0, 320)); addActivityLog("error", `${model.provider} request failed: ${(e as Error).message.replace(/\s+/g, " ").slice(0, 360)}`); updateChatById(chat.id, [...history, user], title); }
    } finally { abortRef.current[chat.id] = null; setSending((prev) => ({ ...prev, [chat.id]: false })); }
  }

  function stop(chatId = activeId) { abortRef.current[chatId]?.abort(); setSending((prev) => ({ ...prev, [chatId]: false })); }

  function toggleChatConnection(connectionId: string) {
    setChats((prev) => prev.map((chat) => chat.id === active.id ? { ...chat, connectionIds: chat.connectionIds.includes(connectionId) ? chat.connectionIds.filter((id) => id !== connectionId) : [...chat.connectionIds, connectionId] } : chat));
  }

  function saveApiConnection() {
    try {
      const headers = parseJsonObject(apiForm.headers, "Headers");
      const inputSchema = parseJsonObject(apiForm.inputSchema, "Input schema");
      if (!apiForm.name.trim() || !apiForm.url.trim()) throw new Error("Name and URL are required.");
      const connection: ApiConnection = { id: uid(), kind: "api", name: apiForm.name.trim(), description: apiForm.description.trim(), url: apiForm.url.trim(), method: apiForm.method, headers: headers as Record<string, string>, inputSchema };
      setConnections((prev) => [...prev, connection]); setApiForm({ name: "", description: "", url: "", method: "GET", headers: "{}", inputSchema: '{"type":"object","properties":{}}' }); setConnectionFormOpen(false); setConnectionError("");
    } catch (error) { setConnectionError((error as Error).message); }
  }

  function saveMcpConnection() {
    try {
      const headers = parseJsonObject(mcpForm.headers, "Headers");
      if (!mcpForm.name.trim() || !mcpForm.serverUrl.trim()) throw new Error("Name and server URL are required.");
      const connection: McpConnection = { id: uid(), kind: "mcp", name: mcpForm.name.trim(), description: mcpForm.description.trim(), serverUrl: mcpForm.serverUrl.trim(), headers: headers as Record<string, string>, requireApproval: mcpForm.requireApproval };
      setConnections((prev) => [...prev, connection]); setMcpForm({ name: "", description: "", serverUrl: "", headers: "{}", requireApproval: "never" }); setConnectionFormOpen(false); setConnectionError("");
    } catch (error) { setConnectionError((error as Error).message); }
  }

  function removeConnection(id: string) {
    setConnections((prev) => prev.filter((connection) => connection.id !== id));
    setChats((prev) => prev.map((chat) => ({ ...chat, connectionIds: chat.connectionIds.filter((connectionId) => connectionId !== id) })));
  }

  function saveIntegrationCredentials() {
    if (githubToken.trim()) sessionStorage.setItem("kchat-github-token", githubToken.trim()); else sessionStorage.removeItem("kchat-github-token");
    if (netlifyToken.trim()) sessionStorage.setItem("kchat-netlify-token", netlifyToken.trim()); else sessionStorage.removeItem("kchat-netlify-token");
    setIntegrationStatus({ github: githubToken.trim() ? "Connected in this session" : "", netlify: netlifyToken.trim() ? "Connected in this session" : "" });
  }

  async function testIntegration(provider: "github" | "netlify") {
    const token = provider === "github" ? githubToken.trim() : netlifyToken.trim();
    if (!token) { setIntegrationStatus((prev) => ({ ...prev, [provider]: "Add a token first" })); return; }
    try {
      const tool = provider === "github" ? "github_list_repositories" : "netlify_list_sites";
      const response = await fetch("/api/tools/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, credentials: provider === "github" ? { githubToken: token } : { netlifyToken: token } }) });
      if (!response.ok) throw new Error((await response.json()).error || "Connection failed");
      const data = await response.json();
      setIntegrationStatus((prev) => ({ ...prev, [provider]: `${Array.isArray(data) ? data.length : 0} accessible ${provider === "github" ? "repositories" : "sites"}` }));
      saveIntegrationCredentials();
    } catch (error) { setIntegrationStatus((prev) => ({ ...prev, [provider]: error instanceof Error ? error.message : "Connection failed" })); }
  }

  function addActivityLog(type: "info" | "success" | "error", text: string) {
    setActivityLogs((prev) => [...prev.slice(-39), { id: uid(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), type, text }]);
  }

  async function testModelConnection(connection: ModelConnection) {
    const endpoint = modelEndpoint(connection);
    const headers = modelHeaders(connection);
    const body = connection.protocol === "responses"
      ? { model: connection.model, input: "Reply with OK.", max_output_tokens: 1, stream: false }
      : { model: connection.model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 1, stream: false };
    addActivityLog("info", `Testing ${connection.provider} · ${connection.model}…`);
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await modelError(response));
    const data = await response.json();
    const hasResponse = connection.protocol === "responses" ? Boolean(data?.id || data?.output_text || data?.output) : Boolean(data?.choices?.[0]);
    if (!hasResponse) throw new Error("Provider returned an unexpected response format.");
    return data;
  }

  async function saveKey() {
    const value = modelForm.apiKey.trim();
    if (!value) { setKeyError("Paste your model API key first."); return; }

    // Google AI Studio authorization keys use the AQ.* format. If one is pasted
    // while OpenAI/Custom is selected, automatically route it to Gemini's
    // official OpenAI-compatible endpoint instead of OpenAI.
    const isGoogleAuthKey = /^AQ\./i.test(value);
    const detectedForm: ModelConnection = isGoogleAuthKey && ["OpenAI", "Custom"].includes(modelForm.provider)
      ? ({ ...modelForm, provider: "Gemini", name: "Gemini", ...MODEL_PRESETS.Gemini, apiKey: value } as ModelConnection)
      : ({ ...modelForm, apiKey: value } as ModelConnection);
    if (detectedForm.provider !== modelForm.provider || detectedForm.baseUrl !== modelForm.baseUrl || detectedForm.model !== modelForm.model) setModelForm(detectedForm);

    const url = detectedForm.baseUrl.trim();
    if (!url) { setKeyError("Enter the model API base URL."); return; }
    if (!detectedForm.model.trim()) { setKeyError("Enter the model ID."); return; }
    const connection: ModelConnection = { ...detectedForm, id: modelForm.id || uid(), name: detectedForm.name.trim() || detectedForm.provider, baseUrl: url.replace(/\/$/, ""), model: detectedForm.model.trim() };
    setKeyTesting(true); setKeyError("");
    if (isGoogleAuthKey && connection.provider === "Gemini") addActivityLog("info", "Detected Google Gemini authorization key (AQ.*); testing Gemini endpoint.");
    try {
      await testModelConnection(connection);
      setModelConnections((prev) => [...prev.filter((item) => item.id !== connection.id), connection]);
      setActiveModelId(connection.id);
      setApiKey(connection.apiKey);
      setSettings((prev) => ({ ...prev, model: connection.model }));
      const nextModels = [...modelConnections.filter((item) => item.id !== connection.id), connection];
      sessionStorage.setItem(MODEL_CONNECTIONS, JSON.stringify(nextModels));
      sessionStorage.setItem(ACTIVE_MODEL, connection.id);
      sessionStorage.setItem(KEY, connection.apiKey);
      addActivityLog("success", `${connection.provider} connection verified successfully.`);
      setKeyError(""); setKeyOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed.";
      setKeyError(message.replace(/\s+/g, " ").slice(0, 500));
      addActivityLog("error", `${connection.provider} connection failed: ${message.replace(/\s+/g, " ").slice(0, 360)}`);
    } finally { setKeyTesting(false); }
  }

  function removeModelConnection(id: string) {
    const next = modelConnections.filter((item) => item.id !== id);
    setModelConnections(next);
    sessionStorage.setItem(MODEL_CONNECTIONS, JSON.stringify(next));
    if (activeModelId === id) {
      const selected = next[0];
      if (selected) { setActiveModelId(selected.id); setApiKey(selected.apiKey); setSettings((prev) => ({ ...prev, model: selected.model })); sessionStorage.setItem(ACTIVE_MODEL, selected.id); }
      else { setActiveModelId(""); setApiKey(""); sessionStorage.removeItem(ACTIVE_MODEL); }
    }
  }

  function selectModelConnection(id: string) {
    const selected = modelConnections.find((item) => item.id === id); if (!selected) return;
    setActiveModelId(selected.id); setApiKey(selected.apiKey); setSettings((prev) => ({ ...prev, model: selected.model })); sessionStorage.setItem(ACTIVE_MODEL, selected.id); sessionStorage.setItem(KEY, selected.apiKey);
  }

  function startModelPreset(provider: string) {
    const preset = MODEL_PRESETS[provider] || MODEL_PRESETS.Custom;
    setModelForm((prev) => ({ ...prev, provider, name: provider, ...preset } as ModelConnection));
    setKeyError("");
  }

  function detectProviderFromKey(value: string) {
    const key = value.trim();
    if (/^AQ\./i.test(key)) return "Gemini";
    if (/^sk-or-v1-/i.test(key)) return "OpenRouter";
    if (/^gsk_/i.test(key)) return "Groq";
    if (/^sk-(proj-)?/i.test(key)) return "OpenAI";
    return "";
  }

  function handleModelKeyChange(value: string) {
    const detected = detectProviderFromKey(value);
    if (detected) {
      const preset = MODEL_PRESETS[detected];
      setModelForm((prev) => ({ ...prev, provider: detected, name: detected, ...preset, apiKey: value } as ModelConnection));
      setKeyError("");
      addActivityLog("info", `Detected ${detected} API key; filled the compatible connection settings.`);
      return;
    }
    setModelForm((prev) => ({ ...prev, apiKey: value }));
    setKeyError("");
  }

  function clearActive() { setChats(prev => prev.map(c => c.id === active.id ? { ...c, messages: [], title: "New conversation", updatedAt: Date.now() } : c)); setDraft(""); setAttachedName(""); setAttachedText(""); }
  function exportChat(chat: Chat) {
    const text = `# ${chat.title}\n\n` + chat.messages.map(m => `## ${m.role === "user" ? "You" : "KChat"}\n\n${m.content}`).join("\n\n");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chat.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "kchat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportActive() { exportChat(active); }
  async function attach(file?: File) { if (!file) return; const ok = file.type.startsWith("text/") || /\.(txt|md|json|csv|js|jsx|ts|tsx|py|java|c|cpp|html|css|sql|xml|yaml|yml|sh|log)$/i.test(file.name); if (!ok) { setError("KChat currently accepts text and code files. PDF/image attachments can be added with the storage backend."); return; } if (file.size > 250000) { setError("Keep text attachments under 250 KB for browser-only mode."); return; } setAttachedName(file.name); setAttachedText(await file.text()); setError(""); }
  function useQuickPrompt(prefix: string) { setDraft(prefix + (draft.trim() ? `\n\n${draft}` : "")); setToolsOpen(false); textareaRef.current?.focus(); }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {}
  }

  function editPrompt(messageId: string) {
    const index = active.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const message = active.messages[index];
    if (message.role !== "user") return;
    stop(active.id);
    updateActive(active.messages.slice(0, index), index === 0 ? "New conversation" : active.title);
    setDraft(message.content);
    setError("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function improvisePrompt(text: string) {
    const chat = makeChat();
    chat.title = "Improvise prompt";
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setDraft(`Improve and strengthen this prompt while preserving my original intent. Return a polished version I can use directly.\n\n${text}`);
    setError("");
    setMobileOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <main className={`app ${dark ? "dark" : "light"}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" />

      {mobileOpen && <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-logo"><Sparkles size={17} strokeWidth={2.2} /></div>
          {!collapsed && <div className="brand-name">KChat<span>.</span></div>}
          {!collapsed && <button className="close-mobile" onClick={() => setMobileOpen(false)}><X size={18} /></button>}
        </div>

        <button className="new-chat" onClick={newChat}>
          <span className="new-chat-icon"><Plus size={17} /></span>
          {!collapsed && <span>New chat</span>}
          {!collapsed && <kbd>⌘ K</kbd>}
        </button>

        {!collapsed && (
          <div className="search-box">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" />
            <span className="search-key">⌘</span>
          </div>
        )}

        {!collapsed && <div className="section-label">Conversations</div>}
        <div className="chat-list">
          {visibleChats.map((chat) => (
            <button className={`chat-item ${chat.id === active.id ? "active" : ""}`} key={chat.id} onClick={() => selectChat(chat.id)}>
              <MessageCircle size={15} />
              {!collapsed && <span>{chat.title}</span>}
              {!collapsed && <Download className="chat-export" size={14} onClick={(e) => { e.stopPropagation(); exportChat(chat); }} aria-label={`Export ${chat.title}`} />}
              {!collapsed && <Trash2 className="chat-delete" size={14} onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }} />}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="profile-workspace">
            <button className={`workspace-card profile-workspace-trigger ${profileOpen ? "selected" : ""}`} onClick={() => setProfileOpen(v => !v)} aria-label="Personal workspace profile" title="Personal workspace">
              <div className="avatar"><UserRound size={15} /></div>
              {!collapsed && <div className="workspace-copy"><strong>Personal workspace</strong><small>{profileUser ? profileUser.email : (apiKey ? "Connected • BYOK" : "Private • BYOK")}</small></div>}
              <MoreHorizontal size={16} />
            </button>
            {profileOpen && <div className="profile-menu workspace-profile-menu">
              {profileUser ? <>
                <div className="profile-menu-user"><div className="profile-menu-avatar"><UserRound size={16}/></div><div><strong>{profileUser.email}</strong><span>Signed in</span></div></div>
                <button onClick={() => { setProfileOpen(false); setIntegrationsOpen(true); }}><Plug size={14}/> Connections</button>
                <button onClick={() => { setProfileOpen(false); clearActive(); }}><Trash2 size={14}/> Clear conversation</button>
                <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }}><UserRound size={14}/> Sign out</button>
              </> : <>
                <div className="profile-menu-head"><strong>Welcome to KChat</strong><span>Sign in to sync your workspace.</span></div>
                <button onClick={() => { setProfileOpen(false); setIntegrationsOpen(true); }}><Plug size={14}/> Connections</button>
                <button onClick={() => { setProfileOpen(false); clearActive(); }}><Trash2 size={14}/> Clear conversation</button>
                <button onClick={() => { window.location.href = "?auth=login"; }}><UserRound size={14}/> Sign in</button>
                <button onClick={() => { window.location.href = "?auth=signup"; }}><UserRound size={14}/> Create account</button>
                <span className="profile-menu-guest">You can continue as a guest.</span>
              </>}
            </div>}
          </div>
          <button className="side-action" onClick={() => setKeyOpen(true)}><KeyRound size={16} />{!collapsed && <span>API key</span>}</button>
          <button className="side-action" onClick={() => setSettingsOpen(true)}><Settings2 size={16} />{!collapsed && <span>Settings</span>}</button>
          <button className="side-action" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={16} /> : <Moon size={16} />}{!collapsed && <span>{dark ? "Light appearance" : "Dark appearance"}</span>}</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="top-left">
            <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
            <button className="icon-btn desktop-only" onClick={() => setCollapsed((value) => !value)}><PanelLeft size={18} /></button>
            <div className="mode-switcher" role="tablist" aria-label="KChat workspace mode">
              <button className={workspaceMode === "chat" ? "selected" : ""} onClick={() => setWorkspaceMode("chat")}><MessageCircle size={13}/> Chat</button>
              <button className={workspaceMode === "code" ? "selected" : ""} onClick={() => setWorkspaceMode("code")}><Code2 size={13}/> Code</button>
              <button className={workspaceMode === "agent" ? "selected" : ""} onClick={() => setWorkspaceMode("agent")}><Bot size={13}/> Agent</button>
              <button className="mode-builder-btn" onClick={() => { setAgentDraft(DEFAULT_AGENT); setAgentBuilderOpen(true); }} title="Build an AI agent"><Plus size={12}/> Builder</button>
            </div>
            {workspaceMode === "chat" && <button className="model-select" onClick={() => setSettingsOpen(true)}>
              <span className="status-dot" />
              <span>{settings.model}</span>
              <ChevronDown size={13} />
            </button>}
          </div>
          <div className="top-right">
            <button className={`top-link grid-top-link ${gridOpen ? "selected" : ""}`} onClick={() => gridOpen ? setGridOpen(false) : openGrid()} aria-label={gridOpen ? "Return to single view" : "Open grid view"} title={gridOpen ? "Return to single view" : "Open grid view"}><LayoutGrid size={14} /><span className="grid-label">{gridOpen ? "Single view" : "Grid"}</span></button>
            <button className="top-link" onClick={() => setKeyOpen(true)}><KeyRound size={14} />{activeModel ? activeModel.provider : "Connect"}</button>
          </div>
        </header>

        {workspaceMode === "chat" ? <>
        <div className={`conversation ${gridOpen ? "grid-conversation" : ""}`}>
          {gridOpen ? (
            <div className="grid-workspace">
              <div className="grid-toolbar">
                <div><span className="eyebrow-inline"><i /> Parallel workspace</span><strong>{gridIds.length}/{GRID_MAX} conversations ready to run side by side</strong></div>
                <div className="grid-toolbar-actions">
                  <button onClick={runAllGridChats} disabled={!gridIds.some((id) => (gridDrafts[id] || "").trim() && !gridSending[id])}>Run all</button>
                  <select value="" onChange={(e) => { if (e.target.value) addGridChat(e.target.value); }} aria-label="Add conversation to grid">
                    <option value="">+ Add chat</option>
                    {chats.filter((chat) => !gridIds.includes(chat.id)).map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}
                  </select>
                  {gridIds.length > 0 && <button onClick={() => setGridIds([])}>Clear grid</button>}
                </div>
              </div>
              {gridIds.length === 0 ? (
                <div className="grid-empty"><LayoutGrid size={26}/><h2>Build your parallel workspace</h2><p>Add up to sixteen conversations. Each chat has its own history, composer and independent generation stream.</p><button onClick={() => chats[0] && addGridChat(chats[0].id)}>Add first chat</button></div>
              ) : (
                <div className="chat-grid">
                  {gridIds.map((id) => {
                    const chat = chats.find((item) => item.id === id);
                    if (!chat) return null;
                    return <ChatTile key={id} chat={chat} model={modelForChat(chat)} models={modelConnections} sending={!!gridSending[id]} draft={gridDrafts[id] || ""} onModel={(modelId) => setChatModel(id, modelId)} onDraft={(value) => setGridDrafts((prev) => ({ ...prev, [id]: value }))} onSend={() => sendGrid(id)} onStop={() => stopGrid(id)} onExpand={() => setFullscreenId(id)} onExport={() => exportChat(chat)} onClose={() => removeGridChat(id)} />;
                  })}
                </div>
              )}
            </div>
          ) : active.messages.length === 0 ? (
            <div className="welcome">
              <div className="orb-stage">
                <div className="orb-ring ring-one" />
                <div className="orb-ring ring-two" />
                <div className="orb-core"><Sparkles size={27} /></div>
                <span className="orb-particle p1" /><span className="orb-particle p2" /><span className="orb-particle p3" /><span className="orb-particle p4" />
              </div>
              <div className="eyebrow"><span /> Private AI workspace <span /></div>
              <h1>Think beyond<br /><em>the ordinary.</em></h1>
              <p className="welcome-subtitle">A focused AI space for ideas, code, learning and decisions.</p>

              <div className="starter-grid">
                {starters.map((starter) => (
                  <button key={starter.title} onClick={() => send(starter.text)}>
                    <span className="starter-icon">{starter.icon}</span>
                    <span className="starter-title">{starter.title}</span>
                    <small>{starter.text}</small>
                    <ArrowUp className="starter-arrow" size={14} />
                  </button>
                ))}
              </div>
              <p className="setup-hint">{apiKey ? "Your model connection is ready." : "Connect your API key to begin."}</p>
            </div>
          ) : (
            <div className="messages">
              <div className="conversation-title"><span>{active.title}</span><i /><button className="icon-btn" title="Chat settings" onClick={() => setChatSettingsId(active.id)}><Settings2 size={15}/></button></div>
              {active.messages.map((message) => (
                <div className={`message-row ${message.role}`} key={message.id}>
                  {message.role === "assistant" && <div className="assistant-badge"><Sparkles size={14} /></div>}
                  <div className="message-body">
                    {message.role === "user" ? <div className="user-bubble">{message.content}</div> : <div className="assistant-text">{message.content || <span className="thinking"><i /><i /><i /></span>}</div>}
                    {message.content && (
                      <div className={`message-actions ${message.role === "user" ? "user-message-actions" : ""}`}>
                        {message.role === "user" && <button title="Edit prompt" onClick={() => editPrompt(message.id)}><Pencil size={13} /> <span>Edit</span></button>}
                        <button title="Copy" onClick={() => copy(message.content, message.id)}>{copied === message.id ? <Check size={13} /> : <Copy size={13} />} <span>{copied === message.id ? "Copied" : "Copy"}</span></button>
                        {message.role === "user" && <button title="Improvise this prompt in another chat" onClick={() => improvisePrompt(message.content)}><Sparkles size={13} /> <span>Improvise</span></button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}
        </div>

        <div className="composer-area">
          {settings.showActivityLog && activityLogs.length > 0 && <div className="activity-log" role="log" aria-label="Request activity log">
            <div className="activity-log-head"><span><i />Activity log</span><button onClick={() => setActivityLogs([])}>Clear</button></div>
            <div className="activity-log-list">{activityLogs.map((entry) => <div className={`activity-log-entry ${entry.type}`} key={entry.id}><time>{entry.time}</time><span>{entry.text}</span></div>)}</div>
          </div>}
          <div className="composer-glow" />
          <div className="composer">
            {attachedName && <div className="attachment-chip"><FileText size={13}/><span>{attachedName}</span><button onClick={() => {setAttachedName("");setAttachedText("");}}><X size={12}/></button></div>}
            {attachedConnections(active).length > 0 && <div className="connection-chips">{attachedConnections(active).map((connection) => <button key={connection.id} className="connection-chip" onClick={() => setIntegrationsOpen(true)} title="Manage chat connections"><Plug size={12}/><span>{connection.name}</span><X size={11}/></button>)}</div>}
            <textarea ref={textareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && settings.enterToSend) { e.preventDefault(); send(); } }} placeholder="Message KChat…" rows={1} />
            <div className="composer-bottom">
              <div className="composer-left"><input ref={fileRef} type="file" hidden onChange={e => { attach(e.target.files?.[0]); e.currentTarget.value=""; }}/><button title="Attach file" onClick={() => fileRef.current?.click()}><Paperclip size={17}/></button><div className="tools-wrap"><button title="Connect API or MCP" onClick={() => setIntegrationsOpen(true)}><Plug size={16}/></button><button title="Quick tools" onClick={() => { setToolsOpen(v=>!v); }}><Plus size={18}/></button>{toolsOpen && <div className="tools-menu"><button onClick={() => useQuickPrompt("Improve this prompt:")}><Sparkles size={13}/> Improve prompt</button><button onClick={() => useQuickPrompt("Explain this simply:")}><Sparkles size={13}/> Explain simply</button><button onClick={() => useQuickPrompt("Brainstorm 10 strong ideas for:")}><Sparkles size={13}/> Brainstorm</button></div>}</div><span className="composer-model">{activeModel?.model || settings.model}</span></div>
              <div className="composer-right"><span className="connection-label"><i />{activeModel ? `${activeModel.provider} • Ready` : "Connect a model"}</span>{sending[active.id] ? <button className="send-btn stop" onClick={() => stop(active.id)}><Square size={13} fill="currentColor" /></button> : <button className="send-btn" onClick={() => send()} disabled={!draft.trim() && !attachedText}><ArrowUp size={17} /></button>}</div>
            </div>
          </div>
          <p className="disclaimer">KChat may make mistakes. Requests are sent directly from your browser using your own API key.</p>
        </div>
        </> : workspaceMode === "code" ? <CodeWorkspace
          project={codeProject}
          file={codeFile}
          pane={codePane}
          command={codeCommand}
          logs={codeLog}
          runtimeStatus={runtimeStatus}
          previewUrl={previewUrl}
          fileContent={runtimeFileContent}
          onProject={setCodeProject}
          onFile={(path) => { setCodeFile(path); if (runtimeStatus === "ready") void readRuntimeFile(path); }}
          onPane={setCodePane}
          onCommand={setCodeCommand}
          onRun={() => { const command = codeCommand.trim() || "npm run dev"; setCodeCommand(command); void runRuntimeCommand(); }}
          onStartRuntime={() => void startRuntime()}
          onStopRuntime={() => void stopRuntime()}
          onPreview={() => void openRuntimePreview()}
          onRefreshFile={() => void readRuntimeFile(codeFile)}
          onSaveFile={(content) => void saveRuntimeFile(codeFile, content)}
          onAddLog={(text) => setCodeLog((prev) => [...prev, text])}
        /> : <AgentWorkspace agents={agents} onBuild={() => { setAgentDraft(DEFAULT_AGENT); setAgentBuilderOpen(true); }} onRun={async (agent) => { try { setAgentRunOutput(`Running ${agent.name}…`); setAgentRunOutput(await runConfiguredAgent(agent, `Start the task assigned to ${agent.name}. Ask for a concrete task if none is provided.`)); } catch (e) { setAgentRunOutput(e instanceof Error ? e.message : "Agent failed"); } }} onOpenCode={() => setWorkspaceMode("code")} onNewChat={newChat} />}
      </section>

      {fullscreenId && (() => {
        const chat = chats.find((item) => item.id === fullscreenId);
        if (!chat) return null;
        return <div className="chat-fullscreen"><div className="fullscreen-head"><div><span className="eyebrow-inline"><i /> Focus mode</span><strong>{chat.title}</strong></div><button className="icon-btn" onClick={() => setFullscreenId(null)}><Minimize2 size={17}/></button></div><div className="fullscreen-body">{chat.messages.length ? chat.messages.map((message) => <div className={`message-row ${message.role}`} key={message.id}>{message.role === "assistant" && <div className="assistant-badge"><Sparkles size={14}/></div>}<div className="message-body">{message.role === "user" ? <div className="user-bubble">{message.content}</div> : <div className="assistant-text">{message.content || <span className="thinking"><i/><i/><i/></span>}</div>}</div></div>) : <div className="fullscreen-empty"><Sparkles size={25}/><p>This conversation is ready.</p></div>}</div><div className="fullscreen-composer"><textarea value={gridDrafts[chat.id] || ""} onChange={(e) => setGridDrafts((prev) => ({ ...prev, [chat.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendGrid(chat.id); } }} placeholder="Continue this conversation…" rows={1}/>{gridSending[chat.id] ? <button className="send-btn stop" onClick={() => stopGrid(chat.id)}><Square size={13} fill="currentColor"/></button> : <button className="send-btn" onClick={() => sendGrid(chat.id)} disabled={!gridDrafts[chat.id]?.trim()}><ArrowUp size={17}/></button>}</div></div>;
      })()}

      {chatSettingsId && (() => {
        const target = chats.find((item) => item.id === chatSettingsId);
        if (!target) return null;
        return <Modal title="Conversation context" icon={<Settings2 size={17} />} onClose={() => setChatSettingsId(null)}>
          <div className="modal-intro"><div className="intro-glow"><MessageCircle size={20}/></div><div><strong>Control what this chat can see</strong><p>Context is local to your browser. Isolated chats receive only their own history.</p></div></div>
          <label className="field context-mode-field"><span>Context mode</span>
             <button type="button" className={`context-mode-trigger ${contextModeOpen ? "open" : ""}`} onClick={() => setContextModeOpen((value) => !value)} aria-expanded={contextModeOpen}>
               <span className={`context-mode-icon ${target.contextMode}`}><MessageCircle size={14}/></span>
               <span className="context-mode-trigger-copy"><strong>{target.contextMode === "isolated" ? "Isolated" : target.contextMode === "connected" ? "Connected" : "Global"}</strong><small>{target.contextMode === "isolated" ? "Only this conversation" : target.contextMode === "connected" ? `${target.connectedChats.length} selected conversation${target.connectedChats.length === 1 ? "" : "s"}` : "All other conversations"}</small></span>
               <ChevronDown size={15} className="context-mode-chevron"/>
             </button>
             {contextModeOpen && <div className="context-mode-options">
               {[{ id: "isolated" as ContextMode, title: "Isolated", description: "Only this conversation" }, { id: "connected" as ContextMode, title: "Connected", description: "Choose which conversations are visible" }, { id: "global" as ContextMode, title: "Global", description: "Allow context from every other conversation" }].map((option) => <button type="button" key={option.id} className={`context-mode-option ${target.contextMode === option.id ? "selected" : ""}`} onClick={() => { setChats(prev => prev.map(c => c.id === target.id ? { ...c, contextMode: option.id } : c)); setContextModeOpen(false); }}>
                 <span className={`context-mode-icon ${option.id}`}><MessageCircle size={14}/></span><span><strong>{option.title}</strong><small>{option.description}</small></span>{target.contextMode === option.id && <Check size={15}/>}
               </button>)}
             </div>}
           </label>
          {target.contextMode === "connected" && <label className="field"><span>Connected conversations</span><div className="chat-picker">{chats.filter(c => c.id !== target.id).map(c => <label key={c.id}><input type="checkbox" checked={target.connectedChats.includes(c.id)} onChange={(e) => setChats(prev => prev.map(x => x.id === target.id ? { ...x, connectedChats: e.target.checked ? [...x.connectedChats, c.id] : x.connectedChats.filter(id => id !== c.id) } : x))}/><span>{c.title}</span></label>)}</div></label>}
          <div className="security-note"><Sparkles size={14}/><span>Only recent messages from permitted chats are injected as context when you generate.</span></div>
          <div className="connection-section"><div className="connection-section-head"><div><strong>Chat connections</strong><span>Attach APIs and MCP servers to this conversation.</span></div><button className="secondary mini" onClick={() => { setChatSettingsId(null); setIntegrationsOpen(true); }}>Manage</button></div>{connections.length ? <div className="connection-list compact">{connections.map((connection) => <button className={`connection-row compact-row ${target.connectionIds.includes(connection.id) ? "attached" : ""}`} key={connection.id} onClick={() => setChats((prev) => prev.map((chat) => chat.id === target.id ? { ...chat, connectionIds: chat.connectionIds.includes(connection.id) ? chat.connectionIds.filter((id) => id !== connection.id) : [...chat.connectionIds, connection.id] } : chat))}><span className="connection-type-icon">{connection.kind === "mcp" ? "M" : "API"}</span><span><strong>{connection.name}</strong><small>{connection.kind === "mcp" ? "Remote MCP" : `${connection.method} API`}</small></span><span className="connection-state">{target.connectionIds.includes(connection.id) ? "Attached" : "Attach"}</span></button>)}</div> : <div className="connection-empty">No custom connections. Use Manage to add one.</div>}</div>
          <div className="modal-actions"><button className="primary" onClick={() => setChatSettingsId(null)}>Done</button></div>
        </Modal>;
      })()}

      {keyOpen && (
        <Modal title="Connect a model API" icon={<KeyRound size={17} />} onClose={() => setKeyOpen(false)}>
          <div className="modal-intro"><div className="intro-glow"><KeyRound size={20} /></div><div><strong>Bring any compatible model API</strong><p>OpenAI-compatible APIs work with the same KChat connection. Your key stays in this browser session.</p></div></div>
          {modelConnections.length > 0 && <div className="model-connection-list">{modelConnections.map((connection) => <div className={`model-connection-row ${activeModelId === connection.id ? "active" : ""}`} key={connection.id}><button onClick={() => selectModelConnection(connection.id)}><span><strong>{connection.name}</strong><small>{connection.provider} · {connection.model}</small></span><span>{activeModelId === connection.id ? "Active" : "Use"}</span></button><button className="icon-btn mini-icon" title="Remove" onClick={() => removeModelConnection(connection.id)}><Trash2 size={13}/></button></div>)}</div>}
          <label className="field"><span>Provider</span><select value={modelForm.provider} onChange={(e) => startModelPreset(e.target.value)}><option>OpenAI</option><option>Gemini</option><option>OpenRouter</option><option>Groq</option><option>Mistral</option><option>Custom</option></select></label>
          <div className="form-grid"><label className="field"><span>Connection name</span><input value={modelForm.name} onChange={(e) => setModelForm({...modelForm,name:e.target.value})} placeholder="My Gemini" /></label><label className="field"><span>Model ID</span><input value={modelForm.model} onChange={(e) => setModelForm({...modelForm,model:e.target.value})} placeholder="gemini-3.8-flash" /></label></div>
          <label className="field"><span>API base URL</span><input value={modelForm.baseUrl} onChange={(e) => setModelForm({...modelForm,baseUrl:e.target.value})} placeholder="https://.../v1" /></label>
          <div className="form-grid"><label className="field"><span>API key <em className="field-hint">paste first — provider is detected automatically</em></span><input autoFocus type="password" value={modelForm.apiKey} onChange={(e) => handleModelKeyChange(e.target.value)} placeholder="Paste your API key" onKeyDown={(e) => e.key === "Enter" && saveKey()} /></label><label className="field"><span>Auth header</span><input value={modelForm.authHeader} onChange={(e) => setModelForm({...modelForm,authHeader:e.target.value})} placeholder="Authorization" /></label></div>
          <div className="form-grid"><label className="field"><span>Auth prefix</span><input value={modelForm.authPrefix} onChange={(e) => setModelForm({...modelForm,authPrefix:e.target.value})} placeholder="Bearer" /></label><label className="field"><span>API protocol</span><select value={modelForm.protocol} onChange={(e) => setModelForm({...modelForm,protocol:e.target.value as ModelConnection["protocol"]})}><option value="chat">Chat Completions</option><option value="responses">Responses</option></select></label></div>
          <div className="security-note"><KeyRound size={14} /><span><strong>Quick connect:</strong> paste an OpenAI, Gemini, OpenRouter, or Groq key and KChat automatically fills the provider, endpoint, model, and protocol. You can still edit the advanced fields below. A native provider API that is not OpenAI-compatible needs a dedicated adapter.</span></div>{keyError && <div className="key-error" role="alert">{keyError}</div>}
          <div className="modal-actions"><button className="secondary" onClick={() => setKeyOpen(false)}>Cancel</button><button className="primary" onClick={saveKey} disabled={keyTesting}>{keyTesting ? "Testing connection…" : "Test & connect"}</button></div>
        </Modal>
      )}

      {integrationsOpen && (
        <Modal title="Connections & tools" icon={<Plug size={17} />} onClose={() => setIntegrationsOpen(false)}>
          <div className="modal-intro"><div className="intro-glow"><Plug size={20}/></div><div><strong>Connect anything to this chat</strong><p>Add API tools, remote MCP servers, GitHub and Netlify. New API/MCP connections stay in this browser session and can be attached per conversation.</p></div></div>
          <div className="connection-section"><div className="connection-section-head"><div><strong>Attached to this chat</strong><span>{attachedConnections(active).length ? `${attachedConnections(active).length} connection${attachedConnections(active).length === 1 ? "" : "s"}` : "Nothing attached"}</span></div></div>
            {connections.length ? <div className="connection-list">{connections.map((connection) => <div className={`connection-row ${active.connectionIds.includes(connection.id) ? "attached" : ""}`} key={connection.id}><button className="connection-toggle" onClick={() => toggleChatConnection(connection.id)}><span className="connection-type-icon">{connection.kind === "mcp" ? "M" : "API"}</span><span><strong>{connection.name}</strong><small>{connection.kind === "mcp" ? connection.serverUrl : `${connection.method} ${connection.url}`}</small></span></button><div className="connection-row-actions"><button className="secondary mini" onClick={() => toggleChatConnection(connection.id)}>{active.connectionIds.includes(connection.id) ? "Attached" : "Attach"}</button><button className="icon-btn mini-icon" title="Remove" onClick={() => removeConnection(connection.id)}><Trash2 size={13}/></button></div></div>)}</div> : <div className="connection-empty">No custom API or MCP connections yet.</div>}
          </div>
          <div className="connection-tabs"><button className={connectionTab === "api" ? "selected" : ""} onClick={() => { setConnectionTab("api"); setConnectionFormOpen(true); }}>+ API tool</button><button className={connectionTab === "mcp" ? "selected" : ""} onClick={() => { setConnectionTab("mcp"); setConnectionFormOpen(true); }}>+ MCP server</button></div>
          {connectionFormOpen && <div className="connection-form">
            {connectionTab === "api" ? <>
              <div className="form-grid"><label className="field"><span>Name</span><input value={apiForm.name} onChange={(e) => setApiForm({...apiForm,name:e.target.value})} placeholder="My API" /></label><label className="field"><span>Method</span><select value={apiForm.method} onChange={(e) => setApiForm({...apiForm,method:e.target.value as ApiConnection["method"]})}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label></div>
              <label className="field"><span>Endpoint URL</span><input value={apiForm.url} onChange={(e) => setApiForm({...apiForm,url:e.target.value})} placeholder="https://api.example.com/search" /></label>
              <label className="field"><span>Description</span><input value={apiForm.description} onChange={(e) => setApiForm({...apiForm,description:e.target.value})} placeholder="Search my service" /></label>
              <label className="field"><span>Headers JSON</span><textarea rows={3} value={apiForm.headers} onChange={(e) => setApiForm({...apiForm,headers:e.target.value})} placeholder='{"Authorization":"Bearer ..."}' /></label>
              <label className="field"><span>Input schema JSON</span><textarea rows={6} value={apiForm.inputSchema} onChange={(e) => setApiForm({...apiForm,inputSchema:e.target.value})} /></label>
              <p className="field-hint">The model sees the name, description and schema—not your secret header values. API calls are executed by KChat's connector route.</p>
              <div className="modal-actions"><button className="secondary" onClick={() => setConnectionFormOpen(false)}>Cancel</button><button className="primary" onClick={saveApiConnection}>Add API tool</button></div>
            </> : <>
              <label className="field"><span>Name</span><input value={mcpForm.name} onChange={(e) => setMcpForm({...mcpForm,name:e.target.value})} placeholder="My MCP" /></label>
              <label className="field"><span>MCP server URL</span><input value={mcpForm.serverUrl} onChange={(e) => setMcpForm({...mcpForm,serverUrl:e.target.value})} placeholder="https://example.com/mcp" /></label>
              <label className="field"><span>Description</span><input value={mcpForm.description} onChange={(e) => setMcpForm({...mcpForm,description:e.target.value})} placeholder="What this server provides" /></label>
              <label className="field"><span>Headers JSON</span><textarea rows={4} value={mcpForm.headers} onChange={(e) => setMcpForm({...mcpForm,headers:e.target.value})} placeholder='{"Authorization":"Bearer ..."}' /></label>
              <label className="field"><span>Tool approval</span><select value={mcpForm.requireApproval} onChange={(e) => setMcpForm({...mcpForm,requireApproval:e.target.value as McpConnection["requireApproval"]})}><option value="never">Allow automatically</option><option value="always">Ask before every MCP action</option></select></label>
              <p className="field-hint">KChat passes remote MCP servers to the Responses API as native MCP tools. Remote HTTP MCP is supported; local stdio servers need a separate local agent/worker.</p>
              <div className="modal-actions"><button className="secondary" onClick={() => setConnectionFormOpen(false)}>Cancel</button><button className="primary" onClick={saveMcpConnection}>Add MCP server</button></div>
            </>}
            {connectionError && <div className="key-error" role="alert">{connectionError}</div>}
          </div>}
          <div className="connection-section"><div className="connection-section-head"><div><strong>Existing app connectors</strong><span>Already available in KChat</span></div></div>
            <div className="integration-card"><div className="integration-head"><div className="integration-icon"><Github size={17}/></div><div><strong>GitHub</strong><span>Read and edit repositories, branches and pull requests.</span></div></div><input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="GitHub token"/><div className="integration-actions"><button className="secondary" onClick={() => { setGithubToken(""); sessionStorage.removeItem("kchat-github-token"); setIntegrationStatus((prev) => ({ ...prev, github: "Disconnected" })); }}>Disconnect</button><button className="primary" onClick={() => testIntegration("github")}>Test & connect</button></div>{integrationStatus.github && <small>{integrationStatus.github}</small>}</div>
            <div className="integration-card"><div className="integration-head"><div className="integration-icon"><Globe2 size={17}/></div><div><strong>Netlify</strong><span>Inspect projects, deploys and trigger builds.</span></div></div><input type="password" value={netlifyToken} onChange={(e) => setNetlifyToken(e.target.value)} placeholder="Netlify token"/><div className="integration-actions"><button className="secondary" onClick={() => { setNetlifyToken(""); sessionStorage.removeItem("kchat-netlify-token"); setIntegrationStatus((prev) => ({ ...prev, netlify: "Disconnected" })); }}>Disconnect</button><button className="primary" onClick={() => testIntegration("netlify")}>Test & connect</button></div>{integrationStatus.netlify && <small>{integrationStatus.netlify}</small>}</div>
          </div>
          <div className="security-note"><Plug size={14}/><span>Only attach services you trust. External tool results are untrusted data; destructive actions should use approval.</span></div>
          <div className="modal-actions"><button className="primary" onClick={() => { saveIntegrationCredentials(); setIntegrationsOpen(false); }}>Done</button></div>
        </Modal>
      )}
      {agentBuilderOpen && (
        <Modal title="AI Agent Builder" icon={<Bot size={17} />} onClose={() => setAgentBuilderOpen(false)}>
          <div className="agent-builder-head"><div><strong>Build a reusable AI teammate</strong><p>Configure its brain, tools, memory and permission policy.</p></div><span className="builder-status">{agentDraft.enabled ? "Enabled" : "Disabled"}</span></div>
          <div className="form-grid"><label className="field"><span>Name</span><input value={agentDraft.name} onChange={e => setAgentDraft({...agentDraft,name:e.target.value})} placeholder="Coding Agent" /></label><label className="field"><span>Description</span><input value={agentDraft.description} onChange={e => setAgentDraft({...agentDraft,description:e.target.value})} placeholder="Build and verify software" /></label></div>
          <label className="field"><span>Instructions</span><textarea rows={7} value={agentDraft.instructions} onChange={e => setAgentDraft({...agentDraft,instructions:e.target.value})} /></label>
          <div className="form-grid"><label className="field"><span>Model</span><select value={agentDraft.modelId} onChange={e => setAgentDraft({...agentDraft,modelId:e.target.value})}><option value="">Default model</option>{modelConnections.map(m => <option key={m.id} value={m.id}>{m.provider} · {m.model}</option>)}</select></label><label className="field"><span>Memory</span><select value={agentDraft.memory} onChange={e => setAgentDraft({...agentDraft,memory:e.target.value as AgentDefinition["memory"]})}><option value="none">None</option><option value="conversation">Conversation</option><option value="persistent">Persistent</option></select></label></div>
          <div className="form-grid"><label className="field"><span>Approval policy</span><select value={agentDraft.approval} onChange={e => setAgentDraft({...agentDraft,approval:e.target.value as AgentDefinition["approval"]})}><option value="always">Always ask</option><option value="sensitive">Ask for sensitive actions</option><option value="never">Never ask</option></select></label><label className="setting-toggle"><span><strong>Enabled</strong><small>Allow this agent to be run.</small></span><input type="checkbox" checked={agentDraft.enabled} onChange={e => setAgentDraft({...agentDraft,enabled:e.target.checked})}/></label></div>
          <div className="agent-tool-picker"><strong>Tools</strong><div className="agent-tool-grid">{["Code runtime","GitHub","Netlify","API tools","Remote MCP","Web research","File search","Git status"].map(tool => <label key={tool}><input type="checkbox" checked={agentDraft.tools.includes(tool)} onChange={e => setAgentDraft({...agentDraft,tools:e.target.checked?[...agentDraft.tools,tool]:agentDraft.tools.filter(t=>t!==tool)})}/><span>{tool}</span></label>)}</div></div>
          <div className="agent-test"><div><strong>Test agent</strong><small>Run the configured instructions against your selected model.</small></div><input value={agentTestPrompt} onChange={e => setAgentTestPrompt(e.target.value)} placeholder="Give the agent a task…"/><button className="secondary" onClick={async () => { const model=modelConnections.find(m=>m.id===agentDraft.modelId)||activeModel; if(!model){setAgentTestOutput("Connect a model first.");return;} try { setAgentTestOutput("Agent running…"); const result=await runConfiguredAgent(agentDraft, agentTestPrompt.trim()||"Inspect the workspace and report what you find."); setAgentTestOutput(result); } catch(e){setAgentTestOutput(e instanceof Error?e.message:"Agent test failed");} }} >Test</button>{agentTestOutput && <pre>{agentTestOutput}</pre>}</div>
          <div className="modal-actions"><button className="secondary" onClick={() => setAgentBuilderOpen(false)}>Cancel</button><button className="primary" onClick={() => { const saved={...agentDraft,id:agentDraft.id||crypto.randomUUID()}; setAgents(prev=>prev.some(a=>a.id===saved.id)?prev.map(a=>a.id===saved.id?saved:a):[...prev,saved]); setAgentBuilderOpen(false); }}>Save agent</button></div>
        </Modal>
      )}
      {pendingAgentApproval && (
        <Modal title="Agent approval required" icon={<ShieldCheck size={17} />} onClose={() => { agentApprovalResolver.current?.(false); setPendingAgentApproval(null); }}>
          <div className="approval-card">
            <strong>{pendingAgentApproval.tool}</strong>
            <p>This agent wants to perform a change outside the sandbox. Review the action before allowing it.</p>
            <pre>{JSON.stringify(pendingAgentApproval.args, null, 2)}</pre>
          </div>
          <div className="modal-actions"><button className="secondary" onClick={() => { agentApprovalResolver.current?.(false); setPendingAgentApproval(null); }}>Deny</button><button className="primary" onClick={() => { agentApprovalResolver.current?.(true); setPendingAgentApproval(null); }}>Allow once</button></div>
        </Modal>
      )}
      {settingsOpen && (
        <Modal title="KChat settings" icon={<Settings2 size={17} />} onClose={() => setSettingsOpen(false)}>
          <div className="settings-tabs">
            {([['model','Model'],['behavior','Behavior'],['privacy','Privacy']] as const).map(([id,label]) => <button key={id} className={settingsTab === id ? "selected" : ""} onClick={() => setSettingsTab(id)}>{label}</button>)}
          </div>
          {settingsTab === "model" && <>
            <label className="field"><span>Model ID</span><input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /><small>Use the exact model ID available to your API account.</small></label>
            <label className="field"><span>System instructions</span><textarea rows={5} value={settings.system} onChange={(e) => setSettings({ ...settings, system: e.target.value })} /></label>
            <label className="field range-field"><span>Temperature <b>{settings.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={settings.temperature} onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })} /></label>
            <label className="field"><span>Max output tokens</span><input type="number" min="256" max="32768" step="256" value={settings.maxOutputTokens} onChange={(e) => setSettings({ ...settings, maxOutputTokens: Math.max(256, Math.min(32768, Number(e.target.value) || 4096)) })} /><small>Limits generated output. 4,096 is a practical default and avoids oversized credit reservations on providers such as OpenRouter.</small></label>
          </>}
          {settingsTab === "behavior" && <>
            <label className="setting-toggle"><span><strong>Enter to send</strong><small>Press Enter to send; Shift+Enter creates a new line.</small></span><input type="checkbox" checked={settings.enterToSend} onChange={(e) => setSettings({ ...settings, enterToSend: e.target.checked })} /></label>
            <label className="setting-toggle"><span><strong>Activity log</strong><small>Show request, tool and generation events above the composer.</small></span><input type="checkbox" checked={settings.showActivityLog} onChange={(e) => setSettings({ ...settings, showActivityLog: e.target.checked })} /></label>
          </>}
          {settingsTab === "privacy" && <>
            <div className="privacy-note"><strong>Browser-local storage</strong><p>KChat can keep chats and settings on this device. Turn either option off to stop local persistence and remove the existing local copy.</p></div>
            <label className="setting-toggle"><span><strong>Save conversations locally</strong><small>Keep your chat history in this browser's local storage.</small></span><input type="checkbox" checked={settings.persistChats} onChange={(e) => setSettings({ ...settings, persistChats: e.target.checked })} /></label>
            <label className="setting-toggle"><span><strong>Save settings locally</strong><small>Remember preferences such as system instructions and temperature.</small></span><input type="checkbox" checked={settings.persistSettings} onChange={(e) => setSettings({ ...settings, persistSettings: e.target.checked })} /></label>
            <p className="field-hint">API keys and connector credentials remain in session storage and are not exported with chats.</p>
          </>}
          <div className="modal-actions"><button className="secondary" onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); setSettingsTab("model"); }}>Reset</button><button className="primary" onClick={() => setSettingsOpen(false)}>Done</button></div>
        </Modal>
      )}
    </main>
  );
}

function CodeWorkspace({ project, file, pane, command, logs, runtimeStatus, previewUrl, fileContent, onProject, onFile, onPane, onCommand, onRun, onStartRuntime, onStopRuntime, onPreview, onRefreshFile, onSaveFile, onAddLog }: { project: string; file: string; pane: "files" | "terminal" | "browser" | "agent"; command: string; logs: string[]; runtimeStatus: RuntimeStatus; previewUrl: string; fileContent: string; onProject: (value: string) => void; onFile: (value: string) => void; onPane: (value: "files" | "terminal" | "browser" | "agent") => void; onCommand: (value: string) => void; onRun: () => void; onStartRuntime: () => void; onStopRuntime: () => void; onPreview: () => void; onRefreshFile: () => void; onSaveFile: (content: string) => void; onAddLog: (text: string) => void }){
  const files = ["app/page.tsx", "app/globals.css", "app/layout.tsx", "lib/tool-registry.ts", "package.json", "README.md"];
  const [editorValue, setEditorValue] = useState("");
  const snippets: Record<string, string> = {
    "app/page.tsx": "export default function Home() {\n  return <main>KChat</main>;\n}",
    "app/globals.css": ".app { min-height: 100dvh; }\n.workspace { display: flex; }",
    "app/layout.tsx": "export default function RootLayout({ children }) {\n  return <html><body>{children}</body></html>;\n}",
    "lib/tool-registry.ts": "export const tools = [\n  // Connected tools\n];",
    "package.json": "{\n  \"scripts\": { \"dev\": \"next dev\", \"build\": \"next build\" }\n}",
    "README.md": "# KChat\n\nPrivate AI workspace."
  };
  useEffect(() => { setEditorValue(fileContent || snippets[file] || "// Start the E2B runtime and select a file to inspect it."); }, [file, fileContent]);
  const paneTitle = pane === "files" ? "Files" : pane === "terminal" ? "Terminal" : pane === "browser" ? "Browser" : "Agent thread";
  return <div className="code-workspace">
    <div className="code-toolbar">
      <div className="code-project"><div className="project-icon"><Code2 size={15}/></div><div><strong>{project}</strong><small>Project workspace</small></div></div>
      <div className="code-toolbar-actions"><span className={`runtime-pill ${runtimeStatus}`}><i/> {runtimeStatus === "ready" ? "E2B ready" : runtimeStatus === "starting" ? "Starting…" : runtimeStatus === "error" ? "E2B error" : "E2B offline"}</span>{runtimeStatus === "ready" ? <button onClick={onStopRuntime}><Square size={12}/> Stop</button> : <button onClick={onStartRuntime}><Play size={13}/> Start runtime</button>}<button onClick={onRun}><Play size={13}/> Run</button><button><GitBranch size={13}/> main</button><button><SplitSquareHorizontal size={13}/> Split</button></div>
    </div>
    <div className="code-layout">
      <aside className="code-rail">
        {[ ["files",FolderTree,"Files"], ["terminal",Terminal,"Terminal"], ["browser",MonitorPlay,"Browser"], ["agent",Bot,"Agent"] ].map(([id, Icon, label]) => <button key={id as string} className={pane === id ? "selected" : ""} onClick={() => onPane(id as any)} title={label as string}><Icon size={16}/><span>{label as string}</span></button>)}
      </aside>
      <div className="code-main">
        <div className="code-main-head"><span><i/> {paneTitle}</span><div><button title="Command bar"><Command size={14}/></button><button title="More"><MoreHorizontal size={14}/></button></div></div>
        {pane === "files" && <div className="code-files-view">
          <div className="file-tree"><div className="tree-project"><ChevronDown size={13}/><strong>{project}</strong></div>{files.map(path => <button key={path} className={file === path ? "selected" : ""} onClick={() => onFile(path)}><FileText size={13}/><span>{path}</span></button>)}</div>
          <div className="code-editor"><div className="editor-tab"><FileText size={13}/>{file}<span>·</span><button onClick={onRefreshFile}>refresh</button><button onClick={() => onSaveFile(editorValue)}>save</button></div><textarea className="code-editor-input" value={editorValue} onChange={(e) => setEditorValue(e.target.value)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); onSaveFile(editorValue); } }} spellCheck={false} aria-label={`Edit ${file}`} /></div>
        </div>}
        {pane === "terminal" && <div className="terminal-view"><div className="terminal-output">{logs.map((line, i) => <div key={i} className={line.startsWith("$") ? "command-line" : ""}>{line}</div>)}</div><div className="terminal-input"><span>$</span><input value={command} onChange={e => onCommand(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onRun(); }} placeholder="npm run dev"/><button onClick={onRun}><ArrowUp size={14}/></button></div></div>}
        {pane === "browser" && <div className="browser-view"><div className="browser-bar"><span>{previewUrl || "localhost:3000"}</span><button onClick={onPreview}><Play size={12}/></button></div>{previewUrl ? <iframe className="live-preview" src={previewUrl} title={`${project} live preview`} /> : <div className="browser-preview"><div className="preview-orb"><Sparkles size={22}/></div><strong>{project}</strong><span>Live E2B preview</span><small>Run your development server on port 3000, then refresh this pane.</small></div>}</div>}
        {pane === "agent" && <div className="agent-view"><div className="agent-card"><div className="agent-avatar"><Bot size={18}/></div><div><strong>Build Agent</strong><span>Scoped to {project}</span></div><button onClick={() => onAddLog("Agent thread started for this workspace.")}>Start</button></div><div className="agent-empty"><Sparkles size={24}/><h3>What should we build?</h3><p>Give the coding agent a bounded objective. It can inspect files, propose changes and run verification once a local execution backend is connected.</p></div></div>}
        <div className="code-commandbar"><Command size={14}/><input placeholder="Ask the workspace agent to inspect, change, run or explain…" onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { onAddLog(`Agent request: ${e.currentTarget.value.trim()}`); e.currentTarget.value = ""; } }}/><span>⌘↵</span></div>
      </div>
    </div>
  </div>;
}

function AgentWorkspace({ agents, onBuild, onRun, onOpenCode, onNewChat }: { agents: AgentDefinition[]; onBuild: () => void; onRun: (agent: AgentDefinition) => void; onOpenCode: () => void; onNewChat: () => void }) {
  return <div className="agent-workspace"><div className="agent-workspace-head"><div><span className="eyebrow-inline"><i/> Agent studio</span><h1>Build AI teammates.</h1><p>Create reusable agents with their own instructions, models, tools and policies.</p></div><button className="primary" onClick={onBuild}><Plus size={14}/> Build agent</button></div><div className="agent-grid">{agents.length ? agents.map(agent => <div className="agent-card" key={agent.id}><div className="agent-avatar"><Bot size={18}/></div><div className="agent-card-copy"><strong>{agent.name}</strong><span>{agent.description}</span><small>{agent.tools.length} tools · {agent.memory} memory · {agent.approval} approval</small></div><div className="agent-card-actions"><span className={`agent-state ${agent.enabled ? "on" : "off"}`}>{agent.enabled ? "Ready" : "Disabled"}</span><button className="secondary" disabled={!agent.enabled} onClick={() => onRun(agent)}>Run</button></div></div>) : <div className="agent-empty"><Bot size={25}/><h3>No agents yet</h3><p>Build your first reusable AI teammate.</p><button className="secondary" onClick={onBuild}>Open Agent Builder</button></div>}</div>{agentRunOutput && <pre className="agent-run-output">{agentRunOutput}</pre>}<div className="agent-quick-actions"><button onClick={onOpenCode}><Code2 size={14}/> Open Code workspace</button><button onClick={onNewChat}><MessageCircle size={14}/> Start chat</button></div></div>;
}

function ChatTile({ chat, model, models, sending, draft, onModel, onDraft, onSend, onStop, onExpand, onExport, onClose }: { chat: Chat; model: ModelConnection | null; models: ModelConnection[]; sending: boolean; draft: string; onModel: (id: string) => void; onDraft: (value: string) => void; onSend: () => void; onStop: () => void; onExpand: () => void; onExport: () => void; onClose: () => void }) {
  return <article className="chat-tile">
    <div className="chat-tile-head"><div className="chat-tile-title"><span className="tile-status" data-running={sending ? "true" : "false"}/><strong>{chat.title}</strong></div><div className="tile-actions"><button title="Export chat" onClick={onExport}><Download size={14}/></button><button title="Expand" onClick={onExpand}><Maximize2 size={14}/></button><button title="Remove from grid" onClick={onClose}><X size={14}/></button></div></div>
    <div className="tile-model-row"><span>Model</span><select value={model?.id || ""} onChange={(e) => onModel(e.target.value)} disabled={!models.length} aria-label={`Model for ${chat.title}`}>{models.length ? models.map((item) => <option key={item.id} value={item.id}>{item.provider} · {item.model}</option>) : <option value="">Connect a model</option>}</select></div>
    <div className="tile-messages">{chat.messages.length === 0 ? <div className="tile-empty"><Sparkles size={19}/><span>Ready for a separate conversation.</span></div> : chat.messages.map((message) => <div className={`tile-message ${message.role}`} key={message.id}><span className="tile-role">{message.role === "user" ? "You" : "KChat"}</span><p>{message.content || <span className="thinking"><i/><i/><i/></span>}</p></div>)}</div>
    <div className="tile-composer"><textarea value={draft} onChange={(e) => onDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }} placeholder="Message…" rows={1}/>{sending ? <button className="send-btn stop" onClick={onStop}><Square size={12} fill="currentColor"/></button> : <button className="send-btn" onClick={onSend} disabled={!draft.trim()}><ArrowUp size={15}/></button>}</div>
  </article>;
}

function Modal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    window.history.pushState({ kchatModal: true }, "", window.location.href);
    const handleBack = () => onClose();
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const close = () => { onClose(); window.history.back(); };
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><div className="modal"><div className="modal-head"><div className="modal-title"><span>{icon}</span><strong>{title}</strong></div><button className="icon-btn" onClick={close}><X size={18} /></button></div>{children}</div></div>;
}
