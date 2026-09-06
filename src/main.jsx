import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bot, Check, ChevronDown, Copy, KeyRound, Menu, Moon, Plus, Send, Settings, ShieldCheck, Sparkles, Sun, Trash2, User, X } from 'lucide-react';
import './styles.css';

const KEY_STORE = 'kchat-api-key';
const SETTINGS_STORE = 'kchat-settings';
const CHATS_STORE = 'kchat-chats';

const DEFAULT_SETTINGS = { model: 'gpt-6', temperature: 0.7, system: 'You are KChat, a helpful, clear and capable AI assistant.' };

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; } }
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function initialChat() { return { id: uid(), title: 'New chat', messages: [] }; }

async function streamResponse({ apiKey, model, system, messages, temperature, onText }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, instructions: system, input: messages.map(m => ({ role: m.role, content: [{ type: 'input_text', text: m.content }] })), temperature, stream: true })
  });
  if (!response.ok) {
    let detail = '';
    try { const data = await response.json(); detail = data?.error?.message || ''; } catch {}
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (!response.body) throw new Error('Streaming is not available in this browser.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          if (data.type === 'response.output_text.delta') { answer += data.delta || ''; onText(answer); }
          if (data.type === 'error') throw new Error(data.error?.message || 'Model error');
        } catch (error) {
          if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error;
        }
      }
    }
  }
  return answer;
}

function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(KEY_STORE) || '');
  const [keyInput, setKeyInput] = useState(() => sessionStorage.getItem(KEY_STORE) || '');
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadJson(SETTINGS_STORE, {}) }));
  const [chats, setChats] = useState(() => loadJson(CHATS_STORE, []));
  const [activeId, setActiveId] = useState(() => loadJson(CHATS_STORE, [])[0]?.id || null);
  const [sidebar, setSidebar] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('kchat-theme') !== 'light');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const bottomRef = useRef(null);

  const active = chats.find(c => c.id === activeId) || null;
  const needsKey = !apiKey;

  useEffect(() => { localStorage.setItem(CHATS_STORE, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem(SETTINGS_STORE, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('kchat-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length, sending]);

  const ensureChat = () => {
    if (active) return active;
    const chat = initialChat();
    setChats([chat]); setActiveId(chat.id); return chat;
  };

  const saveKey = () => {
    const value = keyInput.trim();
    if (!value) { setError('Paste your API key first.'); return; }
    sessionStorage.setItem(KEY_STORE, value); setApiKey(value); setError('');
  };

  const newChat = () => { const chat = initialChat(); setChats(prev => [chat, ...prev]); setActiveId(chat.id); setInput(''); setError(''); };
  const deleteChat = id => { setChats(prev => prev.filter(c => c.id !== id)); if (activeId === id) setActiveId(chats.find(c => c.id !== id)?.id || null); };
  const clearKey = () => { sessionStorage.removeItem(KEY_STORE); setApiKey(''); setKeyInput(''); setSettingsOpen(false); };

  const send = async () => {
    const text = input.trim(); if (!text || sending) return;
    if (!apiKey) { setSettingsOpen(true); setError('Add your API key to start chatting.'); return; }
    const chat = ensureChat();
    const userMessage = { id: uid(), role: 'user', content: text };
    const history = [...chat.messages, userMessage];
    const title = chat.messages.length ? chat.title : text.slice(0, 42);
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, title, messages: [...history, { id: uid(), role: 'assistant', content: '' }] } : c));
    setInput(''); setSending(true); setError('');
    try {
      await streamResponse({ apiKey, model: settings.model.trim() || DEFAULT_SETTINGS.model, system: settings.system, messages: history, temperature: Number(settings.temperature), onText: answer => setChats(prev => prev.map(c => c.id === chat.id ? { ...c, messages: [...history, { id: 'stream', role: 'assistant', content: answer }] } : c)) });
    } catch (e) {
      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, messages: history } : c)); setError(e.message || 'Something went wrong.');
    } finally { setSending(false); }
  };

  const copy = async text => { await navigator.clipboard?.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1200); };
  const suggestions = ['Explain a difficult concept simply', 'Help me build a project', 'Analyze this idea critically', 'Write and improve some code'];

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? 'open' : 'closed'}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><strong>KChat</strong><span>AI workspace</span></div>
      <button className="new-chat" onClick={newChat}><Plus size={17}/> New chat</button>
      <div className="history-label">Chats</div>
      <div className="chat-list">
        {chats.map(chat => <button key={chat.id} className={`chat-item ${chat.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(chat.id)}><span>{chat.title}</span><Trash2 size={14} onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}/></button>)}
        {!chats.length && <div className="empty-history">Your conversations will appear here.</div>}
      </div>
      <div className="sidebar-bottom"><button className="sidebar-action" onClick={() => setSettingsOpen(true)}><Settings size={17}/> Settings</button><button className="sidebar-action" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17}/> : <Moon size={17}/>} {dark ? 'Light mode' : 'Dark mode'}</button></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="icon-button" onClick={() => setSidebar(v => !v)} aria-label="Toggle sidebar">{sidebar ? <X size={19}/> : <Menu size={19}/>}</button><div className="model-pill"><span className="status-dot"/> {settings.model || 'gpt-6'} <ChevronDown size={14}/></div><button className="icon-button" onClick={() => setSettingsOpen(true)}><Settings size={18}/></button></header>

      <section className="conversation">
        {!active?.messages.length ? <div className="welcome"><div className="hero-icon"><Sparkles size={25}/></div><h1>What are you thinking about?</h1><p>Chat with your own AI model using your own API key.</p>{needsKey && <div className="key-card"><div className="key-card-icon"><KeyRound size={19}/></div><div className="key-copy"><strong>Connect your API key</strong><span>Your key stays in this browser session and is sent directly to the API.</span></div><button onClick={() => setSettingsOpen(true)}>Add key</button></div>}<div className="suggestions">{suggestions.map(s => <button key={s} onClick={() => setInput(s)}>{s}</button>)}</div></div> : <div className="messages">{active.messages.map((m, i) => <article key={m.id || i} className={`message ${m.role}`}><div className="avatar">{m.role === 'assistant' ? <Bot size={17}/> : <User size={17}/>}</div><div className="message-body"><div className="message-role">{m.role === 'assistant' ? 'KChat' : 'You'}</div><div className="message-text">{m.content || (sending && i === active.messages.length - 1 ? <span className="typing"><i/><i/><i/></span> : '')}</div>{m.content && <button className="copy-button" onClick={() => copy(m.content)}>{copied === m.content ? <Check size={13}/> : <Copy size={13}/>} {copied === m.content ? 'Copied' : 'Copy'}</button>}</div></article>)}<div ref={bottomRef}/></div>}
      </section>

      <div className="composer-wrap"><div className="composer"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={apiKey ? 'Message KChat…' : 'Add your API key to start…'} rows={1}/><button className="send-button" disabled={!input.trim() || sending} onClick={send}>{sending ? <span className="spinner"/> : <Send size={18}/>}</button></div><div className="composer-note">Enter to send · Shift + Enter for a new line · Your API key is not sent to KChat's servers.</div>{error && <div className="error-banner">{error}</div>}</div>
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setSettingsOpen(false)}><section className="settings-modal"><div className="modal-header"><div><span className="eyebrow">Configuration</span><h2>KChat settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18}/></button></div><div className="security-note"><ShieldCheck size={18}/><div><strong>Bring your own key</strong><span>KChat runs the request from your browser. The key is kept in session storage and is never included in KChat chat history.</span></div></div><label>OpenAI API key<input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Paste your API key" autoComplete="off"/><small>For privacy, this app does not save your key to the server. Clearing the tab/session removes it.</small></label><div className="modal-row"><button className="primary-button" onClick={saveKey}>{apiKey ? 'Update key' : 'Connect key'}</button>{apiKey && <button className="danger-button" onClick={clearKey}>Remove key</button>}</div><div className="divider"/><label>Model<input value={settings.model} onChange={e => setSettings(s => ({...s, model:e.target.value}))} placeholder="gpt-6"/><small>Use the model ID available to your API account.</small></label><label>System instructions<textarea rows={4} value={settings.system} onChange={e => setSettings(s => ({...s, system:e.target.value}))}/></label><label>Temperature <strong>{settings.temperature}</strong><input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={e => setSettings(s => ({...s, temperature:e.target.value}))}/></label><button className="secondary-button" onClick={() => { setSettings(DEFAULT_SETTINGS); }}>Reset model settings</button></section></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
