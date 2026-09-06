"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
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
} from "lucide-react";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };
type Settings = { model: string; system: string; temperature: number };

const KEY = "kchat-api-key";
const CHATS = "kchat-chats-v3";
const SETTINGS = "kchat-settings-v3";
const DEFAULT_SETTINGS: Settings = {
  model: "gpt-6",
  temperature: 0.7,
  system: "You are KChat, a capable, thoughtful AI assistant. Be clear, useful, and concise.",
};

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
  return { id: uid(), title: "New conversation", messages: [], updatedAt: Date.now() };
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

function getKey() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(KEY) || "";
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>(() => load(CHATS, [makeChat()]));
  const [activeId, setActiveId] = useState("");
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS, DEFAULT_SETTINGS));
  const [apiKey, setApiKey] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId && chats[0]) setActiveId(chats[0].id);
    setApiKey(getKey());
  }, [chats, activeId]);

  useEffect(() => {
    localStorage.setItem(CHATS, JSON.stringify(chats));
    if (activeId) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeId]);

  useEffect(() => {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const active = chats.find((chat) => chat.id === activeId) || chats[0] || makeChat();
  const visibleChats = useMemo(
    () => chats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())),
    [chats, query],
  );

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
    const value = text.trim();
    if (!value || sending) return;
    if (!apiKey) {
      setKeyOpen(true);
      return;
    }

    setDraft("");
    setError("");
    setSending(true);
    const user: Message = { id: uid(), role: "user", content: value };
    const assistant: Message = { id: uid(), role: "assistant", content: "" };
    const history = active.messages;
    updateActive([...history, user, assistant], history.length ? active.title : value.slice(0, 44));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          instructions: settings.system,
          input: [...history, user].map((message) => ({ role: message.role, content: message.content })),
          temperature: settings.temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error("The model returned no stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          const data = JSON.parse(raw) as { type?: string; delta?: string; error?: { message?: string } };
          if (data.type === "response.output_text.delta") {
            answer += data.delta || "";
            updateActive([...history, user, { ...assistant, content: answer }], history.length ? active.title : value.slice(0, 44));
          }
          if (data.type === "error") throw new Error(data.error?.message || "Model error");
        }
      }

      if (!answer) updateActive([...history, user, { ...assistant, content: "The model returned an empty response." }]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message.replace(/\s+/g, " ").slice(0, 320));
        updateActive([...history, user]);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setSending(false);
  }

  function saveKey() {
    const value = apiKey.trim();
    if (!value) return;
    sessionStorage.setItem(KEY, value);
    setApiKey(value);
    setKeyOpen(false);
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {}
  }

  return (
    <main className={`app ${dark ? "dark" : "light"}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" />

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
              {!collapsed && <Trash2 className="chat-delete" size={14} onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }} />}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="workspace-card">
              <div className="avatar"><UserRound size={15} /></div>
              <div className="workspace-copy"><strong>Personal workspace</strong><small>{apiKey ? "Connected • BYOK" : "Private • BYOK"}</small></div>
              <MoreHorizontal size={16} />
            </div>
          )}
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
            <button className="model-select" onClick={() => setSettingsOpen(true)}>
              <span className="status-dot" />
              <span>{settings.model}</span>
              <ChevronDown size={13} />
            </button>
          </div>
          <div className="top-right">
            <button className="top-link" onClick={() => setKeyOpen(true)}><KeyRound size={14} />{apiKey ? "Connected" : "Connect"}</button>
            <div className="mini-avatar">F</div>
          </div>
        </header>

        <div className="conversation">
          {active.messages.length === 0 ? (
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
              <div className="conversation-title"><span>{active.title}</span><i /></div>
              {active.messages.map((message) => (
                <div className={`message-row ${message.role}`} key={message.id}>
                  {message.role === "assistant" && <div className="assistant-badge"><Sparkles size={14} /></div>}
                  <div className="message-body">
                    {message.role === "user" ? <div className="user-bubble">{message.content}</div> : <div className="assistant-text">{message.content || <span className="thinking"><i /><i /><i /></span>}</div>}
                    {message.role === "assistant" && message.content && (
                      <div className="message-actions">
                        <button onClick={() => copy(message.content, message.id)}>{copied === message.id ? <Check size={13} /> : <Copy size={13} />} {copied === message.id ? "Copied" : "Copy"}</button>
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
          <div className="composer-glow" />
          <div className="composer">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message KChat…" rows={1} />
            <div className="composer-bottom">
              <div className="composer-left"><button><Paperclip size={17} /></button><button><Plus size={18} /></button><span className="composer-model">{settings.model}</span></div>
              <div className="composer-right"><span className="connection-label"><i />{apiKey ? "Ready" : "API key required"}</span>{sending ? <button className="send-btn stop" onClick={stop}><Square size={13} fill="currentColor" /></button> : <button className="send-btn" onClick={() => send()} disabled={!draft.trim()}><ArrowUp size={17} /></button>}</div>
            </div>
          </div>
          <p className="disclaimer">KChat may make mistakes. Requests are sent directly from your browser using your own API key.</p>
        </div>
      </section>

      {keyOpen && (
        <Modal title="Connect your model" icon={<KeyRound size={17} />} onClose={() => setKeyOpen(false)}>
          <div className="modal-intro"><div className="intro-glow"><KeyRound size={20} /></div><div><strong>Bring your own key</strong><p>Your key stays in this browser session and is sent directly to the API. KChat never sends it to its own server.</p></div></div>
          <label className="field"><span>OpenAI API key</span><input autoFocus type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" onKeyDown={(e) => e.key === "Enter" && saveKey()} /></label>
          <div className="security-note"><KeyRound size={14} /><span>Never paste a key into GitHub, screenshots, or source code.</span></div>
          <div className="modal-actions"><button className="secondary" onClick={() => setKeyOpen(false)}>Cancel</button><button className="primary" onClick={saveKey}>Connect key</button></div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="KChat settings" icon={<Settings2 size={17} />} onClose={() => setSettingsOpen(false)}>
          <div className="settings-tabs"><span className="selected">Model</span><span>Behavior</span><span>Privacy</span></div>
          <label className="field"><span>Model ID</span><input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /><small>Use the exact model ID available to your API account.</small></label>
          <label className="field"><span>System instructions</span><textarea rows={5} value={settings.system} onChange={(e) => setSettings({ ...settings, system: e.target.value })} /></label>
          <label className="field range-field"><span>Temperature <b>{settings.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={settings.temperature} onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })} /></label>
          <div className="modal-actions"><button className="secondary" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>Reset</button><button className="primary" onClick={() => setSettingsOpen(false)}>Save changes</button></div>
        </Modal>
      )}
    </main>
  );
}

function Modal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-head"><div className="modal-title"><span>{icon}</span><strong>{title}</strong></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}
