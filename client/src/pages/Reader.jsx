import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import PdfViewer from '../components/PdfViewer';
import { Card, CardContent } from '../components/ui/card';

const DEFAULT_SPLIT = 68;
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const Reader = forwardRef(function Reader({ paper, setSelectedPaper, setPage, settings, initialTab = 'edit', addToast }, ref) {
  const [readerPaper, setReaderPaper] = useState(paper);
  const [notes, setNotes] = useState('');
  const [serverNotes, setServerNotes] = useState('');
  const [notesStatus, setNotesStatus] = useState('idle');
  const [noteTab, setNoteTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_SPLIT);
  const [backgroundPdfLoading, setBackgroundPdfLoading] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState('pdf');
  const splitRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const notesTextareaRef = useRef(null);
  const notesPreviewRef = useRef(null);
  const pdfViewerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    togglePdfDarkMode: () => pdfViewerRef.current?.togglePdfDarkMode?.(),
  }));

  const paperId = useMemo(() => readerPaper?.id || paper?.id, [readerPaper?.id, paper?.id]);
  const compiledMarkdown = useMemo(() => {
    try {
      return md.render(notes || '');
    } catch {
      return '<p>Unable to render markdown preview.</p>';
    }
  }, [notes]);

  useEffect(() => {
    setReaderPaper(paper);
  }, [paper]);

  useEffect(() => {
    setNoteTab(initialTab);
  }, [initialTab, paperId]);

  useEffect(() => {
    if (paperId) pdfPanelRef.current?.focus();
  }, [paperId]);

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

  useEffect(() => {
    if (noteTab !== 'preview') return;
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;
    mathJax.typesetPromise();
  }, [noteTab, compiledMarkdown]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setFocusedPanel((prev) => {
          const next = prev === 'pdf' ? 'notes' : 'pdf';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (next === 'pdf') {
                pdfPanelRef.current?.focus();
              } else {
                setNoteTab('edit');
                setTimeout(() => {
                  const el = notesTextareaRef.current ?? notesPreviewRef.current;
                  el?.focus();
                }, 80);
              }
            });
          });
          return next;
        });
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const link = readerPaper?.url || (readerPaper?.id ? `https://arxiv.org/abs/${readerPaper.id}` : null);
        if (link) {
          navigator.clipboard.writeText(link).then(() => {
            addToast?.('Paper link copied!', 'success');
          }).catch(() => {});
        }
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === '1') {
        e.preventDefault();
        insertAtCursor('\n# ');
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === '2') {
        e.preventDefault();
        insertAtCursor('\n## ');
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        insertAtCursor('\n- ');
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        wrapSelection('`', '`');
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readerPaper?.id, readerPaper?.url]);

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
    setNotes((prev) => `${prev.slice(0, start)}${prefix}${prev.slice(start, end)}${suffix}${prev.slice(end)}`);
  }

  function insertAtCursor(text) {
    const textarea = document.activeElement;
    if (!textarea || textarea.tagName !== 'TEXTAREA') {
      setNotes((prev) => `${prev}\n${text}`);
      return;
    }
    const start = textarea.selectionStart;
    setNotes((prev) => `${prev.slice(0, start)}${text}${prev.slice(start)}`);
  }

  function ensureReaderSections(content) {
    let next = content || '';
    if (!/##\s+Quotes from the paper/i.test(next)) {
      next = `${next.trimEnd()}\n\n## Quotes from the paper\n`;
    }
    if (!/##\s+Opinions and Questions/i.test(next)) {
      next = `${next.trimEnd()}\n\n## Opinions and Questions\n`;
    }
    return next;
  }

  function insertQuoteFromHighlight({ text, page: quotePage }) {
    const quoteText = (text || '').trim();
    if (!quoteText) return;
    setNotes((prev) => {
      const withSections = ensureReaderSections(prev);
      const opinionsHeaderRegex = /\n##\s+Opinions and Questions/i;
      const opinionsMatch = withSections.match(opinionsHeaderRegex);
      const insertAt = opinionsMatch ? opinionsMatch.index : withSections.length;
      const quoteBlock = `\n> ${quoteText}\n>\n> _Page ${quotePage}_\n`;
      return `${withSections.slice(0, insertAt).trimEnd()}\n${quoteBlock}\n${withSections.slice(insertAt).trimStart()}`;
    });
    setNoteTab('edit');
  }

  if (!paperId) {
    return (
      <div className="p-8 max-w-[980px] mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-muted text-sm">Select a paper from the shelf or use <kbd className="px-1.5 py-0.5 rounded bg-border text-sm font-mono">Ctrl+P</kbd> to search.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-[980px] mx-auto flex flex-col items-center gap-4 animate-fade-in">
        <div className="h-2 w-48 rounded-full overflow-hidden bg-surface">
          <div className="h-full w-1/3 skeleton-shimmer" />
        </div>
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
    <div className="p-6 w-full max-w-[1800px] mx-auto font-sans h-screen flex flex-col overflow-hidden animate-view-fade">
      {backgroundPdfLoading && (
        <div className="mb-4 claude-card p-4 flex-shrink-0">
          <div className="mb-3 flex items-center justify-between text-sm font-medium">
            <span className="text-secondary">Initializing PDF stream...</span>
            <span className="text-muted/60">Status: Chunking</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-foreground/20 rounded-full">
            <div className="loading-indicator h-full w-1/3 bg-secondary rounded-full" />
          </div>
        </div>
      )}

      <div ref={splitRootRef} className="flex gap-0 flex-1 min-h-0 relative select-none">
        <div
          ref={pdfPanelRef}
          tabIndex={0}
          style={{ width: `${leftWidth}%` }}
          className={`claude-card overflow-hidden relative border-r-0 rounded-r-none h-full transition-shadow outline-none focus:outline-none ${focusedPanel === 'pdf' ? 'focus-panel-glow' : ''}`}
          onClick={(e) => {
            setFocusedPanel('pdf');
            if (e.target.closest('[data-pdf-scroll]')) {
              pdfViewerRef.current?.focusScrollArea?.();
            } else {
              pdfPanelRef.current?.focus();
            }
          }}
          onFocus={() => setFocusedPanel('pdf')}
          onKeyDown={(e) => focusedPanel === 'pdf' && pdfViewerRef.current?.handleKeyDown(e)}
        >
          <PdfViewer
            ref={pdfViewerRef}
            paperId={paperId}
            continuousScroll={settings?.continuousScroll !== false}
            onInsertQuote={insertQuoteFromHighlight}
          />
        </div>

        <div
          className="w-4 cursor-col-resize hover:bg-secondary/20 active:bg-secondary/40 transition-colors flex items-center justify-center z-10 -ml-2 -mr-2 relative"
          onMouseDown={startResize}
        >
          <div className="w-1 h-8 rounded-full bg-border/50" />
        </div>

        <div
          style={{ width: `${100 - leftWidth}%` }}
          className={`flex flex-col claude-card overflow-hidden border-l-0 rounded-l-none h-full transition-shadow ${focusedPanel === 'notes' ? 'focus-panel-glow' : ''}`}
          onClick={() => setFocusedPanel('notes')}
        >
          <div className="flex-1 p-0 overflow-hidden flex flex-col bg-surface">
            {settings?.liveMarkdownPreview && (
              <div className="flex gap-1 p-3 pb-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setNoteTab('edit')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    noteTab === 'edit' ? 'bg-border text-foreground' : 'text-muted hover:text-foreground'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setNoteTab('preview')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    noteTab === 'preview' ? 'bg-border text-foreground' : 'text-muted hover:text-foreground'
                  }`}
                >
                  Preview
                </button>
              </div>
            )}
            {!settings?.liveMarkdownPreview || noteTab === 'edit' ? (
              <div className="flex-1 flex flex-col">
                <textarea
                  ref={notesTextareaRef}
                  className="flex-1 w-full bg-transparent p-8 resize-none outline-none leading-relaxed font-sans text-sm text-foreground/90 placeholder:text-muted/20"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onFocus={() => setFocusedPanel('notes')}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
                      e.preventDefault();
                      wrapSelection('**', '**');
                    }
                  }}
                  placeholder="Start writing your thoughts..."
                />
              </div>
            ) : (
              <div
                ref={notesPreviewRef}
                tabIndex={0}
                className="flex-1 markdown-preview overflow-auto p-10 bg-surface text-foreground/90 prose prose-invert prose-sm max-w-none text-sm outline-none focus:outline-none"
                onFocus={() => setFocusedPanel('notes')}
              >
                <div dangerouslySetInnerHTML={{ __html: compiledMarkdown }} />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
});

export default Reader;
