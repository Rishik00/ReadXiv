import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import PdfViewer from '../components/PdfViewer';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';

const DEFAULT_SPLIT = 64;
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export default function Reader({ paper, setSelectedPaper, setPage, settings, initialTab = 'edit' }) {
  const [readerPaper, setReaderPaper] = useState(paper);
  const [notes, setNotes] = useState('');
  const [serverNotes, setServerNotes] = useState('');
  const [notesStatus, setNotesStatus] = useState('idle');
  const [noteTab, setNoteTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_SPLIT);
  const [readerSearch, setReaderSearch] = useState('');
  const [readerSearchResults, setReaderSearchResults] = useState([]);
  const [backgroundPdfLoading, setBackgroundPdfLoading] = useState(false);
  const splitRootRef = useRef(null);
  const saveTimerRef = useRef(null);

  const paperId = useMemo(() => readerPaper?.id || paper?.id, [readerPaper?.id, paper?.id]);
  const compiledMarkdown = useMemo(() => md.render(notes || ''), [notes]);

  useEffect(() => {
    setReaderPaper(paper);
  }, [paper]);

  useEffect(() => {
    setNoteTab(initialTab);
  }, [initialTab, paperId]);

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;
    async function loadReaderData() {
      if (!paperId) return;
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`/api/reader/${paperId}`);
        if (!mounted) return;
        setReaderPaper(data);
        setNotes(data.notes || '');
        setServerNotes(data.notes || '');
        setNotesStatus('saved');
        setBackgroundPdfLoading(Boolean(!data.hasPdf && data.status === 'loading'));
        if (!data.hasPdf && data.status === 'loading') {
          pollTimer = setInterval(async () => {
            const { data: refreshed } = await axios.get(`/api/reader/${paperId}`);
            if (!mounted) return;
            setReaderPaper(refreshed);
            setBackgroundPdfLoading(Boolean(!refreshed.hasPdf && refreshed.status === 'loading'));
            if (refreshed.hasPdf || refreshed.status !== 'loading') {
              clearInterval(pollTimer);
            }
          }, 2000);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.response?.data?.error || 'Failed to load reader data');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadReaderData();
    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [paperId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!readerSearch.trim()) {
        setReaderSearchResults([]);
        return;
      }
      try {
        const { data } = await axios.get('/api/search', { params: { q: readerSearch.trim() } });
        setReaderSearchResults(data.slice(0, 8));
      } catch {
        setReaderSearchResults([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [readerSearch]);

  useEffect(() => {
    if (!paperId || notes === serverNotes) return undefined;
    setNotesStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await axios.put(`/api/reader/${paperId}/notes`, { content: notes });
        setServerNotes(notes);
        setNotesStatus('saved');
      } catch {
        setNotesStatus('error');
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [notes, serverNotes, paperId]);

  function startResize(event) {
    event.preventDefault();
    const rootRect = splitRootRef.current?.getBoundingClientRect();
    if (!rootRect) return;

    function onMove(e) {
      const relative = ((e.clientX - rootRect.left) / rootRect.width) * 100;
      const next = Math.max(40, Math.min(78, relative));
      setLeftWidth(next);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function wrapSelection(prefix, suffix = '') {
    const textarea = document.activeElement;
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = notes.slice(start, end);
    const next = `${notes.slice(0, start)}${prefix}${selected}${suffix}${notes.slice(end)}`;
    setNotes(next);
  }

  function insertAtCursor(text) {
    const textarea = document.activeElement;
    if (!textarea || textarea.tagName !== 'TEXTAREA') {
      setNotes((prev) => `${prev}\n${text}`);
      return;
    }
    const start = textarea.selectionStart;
    const next = `${notes.slice(0, start)}${text}${notes.slice(start)}`;
    setNotes(next);
  }

  if (!paperId) {
    return (
      <div className="p-8 max-w-[980px] mx-auto">
        <Card className="rounded-2xl">
          <CardHeader className="text-sm font-semibold">Find a paper</CardHeader>
          <CardContent>
            <input
              value={readerSearch}
              onChange={(e) => setReaderSearch(e.target.value)}
              placeholder="Fuzzy search papers..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <div className="mt-3 space-y-1">
              {readerSearchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-surface"
                  onClick={() => {
                    setSelectedPaper(p);
                    setPage('reader');
                  }}
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted">{p.id}</div>
                </button>
              ))}
              {readerSearch.trim() && readerSearchResults.length === 0 && (
                <div className="text-xs text-muted">No matching papers</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-[980px] mx-auto">
        <Card>
          <CardContent className="text-muted">Loading reader…</CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-[980px] mx-auto">
        <Card>
          <CardContent className="text-red-400">{error}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-7 max-w-[1200px] mx-auto font-mono">
      <div className="flex items-center gap-2 mb-6 text-[11px] uppercase tracking-[0.2em] font-bold">
        <span className="text-muted cursor-pointer hover:text-secondary" onClick={() => setPage('shelf')}>
          SHELF
        </span>
        <span className="text-muted text-[10px]">/</span>
        <span className="text-foreground truncate max-w-[600px]">{readerPaper?.title}</span>
        <select
          className="ml-auto rounded-none border-2 border-border bg-surface px-3 py-1 text-[10px] font-bold uppercase tracking-widest focus:border-secondary outline-none"
          value={readerPaper?.status || 'queued'}
          onChange={async (e) => {
            const status = e.target.value;
            setReaderPaper((prev) => ({ ...prev, status }));
            try {
              await axios.patch(`/api/papers/${paperId}`, { status });
            } catch {
              // no-op
            }
          }}
        >
          <option value="queued">QUEUED</option>
          <option value="reading">READING</option>
          <option value="done">DONE</option>
        </select>
      </div>

      {backgroundPdfLoading && (
        <div className="mb-6 border-2 border-border bg-surface p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em]">
            <span className="text-secondary">INITIALIZING PDF STREAM...</span>
            <span className="text-muted">STATUS: CHUNKING</span>
          </div>
          <div className="h-2 w-full overflow-hidden bg-background border border-border">
            <div className="loading-indicator h-full w-1/3 bg-secondary" />
          </div>
        </div>
      )}

      <div ref={splitRootRef} className="flex gap-0 min-h-[720px] border-2 border-border bg-background shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
        <div style={{ width: `${leftWidth}%` }} className="border-r-2 border-border overflow-hidden">
          <PdfViewer paperId={paperId} continuousScroll={settings?.continuousScroll !== false} />
        </div>

        <button
          type="button"
          className="w-1 cursor-col-resize bg-border hover:bg-secondary transition-colors"
          aria-label="Resize panels"
          onMouseDown={startResize}
        />

        <div style={{ width: `${100 - leftWidth}%` }} className="flex flex-col bg-surface">
          <div className="flex items-center justify-between p-4 border-b-2 border-border bg-background">
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">NOTES.MD</span>
              {settings?.liveMarkdownPreview && (
                <div className="flex border border-border bg-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => setNoteTab('edit')}
                    className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all ${
                      noteTab === 'edit' ? 'bg-secondary text-white' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteTab('preview')}
                    className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-all ${
                      noteTab === 'preview' ? 'bg-secondary text-white' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    PREVIEW
                  </button>
                </div>
              )}
            </div>
            <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 border ${
                notesStatus === 'error'
                  ? 'text-red-400 border-red-900/50 bg-red-500/10'
                  : notesStatus === 'saving'
                    ? 'text-secondary border-secondary/50 bg-secondary/10'
                    : 'text-green-400 border-green-900/50 bg-green-500/10'
              }`}>
              {notesStatus === 'saving' ? 'SYNCING...' : notesStatus === 'error' ? 'SYNC_ERROR' : 'SYNCED'}
            </div>
          </div>
          
          <div className="flex-1 p-0 overflow-hidden flex flex-col">
            {!settings?.liveMarkdownPreview || noteTab === 'edit' ? (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-1 p-2 bg-background border-b border-border">
                  {[
                    ['H1', () => insertAtCursor('\n# ')],
                    ['H2', () => insertAtCursor('\n## ')],
                    ['BOLD', () => wrapSelection('**', '**')],
                    ['LIST', () => insertAtCursor('\n- ')],
                    ['CODE', () => wrapSelection('`', '`')],
                  ].map(([label, action]) => (
                    <button
                      key={label}
                      type="button"
                      className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted hover:text-foreground hover:bg-surface border border-transparent hover:border-border transition-all"
                      onClick={action}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="flex-1 w-full bg-transparent p-6 resize-none outline-none leading-relaxed font-mono text-[13px] text-foreground placeholder:text-muted/30"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                      e.preventDefault();
                      wrapSelection('**', '**');
                    }
                  }}
                  placeholder="START TRANSCRIBING..."
                />
              </div>
            ) : (
              <div className="flex-1 markdown-preview overflow-auto p-8 bg-background text-foreground selection:bg-white selection:text-black">
                <div dangerouslySetInnerHTML={{ __html: compiledMarkdown }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
