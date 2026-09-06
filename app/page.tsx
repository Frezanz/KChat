"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Copy,
  KeyRound,
  Menu,
  MessageSquarePlus,
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
  Trash2,
  UserRound,
  X,
} from 'lucide-react';

type Role = 'user' | 'assistant';
type Message = { id: string; role: Role; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };

type Settings = { model: string; system: string; temperature: number };

const KEY = 'kchat-api-key';
const CHATS = 'kchat-chats-v2';
const SETTINGS = 'kchat-settings-v2';
const DEFAULT_SETTINGS: Settings = {
  model: 'gpt-6',
  temperature: 0.7,
  system: 'You are KChat, a capable, thoughtful AI assistant. Be clear, useful, and concise.',
};

const starters = [
  { title: 'Create a plan', text: 'Help me build a realistic plan for learning something difficult.' },
  { title: 'Explain deeply', text: 'Explain a complex concept from first principles, then give examples.' },
  { title: 'Build something', text: 'Give me a strong project idea and help me build it step by step.' },
  { title: 'Think with me', text: 'Challenge my assumptions and help me reason through a difficult decision.' },
];

function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function initialChat(): Chat {
  return { id: id(), title: 'New conversation', messages: [], updatedAt: Date.now() };
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function getStoredKey() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(KEY) || '';
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>(() => load(CHATS, [initialChat()]));
  const [activeId, setActiveId] = useState('');
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS, DEFAULT_SETTINGS));
  const [apiKey, setApiKey] = useState('');
  const [draft, setDraft] = useState('');
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [light, setLight] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveId(prev => prev || chats[0]?.id || ''); setApiKey(getStoredKey()); }, [chats]);
  useEffect(() => { localStorage.setItem(CHATS, JSON.stringify(chats)); endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chats]);
  useEffect(() => { localStorage.setItem(SETTINGS, JSON.stringify(settings)); }, [settings]);

  const active = chats.find(c => c.id === activeId) || chats[0] || initialChat();
  const visibleChats = useMemo(() => chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase())), [chats, search]);

  function newChat() {
    const chat = initialChat();
    setChats(prev => [chat, ...prev]); setActiveId(chat.id); setDraft(''); setError(''); setMobileSidebar(false);
  }

  function deleteChat(chatId: string) {
    setChats(prev => { const next = prev.filter(c => c.id !== chatId); if (!next.length) { const c = initialChat(); setActiveId(c.id); return [c]; } if (chatId === activeId) setActiveId(next[0].id); return next; });
  }

  function updateActive(messages: Message[], title?: string) {
    setChats(prev => prev.map(c => c.id === active.id ? { ...c, messages, title: title ?? c.title, updatedAt: Date.now() } : c));
  }

  async function send(text = draft) {
    const value = text.trim();
    if (!value || sending) return;
    if (!apiKey) { setShowKey(true); return; }
    setDraft(''); setError(''); setSending(true);
    const user: Message = { id: id(), role: 'user', content: value };
    const assistant: Message = { id: id(), role: 'assistant', content: '' };
    const nextMessages = [...active.messages, user, assistant];
    updateActive(nextMessages, active.messages.length ? active.title : value.slice(0, 42));
    const controller = new AbortController(); abortRef.current = controller;

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          instructions: settings.system,
          input: active.messages.concat(user).map(m => ({ role: m.role, content: m.content })),
          temperature: settings.temperature,
          stream: true,
        }),
      });
      if (!response.ok) { const body = await response.text(); throw new Error(body || `Request failed (${response.status})`); }
      if (!response.body) throw new Error('The model returned no stream.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = '';
      while (true) {
        const { done, value: chunk } = await reader.read(); if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const event of events) {
          const line = event.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue; const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue;
          const data = JSON.parse(raw) as { type?: string; delta?: string; error?: { message?: string } };
          if (data.type === 'response.output_text.delta') { answer += data.delta || ''; updateActive([...active.messages, user, { ...assistant, content: answer }], active.messages.length ? active.title : value.slice(0, 42)); }
          if (data.type === 'error') throw new Error(data.error?.message || 'Model error');
        }
      }
      if (!answer) updateActive([...active.messages, user, { ...assistant, content: 'The model returned an empty response.' }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setError((e as Error).message.replace(/\s+/g, ' ').slice(0, 300)); updateActive([...active.messages, user]); }
    } finally { abortRef.current = null; setSending(false); }
  }

  function stop() { abortRef.current?.abort(); setSending(false); }
  function saveKey() { sessionStorage.setItem(KEY, apiKey.trim()); setShowKey(false); }
  function copy(text: string) { navigator.clipboard?.writeText(text); }

  return (
    <main className={`app ${light ? 'light' : ''}`}>
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebar ? 'mobile-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><span>KChat</span></div>
        <button className="new-chat" onClick={newChat}><MessageSquarePlus size={18}/><span>New chat</span><kbd>⌘ K</kbd></button>
        {!sidebarCollapsed && <>
          <div className="sidebar-search"><Search size={16}/><input placeholder="Search chats" value={search} onChange={e => setSearch(e.target.value)}/></div>
          <div className="history-label">Recent</div>
          <div className="chat-list">{visibleChats.map(chat => <button className={`chat-item ${chat.id === active.id ? 'active' : ''}`} key={chat.id} onClick={() => { setActiveId(chat.id); setMobileSidebar(false); }}><MessageSquarePlus size={15}/><span>{chat.title}</span><Trash2 size={14} className="chat-delete" onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}/></button>)}</div>
        </>}
        <div className="sidebar-bottom">
          {!sidebarCollapsed && <div className="profile-card"><div className="avatar"><UserRound size={16}/></div><div><strong>Personal workspace</strong><small>Private • BYOK</small></div><MoreHorizontal size={17}/></div>}
          <button className="side-action" onClick={() => setShowKey(true)}><KeyRound size={17}/><span>API key</span></button>
          <button className="side-action" onClick={() => setShowSettings(true)}><Settings2 size={17}/><span>Settings</span></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="top-left"><button className="icon-btn mobile-only" onClick={() => setMobileSidebar(true)}><Menu size={20}/></button><button className="icon-btn desktop-only" onClick={() => setSidebarCollapsed(v => !v)}><PanelLeft size={19}/></button><button className="model-pill"><Sparkles size={15}/><span>{settings.model}</span><ChevronDown size={14}/></button></div>
          <div className="top-right"><button className="icon-btn" onClick={() => setLight(v => !v)} title="Toggle theme">{light ? <Sun size={18}/> : <Sun size={18}/>}</button><button className="icon-btn" onClick={() => setShowSettings(true)}><Settings2 size={18}/></button><div className="mini-avatar">F</div></div>
        </header>

        <div className="conversation">
          {active.messages.length === 0 ? <div className="welcome">
            <div className="hero-orb"><Sparkles size={30}/></div>
            <p className="eyebrow">Your private AI workspace</p>
            <h1>What can I help you <em>create?</em></h1>
            <p className="subtitle">Think, build, learn, and explore with your own model access.</p>
            <div className="starter-grid">{starters.map(s => <button key={s.title} onClick={() => send(s.text)}><span>{s.title}</span><small>{s.text}</small><ArrowUp size={15}/></button>)}</div>
          </div> : <div className="messages">{active.messages.map((m, i) => <div className={`message-row ${m.role}`} key={m.id}>{m.role === 'assistant' && <div className="assistant-mark"><Sparkles size={15}/></div>}<div className="message-body">{m.role === 'user' ? <div className="user-bubble">{m.content}</div> : <div className="assistant-text">{m.content || <span className="thinking"><i/><i/><i/></span>}</div>}{m.role === 'assistant' && m.content && <div className="message-actions"><button onClick={() => copy(m.content)}><Copy size={14}/> Copy</button><button><Plus size={14}/> More</button></div>}</div></div>)}<div ref={endRef}/></div>}
          {error && <div className="error"><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}
        </div>

        <div className="composer-wrap">
          <div className="composer"><textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask KChat anything…" rows={1}/><div className="composer-bottom"><div className="composer-tools"><button title="Attach"><Paperclip size={18}/></button><button title="Tools"><Plus size={18}/></button></div><div className="composer-meta"><span>{apiKey ? 'API connected' : 'Add your API key to start'}</span>{sending ? <button className="send stop" onClick={stop}><Square size={15} fill="currentColor"/></button> : <button className="send" onClick={() => send()} disabled={!draft.trim()}><ArrowUp size={18}/></button>}</div></div></div>
          <p className="disclaimer">KChat can make mistakes. Your API key is stored only in this browser session and sent directly to the selected API.</p>
        </div>
      </section>

      {showKey && <Modal title="Connect your model" icon={<KeyRound size={18}/>} onClose={() => setShowKey(false)}><p className="modal-copy">Paste your API key. KChat keeps it in <code>sessionStorage</code> and sends requests directly from your browser.</p><label className="field"><span>API key</span><input autoFocus type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" onKeyDown={e => e.key === 'Enter' && saveKey()}/></label><div className="modal-note"><KeyRound size={15}/> Never commit a key to GitHub or ship it inside source code.</div><div className="modal-actions"><button className="secondary" onClick={() => setShowKey(false)}>Cancel</button><button className="primary" onClick={saveKey}>Save key</button></div></Modal>}
      {showSettings && <Modal title="KChat settings" icon={<Settings2 size={18}/>} onClose={() => setShowSettings(false)}><label className="field"><span>Model ID</span><input value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})}/></label><label className="field"><span>System instructions</span><textarea rows={5} value={settings.system} onChange={e => setSettings({...settings, system: e.target.value})}/></label><label className="field"><span>Temperature <b>{settings.temperature.toFixed(1)}</b></span><input type="range" min="0" max="1" step="0.1" value={settings.temperature} onChange={e => setSettings({...settings, temperature: Number(e.target.value)})}/></label><div className="modal-actions"><button className="primary" onClick={() => setShowSettings(false)}>Done</button></div></Modal>}
    </main>
  );
}

function Modal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-head"><div className="modal-title"><span>{icon}</span><strong>{title}</strong></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>;
}
