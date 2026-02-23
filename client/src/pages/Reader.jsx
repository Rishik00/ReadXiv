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
    if (!paperId) return;
    axios.post(`/api/papers/${paperId}/access`).catch(() => {
      // Best-effort analytics update for recents; ignore failures.
    });
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
    <div className="p-6 w-full max-w-[1800px] mx-auto font-sans h-screen flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 mb-4 text-sm font-medium flex-shrink-0">
        <span className="text-muted cursor-pointer hover:text-foreground transition-colors" onClick={() => setPage('shelf')}>
          Shelf
        </span>
        <span className="text-muted/50">/</span>
        <span className="text-foreground truncate max-w-[600px]">{readerPaper?.title}</span>
        <div className="ml-auto flex items-center gap-3">
          <select
            className="rounded-2xl border border-border bg-surface px-4 py-2 text-xs font-medium focus:border-secondary/50 outline-none transition-all hover:brightness-110 cursor-pointer appearance-none pr-8 relative"
            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23737373%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
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
            <option value="queued">Queued</option>
            <option value="reading">Reading</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>

      {backgroundPdfLoading && (
        <div className="mb-4 claude-card p-4 flex-shrink-0">
          <div className="mb-3 flex items-center justify-between text-xs font-medium">
            <span className="text-secondary">Initializing PDF stream...</span>
            <span className="text-muted/60">Status: Chunking</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-foreground/20 rounded-full">
            <div className="loading-indicator h-full w-1/3 bg-secondary rounded-full" />
          </div>
        </div>
      )}

      <div ref={splitRootRef} className="flex gap-0 flex-1 min-h-[calc(100vh-140px)] relative select-none">
        <div style={{ width: `${leftWidth}%` }} className="claude-card overflow-hidden relative border-r-0 rounded-r-none h-full">
          <PdfViewer paperId={paperId} continuousScroll={settings?.continuousScroll !== false} />
        </div>

        <div
          className="w-4 cursor-col-resize hover:bg-secondary/20 active:bg-secondary/40 transition-colors flex items-center justify-center z-10 -ml-2 -mr-2 relative"
          onMouseDown={startResize}
        >
          <div className="w-1 h-8 rounded-full bg-border/50" />
        </div>

        <div style={{ width: `${100 - leftWidth}%` }} className="flex flex-col claude-card overflow-hidden border-l-0 rounded-l-none h-full">
          <div className="flex items-center justify-between p-3 border-b border-border bg-background/50">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-muted/80 px-2">Notes</span>
              {settings?.liveMarkdownPreview && (
                <div className="flex bg-foreground/10 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setNoteTab('edit')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      noteTab === 'edit' ? 'bg-border text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteTab('preview')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      noteTab === 'preview' ? 'bg-border text-foreground shadow-sm' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              )}
            </div>
            <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                notesStatus === 'error'
                  ? 'text-red-400 border-red-500/20 bg-red-500/5'
                  : notesStatus === 'saving'
                    ? 'text-secondary border-secondary/20 bg-secondary/5'
                    : 'text-green-400 border-green-500/20 bg-green-500/5'
              }`}>
              {notesStatus === 'saving' ? 'Syncing...' : notesStatus === 'error' ? 'Sync Error' : 'Synced'}
            </div>
          </div>
          
          <div className="flex-1 p-0 overflow-hidden flex flex-col bg-surface">
            {!settings?.liveMarkdownPreview || noteTab === 'edit' ? (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-1 p-2 bg-background/30 border-b border-border/50">
                  {[
                    ['H1', () => insertAtCursor('\n# ')],
                    ['H2', () => insertAtCursor('\n## ')],
                    ['Bold', () => wrapSelection('**', '**')],
                    ['List', () => insertAtCursor('\n- ')],
                    ['Code', () => wrapSelection('`', '`')],
                  ].map(([label, action]) => (
                    <button
                      key={label}
                      type="button"
                      className="px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground hover:bg-foreground/5 rounded-md transition-all"
                      onClick={action}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="flex-1 w-full bg-transparent p-8 resize-none outline-none leading-relaxed font-sans text-base text-foreground/90 placeholder:text-muted/20"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                      e.preventDefault();
                      wrapSelection('**', '**');
                    }
                  }}
                  placeholder="Start writing your thoughts..."
                />
              </div>
            ) : (
              <div className="flex-1 markdown-preview overflow-auto p-10 bg-surface text-foreground/90">
                <div dangerouslySetInnerHTML={{ __html: compiledMarkdown }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
