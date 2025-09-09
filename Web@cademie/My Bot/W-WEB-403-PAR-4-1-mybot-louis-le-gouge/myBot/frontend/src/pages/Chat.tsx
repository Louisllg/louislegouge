import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../App.css';
import {
  listChats,
  createChat,
  getChat,
  updatePrompt,
  updateTitle,
  resetChat,
  deleteChat,
  // putPreferences,
  sendMessage,
  // getSuggestions,
  type Chat,
  type Message,
  // type Preference,
  // type Animal,
} from '../lib/api';

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  // const [pref, setPref] = useState<Partial<Preference>>({});
  // const [suggestions, setSuggestions] = useState<Animal[]>([]);
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const typeTimer = useRef<number | null>(null);
  const [menu, setMenu] = useState<{ open: boolean; x: number; y: number; chatId: string | null; }>({ open: false, x: 0, y: 0, chatId: null });
  const [confirm, setConfirm] = useState<{ open: boolean; chatId: string | null; title?: string }>(() => ({ open: false, chatId: null }));
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  const openContextMenu = (e: ReactMouseEvent, id: string) => {
    e.preventDefault();
    setMenu({ open: true, x: e.clientX, y: e.clientY, chatId: id });
  };
  const closeMenu = () => setMenu(m => ({ ...m, open: false }));

  const openDeleteConfirm = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    setConfirm({ open: true, chatId, title: chat?.title });
  };
  const closeDeleteConfirm = () => setConfirm({ open: false, chatId: null });

  const activeChat = useMemo(() => chats.find(c => c.id === activeId) || null, [chats, activeId]);

  // Prefilled suggestions
  const quickSuggestions = useMemo(() => [
    "Je vis en appartement, activité moyenne. Quel animal me conseilles-tu ?",
    "Peux-tu me proposer 2 races de chiens adaptées à un débutant ?",
    "Donne une fiche rapide pour un chat hypoallergénique calme.",
    "Quels besoins quotidiens pour un lapin nain ?",
  ], []);

  const useSuggestion = (text: string) => {
    setInput(text);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await listChats();
        setChats(data);
        if (data.length > 0) setActiveId(data[0].id);
      } catch (e: any) {
        setError(`Erreur chargement chats: ${e?.message || e}`);
      }
    })();
    return () => { if (typeTimer.current) window.clearInterval(typeTimer.current); };
  }, []);

  useEffect(() => {
    (async () => {
      if (!activeId) return;
      try {
        const c = await getChat(activeId);
        setSystemPrompt(c.systemPrompt);
        setMessages(c.messages);
        // setPref(c.preferences || {} as any);
        // const s = await getSuggestions(activeId);
        // setSuggestions(s);
        setTimeout(() => scrollToBottom('auto'), 0);
      } catch (e: any) {
        setError(`Erreur chargement chat: ${e?.message || e}`);
      }
    })();
  }, [activeId]);

  const handleCreateChat = async () => {
    try {
      const c = await createChat(titleDraft || 'Nouveau chat', systemPrompt || undefined);
      setChats([c, ...chats]);
      setActiveId(c.id);
      setTitleDraft('');
    } catch (e: any) {
      setError(`Erreur création chat: ${e?.message || e}`);
    }
  };

  const handleUpdateTitle = async () => {
    if (!activeId || !titleDraft) return;
    try {
      const c = await updateTitle(activeId, titleDraft);
      setChats(chats.map(x => x.id === c.id ? c : x));
      setTitleDraft('');
    } catch (e: any) {
      setError(`Erreur renommage: ${e?.message || e}`);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!activeId) return;
    try {
      const c = await updatePrompt(activeId, systemPrompt);
      setChats(chats.map(x => x.id === c.id ? c : x));
    } catch (e: any) {
      setError(`Erreur sauvegarde pré-prompt: ${e?.message || e}`);
    }
  };

  const fileToResizedJpegBase64 = (file: File, maxDim = 1280, quality = 0.85): Promise<{ dataUrl: string; base64: string; mime: string; } > => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const { width, height } = img;
            let targetW = width, targetH = height;
            if (width > height && width > maxDim) {
              targetW = maxDim; targetH = Math.round((maxDim / width) * height);
            } else if (height >= width && height > maxDim) {
              targetH = maxDim; targetW = Math.round((maxDim / height) * width);
            }
            const canvas = document.createElement('canvas');
            canvas.width = targetW; canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas ctx missing')); return; }
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const base64 = dataUrl.split(',')[1] || '';
            resolve({ dataUrl, base64, mime: 'image/jpeg' });
          };
          img.onerror = () => reject(new Error('Image decode failed'));
          img.src = reader.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } catch (e) { reject(e as any); }
    });
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError('Image trop lourde (>12 Mo).'); return; }
    try {
      const { dataUrl, base64, mime } = await fileToResizedJpegBase64(file, 1280, 0.85);
      setImageMime(mime);
      setImagePreview(dataUrl);
    } catch (err: any) {
      setError('Impossible de lire cette image. Essaye JPG/PNG.');
    }
  };

  const handleSend = async () => {
    if (!activeId) return;
    if (!input.trim() && !imagePreview) return;
    setLoadingSend(true);
    setError(null);
    if (input.trim()) {
      setMessages(prev => [...prev, { id: 'tmp-'+Date.now(), role: 'user', content: input, createdAt: new Date().toISOString() }]);
      setTimeout(() => scrollToBottom('smooth'), 0);
    }
    // Persist image as a user message, like ChatGPT
    const sendImageB64 = imagePreview ? imagePreview.split(',')[1] : undefined;
    if (imagePreview) {
      const imgId = 'img-'+Date.now();
      setMessages(prev => [...prev, { id: imgId, role: 'user', content: imagePreview, createdAt: new Date().toISOString() } as any]);
      setImagePreview(null);
      setTimeout(() => scrollToBottom('smooth'), 0);
    }
    const text = input;
    setInput('');
    try {
      const res = await sendMessage(activeId, text, sendImageB64, imageMime);
      // If backend saved image, replace temporary dataUrl message with server path
      if (res.imagePath) {
        setMessages(prev => prev.map(m => (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('data:image/')) ? { ...m, content: res.imagePath! } as any : m));
      }
      // Typewriter effect for assistant
      const full = res.content || '';
      const asstId = 'asst-'+Date.now();
      setMessages(prev => [...prev, { id: asstId, role: 'assistant', content: '', createdAt: new Date().toISOString() }]);
      setTimeout(() => scrollToBottom('smooth'), 0);
      let i = 0;
      if (typeTimer.current) window.clearInterval(typeTimer.current);
      typeTimer.current = window.setInterval(() => {
        i += Math.max(1, Math.ceil(full.length / 80));
        const slice = full.slice(0, i);
        setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: slice } : m));
        // Keep view pinned to bottom while typing
        scrollToBottom('auto');
        if (i >= full.length) {
          if (typeTimer.current) window.clearInterval(typeTimer.current);
          typeTimer.current = null;
        }
      }, 18);
    } catch (e: any) {
      setError(`Erreur envoi message: ${e?.message || e}`);
    } finally {
      setLoadingSend(false);
    }
  };

  const handleReset = async () => {
    if (!activeId) return;
    try {
      await resetChat(activeId);
      const c = await getChat(activeId);
      setMessages(c.messages);
      setTimeout(() => scrollToBottom('auto'), 0);
    } catch (e: any) {
      setError(`Erreur reset chat: ${e?.message || e}`);
    }
  };

  const handleDelete = () => {
    if (!activeId) return;
    openDeleteConfirm(activeId);
  };

  const handleDeleteFromList = (id: string) => {
    if (!id) return;
    openDeleteConfirm(id);
  };

  const handleConfirmDelete = async () => {
    const id = confirm.chatId;
    if (!id) return;
    try {
      await deleteChat(id);
      const data = await listChats();
      setChats(data);
      if (activeId === id) {
        const nextId = data[0]?.id || null;
        setActiveId(nextId);
        if (nextId) {
          const c = await getChat(nextId);
          setSystemPrompt(c.systemPrompt);
          setMessages(c.messages);
          setTimeout(() => scrollToBottom('auto'), 0);
        } else {
          setMessages([]);
        }
      }
    } catch (e: any) {
      setError(`Erreur suppression chat: ${e?.message || e}`);
    } finally {
      closeDeleteConfirm();
    }
  };

  return (
    <div className="app" onClick={() => { if (menu.open) closeMenu(); }}>
      {error && <div className="toast" onClick={() => setError(null)}>{error}</div>}
      <aside className="sidebar">
        <h2>Chats</h2>
        <div className="new-chat">
          <input className="input" placeholder="Titre" value={titleDraft} onChange={e => setTitleDraft(e.target.value)} />
        	<button className="btn btn-primary" onClick={handleCreateChat}>Nouveau</button>
        </div>
        <ul>
          {chats.map(c => (
            <li key={c.id} className={c.id === activeId ? 'active' : ''} onClick={() => setActiveId(c.id)} onContextMenu={(e) => openContextMenu(e, c.id)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
            </li>
          ))}
        </ul>
      </aside>
      <main className="content">
        {activeChat ? (
          <>
            <div className="chat-header">
              <input className="input" placeholder="Renommer..." value={titleDraft} onChange={e => setTitleDraft(e.target.value)} />
              <button className="btn" onClick={handleUpdateTitle}>Renommer</button>
              <button className="btn" onClick={handleReset}>Reset</button>
              <button className="btn" onClick={handleDelete}>Supprimer</button>
            </div>

            <div className="chat-box" ref={chatBoxRef}>
              {messages.map(m => (
                <div key={m.id} className={`msg ${m.role}`}>
                  <div className="bubble">
                    {typeof m.content === 'string' && (m.content.startsWith('data:image/') || m.content.startsWith('/uploads/')) ? (
                      <img src={m.content} alt="image" style={{ maxWidth: '220px', borderRadius: 12 }} />
                    ) : m.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              {/* image preview moved to composer */}
              {loadingSend && (
                <div className="msg assistant typing">
                  <div className="bubble" style={{ background: 'transparent', border: 'none' }}>
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick suggestions */}
            <div style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickSuggestions.map((s, i) => (
                <button key={i} className="btn" onClick={() => useSuggestion(s)}>{s}</button>
              ))}
            </div>

            <div className="input-box">
              <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                📷 Image
                <input type="file" accept="image/*" onChange={handlePickImage} style={{ display: 'none' }} />
              </label>
              {imagePreview && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 12, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', marginLeft: 8 }}>
                  <img src={imagePreview} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
                  <button className="btn" onClick={() => setImagePreview(null)} title="Retirer" style={{ padding: '4px 8px' }}>✕</button>
                </div>
              )}
              <input className="input" value={input} onChange={e => setInput(e.target.value)} placeholder="Votre message..." onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
              <button className="btn btn-primary" onClick={handleSend} disabled={loadingSend}>Envoyer</button>
            </div>
          </>
        ) : (
          <p style={{ padding: 16 }}>Aucun chat. Créez-en un.</p>
        )}
      </main>
      {menu.open && (
        <div onClick={closeMenu} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <div style={{ position: 'absolute', top: menu.y, left: menu.x, background: 'var(--card, #fff)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, minWidth: 160, boxShadow: '0 12px 30px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
            <button className="btn" style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent' }} onClick={() => { const id = menu.chatId; closeMenu(); if (id) openDeleteConfirm(id); }}>Supprimer</button>
          </div>
        </div>
      )}
      {confirm.open && (
        <div onClick={closeDeleteConfirm} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(1px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 92vw)', background: 'var(--card, #fff)', color: 'var(--text, #333)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 16, padding: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>Supprimer ce chat ?</h3>
            <p style={{ marginTop: 0, opacity: 0.8 }}>&quot;{confirm.title || 'Sans titre'}&quot; sera définitivement supprimé.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={closeDeleteConfirm}>Annuler</button>
              <button className="btn btn-primary" onClick={handleConfirmDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
