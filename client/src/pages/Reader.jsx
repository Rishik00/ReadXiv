import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import PdfViewer from '../components/PdfViewer';
import ReaderPdfFloatingToolbar from '../components/ReaderPdfFloatingToolbar';
import { Card, CardContent } from '../components/ui/card';
import { ensureMathJax, notesMayContainTex } from '../utils/mathjax';

const DEFAULT_SPLIT = 68;
const md = new MarkdownIt({ 
  html: true, 
  linkify: true, 
  breaks: true,
  typographer: true
});

// Add task list support
md.use((md) => {
  const defaultRenderer = md.renderer.rules.list_item_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.list_item_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const nextToken = tokens[idx + 2];
    
    if (nextToken && nextToken.content) {
      const match = nextToken.content.match(/^\[([ xX])\]\s+/);
      if (match) {
        const checked = match[1].toLowerCase() === 'x';
        nextToken.content = nextToken.content.replace(/^\[([ xX])\]\s+/, '');
        token.attrSet('class', 'task-list-item');
        return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled>`;
      }
    }
    
    return defaultRenderer(tokens, idx, options, env, self);
  };
});

function scrollTextareaCaretIntoView(textarea) {
  if (!textarea || textarea.tagName !== 'TEXTAREA') return;
  const value = textarea.value;
  const pos = Math.min(value.length, Math.max(0, textarea.selectionStart));
  const lineIndex = value.slice(0, pos).split('\n').length - 1;
  const lineCount = Math.max(1, value.split('\n').length);

  const style = getComputedStyle(textarea);
  let lineHeightPx = parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
    const fs = parseFloat(style.fontSize) || 16;
    lineHeightPx = fs * 1.45;
  }

  // Blend CSS line-height with average row height from layout (helps wrapped lines & after React repaint).
  const avgFromScroll = textarea.scrollHeight / lineCount;
  const effLineHeight = Math.max(lineHeightPx, avgFromScroll * 0.92);

  const paddingTop = parseFloat(style.paddingTop) || 0;
  const caretTop = lineIndex * effLineHeight + paddingTop;
  const caretBottom = caretTop + effLineHeight;
  const margin = 12;
  const viewTop = textarea.scrollTop;
  const viewBottom = viewTop + textarea.clientHeight;
  const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);

  if (caretTop < viewTop + margin) {
    textarea.scrollTop = Math.min(maxScroll, Math.max(0, caretTop - margin));
  } else   if (caretBottom > viewBottom - margin) {
    textarea.scrollTop = Math.min(maxScroll, Math.max(0, caretBottom - textarea.clientHeight + margin));
  }
}

function referenceIsAddableToShelf(ref) {
  return (
    ref?.arxivId &&
    typeof ref.arxivId === 'string' &&
    /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(ref.arxivId.trim())
  );
}

/** Comma-separated author string from API → first `max` names, then "et al." */
function formatReferenceAuthorsEtAl(authorsStr, max = 5) {
  if (!authorsStr || typeof authorsStr !== 'string') return '';
  const parts = authorsStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length <= max) return parts.join(', ');
  return `${parts.slice(0, max).join(', ')}, et al.`;
}

function referenceExternalLinkHref(ref) {
  if (ref?.doi && String(ref.doi).trim()) {
    return `https://doi.org/${encodeURIComponent(String(ref.doi).trim())}`;
  }
  if (ref?.arxivId && typeof ref.arxivId === 'string') {
    return `https://arxiv.org/abs/${encodeURIComponent(ref.arxivId.trim())}`;
  }
  return null;
}

const Reader = forwardRef(function Reader(
  { paper, setSelectedPaper, setPage, settings, initialTab = 'edit', addToast, onSendToCanvas },
  ref
) {
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
  const [pdfCollapsed, setPdfCollapsed] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [foldedSections, setFoldedSections] = useState(new Set());
  const [pdfToolbarMetrics, setPdfToolbarMetrics] = useState(null);
  const [readerToolbarExpanded, setReaderToolbarExpanded] = useState(true);
  const [pageJumpMenuNonce, setPageJumpMenuNonce] = useState(0);
  const [paperReferences, setPaperReferences] = useState([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesLoadedForPaperId, setReferencesLoadedForPaperId] = useState(null);
  const [addingReferenceKeys, setAddingReferenceKeys] = useState(() => new Set());
  const splitRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const notesTextareaRef = useRef(null);
  const notesPreviewRef = useRef(null);
  const mathPreviewContentRef = useRef(null);
  const pdfViewerRef = useRef(null);

  const setReaderView = useCallback((mode) => {
    if (mode === 'split') {
      setPdfCollapsed(false);
      setNotesCollapsed(false);
    } else if (mode === 'pdf') {
      setPdfCollapsed(false);
      setNotesCollapsed(true);
    } else {
      setPdfCollapsed(true);
      setNotesCollapsed(false);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      togglePdfDarkMode: () => pdfViewerRef.current?.togglePdfDarkMode?.(),
      maximizePdf: () => {
        setNotesCollapsed(true);
        setPdfCollapsed(false);
      },
      minimizePdf: () => {
        setPdfCollapsed(true);
        setNotesCollapsed(false);
      },
      toggleReaderToolbarExpanded: () => setReaderToolbarExpanded((v) => !v),
      setReaderView,
      openPdfPageJumpMenu: () => setPageJumpMenuNonce((n) => n + 1),
    }),
    [setReaderView]
  );

  const handleToolbarState = useCallback((metrics) => {
    setPdfToolbarMetrics(metrics);
  }, []);

  const paperId = useMemo(() => readerPaper?.id || paper?.id, [readerPaper?.id, paper?.id]);

  const addShelfReference = useCallback(
    async (arxivId, dedupeKey) => {
      if (!arxivId || dedupeKey == null) return;
      setAddingReferenceKeys((prev) => new Set(prev).add(dedupeKey));
      try {
        await axios.post('/api/arxiv/add', { input: `https://arxiv.org/abs/${arxivId}` });
        addToast?.('Added to shelf', 'success');
      } catch {
        /* intentional: no user-visible error */
      } finally {
        setAddingReferenceKeys((prev) => {
          const next = new Set(prev);
          next.delete(dedupeKey);
          return next;
        });
      }
    },
    [addToast]
  );

  const notesOutline = useMemo(() => {
    const lines = notes.split('\n');
    const outline = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        outline.push({
          level: match[1].length,
          text: match[2],
          line: index,
        });
      }
    });
    return outline;
  }, [notes]);

  const addablePaperReferences = useMemo(
    () => paperReferences.filter(referenceIsAddableToShelf),
    [paperReferences]
  );

  const [previewHtml, setPreviewHtml] = useState('');

  function renderPreviewMarkdown(source) {
    try {
      return md.render(source || '');
    } catch {
      return '<p>Unable to render markdown preview.</p>';
    }
  }

  function renderOutlineHeadingInline(source) {
    const s = source ?? '';
    try {
      return md.renderInline(s);
    } catch {
      return md.utils.escapeHtml(s);
    }
  }

  // Snapshot markdown when switching to Preview (avoids heavy updates on every keystroke unless live preview is on).
  useLayoutEffect(() => {
    if (noteTab !== 'preview') return;
    setPreviewHtml(renderPreviewMarkdown(notes));
  }, [noteTab]);

  useEffect(() => {
    if (noteTab !== 'preview' || !settings?.liveMarkdownPreview) return undefined;
    const id = setTimeout(() => {
      setPreviewHtml(renderPreviewMarkdown(notes));
    }, 260);
    return () => clearTimeout(id);
  }, [notes, noteTab, settings?.liveMarkdownPreview]);

  useEffect(() => {
    if (noteTab !== 'preview') return undefined;
    if (!notesMayContainTex(notes)) return undefined;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled || !mathPreviewContentRef.current) return;
      ensureMathJax()
        .then(() => {
          if (cancelled || !mathPreviewContentRef.current || !window.MathJax?.typesetPromise) return;
          return window.MathJax.typesetPromise([mathPreviewContentRef.current]);
        })
        .catch(() => {});
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [noteTab, previewHtml, notes]);

  useEffect(() => {
    setNoteTab(initialTab);
  }, [initialTab, paperId]);

  useEffect(() => {
    setPaperReferences([]);
    setReferencesLoadedForPaperId(null);
  }, [paperId]);

  useEffect(() => {
    if (noteTab !== 'references' || !paperId) return undefined;
    if (referencesLoadedForPaperId === paperId) return undefined;
    let cancelled = false;
    setReferencesLoading(true);
    axios
      .get(`/api/reader/${encodeURIComponent(paperId)}/references`)
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data?.references) ? data.references : [];
        setPaperReferences(list);
        setReferencesLoadedForPaperId(paperId);
      })
      .catch(() => {
        if (cancelled) return;
        setPaperReferences([]);
        setReferencesLoadedForPaperId(paperId);
      })
      .finally(() => {
        if (!cancelled) setReferencesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteTab, paperId, referencesLoadedForPaperId]);

  useEffect(() => {
    if (paperId) pdfPanelRef.current?.focus();
  }, [paperId]);

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;
    async function loadReaderData() {
      if (!paperId) return;
      setNotes('');
      setServerNotes('');
      setNotesStatus('saved');
      const optimistic = Boolean(paper?.id && paper.id === paperId);
      if (optimistic) {
        setReaderPaper(paper);
        setLoading(false);
      } else {
        setLoading(true);
      }
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
            try {
              const { data: refreshed } = await axios.get(`/api/reader/${paperId}`, {
                params: { brief: 1 },
              });
              if (!mounted) return;
              setReaderPaper((prev) => ({ ...prev, ...refreshed }));
              setBackgroundPdfLoading(Boolean(!refreshed.hasPdf && refreshed.status === 'loading'));
              if (refreshed.hasPdf || refreshed.status !== 'loading') {
                clearInterval(pollTimer);
                pollTimer = null;
              }
            } catch {
              /* keep polling */
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
  }, [paperId, paper?.id]);

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

  // Controlled <textarea> re-renders reset scrollTop; sync after React commits DOM so new lines stay in view.
  useLayoutEffect(() => {
    if (noteTab !== 'edit') return;
    const ta = notesTextareaRef.current;
    if (!ta || document.activeElement !== ta) return;
    scrollTextareaCaretIntoView(ta);
  }, [notes, noteTab]);

  useEffect(() => {
    if (noteTab !== 'edit') return;
    let raf = 0;
    const onSel = () => {
      const ta = notesTextareaRef.current;
      if (!ta || document.activeElement !== ta) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => scrollTextareaCaretIntoView(ta));
    };
    document.addEventListener('selectionchange', onSel);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', onSel);
    };
  }, [noteTab]);

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

  function scrollToOutlineItem(lineNumber) {
    const textarea = notesTextareaRef.current;
    if (!textarea) return;
    
    const lines = notes.split('\n');
    let charCount = 0;
    for (let i = 0; i < lineNumber && i < lines.length; i++) {
      charCount += lines[i].length + 1;
    }
    
    textarea.focus();
    textarea.setSelectionRange(charCount, charCount);
    requestAnimationFrame(() => scrollTextareaCaretIntoView(textarea));
  }

  function toggleSectionFold(lineNumber) {
    setFoldedSections((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) {
        next.delete(lineNumber);
      } else {
        next.add(lineNumber);
      }
      return next;
    });
  }

  const displayNotes = useMemo(() => {
    if (foldedSections.size === 0) return notes;
    
    const lines = notes.split('\n');
    const result = [];
    let skipUntilLevel = null;
    
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (match) {
        const level = match[1].length;
        if (skipUntilLevel !== null && level > skipUntilLevel) {
          return;
        }
        skipUntilLevel = null;
        
        if (foldedSections.has(index)) {
          skipUntilLevel = level;
        }
      } else if (skipUntilLevel !== null) {
        return;
      }
      
      result.push(line);
    });
    
    return result.join('\n');
  }, [notes, foldedSections]);


  if (!paperId) {
    return (
      <div className="p-8 max-w-[980px] mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-muted text-sm">Select a paper from the shelf or use <kbd className="px-1.5 py-0.5 rounded bg-border text-sm font-mono">Ctrl+P</kbd> to search.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 w-full max-w-[1800px] mx-auto h-screen flex flex-col overflow-hidden animate-fade-in">
        <div className="flex gap-0 flex-1 min-h-0">
          <div className="w-[68%] border border-border rounded-lg rounded-r-none border-r-0 p-4 space-y-4">
            <div className="flex gap-2 mb-4">
              <div className="h-7 w-16 bg-surface rounded skeleton-shimmer" />
              <div className="h-7 w-24 bg-surface rounded skeleton-shimmer" />
              <div className="h-7 w-20 bg-surface rounded skeleton-shimmer" />
            </div>
            <div className="space-y-3">
              <div className="h-[600px] bg-surface rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="w-4" />
          <div className="flex-1 border border-border rounded-lg rounded-l-none border-l-0 p-8 space-y-3">
            <div className="h-4 bg-surface rounded w-3/4 skeleton-shimmer" />
            <div className="h-4 bg-surface rounded w-full skeleton-shimmer" />
            <div className="h-4 bg-surface rounded w-5/6 skeleton-shimmer" />
            <div className="h-4 bg-surface rounded w-full skeleton-shimmer" />
            <div className="h-4 bg-surface rounded w-2/3 skeleton-shimmer" />
          </div>
        </div>
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

  const readerToolbarProps = {
    pdfViewerRef,
    pdfPanelRef,
    toolbarMetrics: pdfToolbarMetrics,
    viewMode: pdfCollapsed ? 'notes' : notesCollapsed ? 'pdf' : 'split',
    onSetView: setReaderView,
    pageJumpMenuNonce,
  };

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

      <div ref={splitRootRef} className="flex gap-0 flex-1 min-h-0 relative">
        {!pdfCollapsed && (
          <div
            ref={pdfPanelRef}
            tabIndex={0}
            style={{ width: notesCollapsed ? '100%' : `${leftWidth}%` }}
            className={`claude-card overflow-hidden relative select-none ${notesCollapsed ? '' : 'border-r-0 rounded-r-none'} h-full min-h-0 transition-all outline-none focus:outline-none ${focusedPanel === 'pdf' ? 'focus-panel-glow' : ''}`}
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
              paperTitle={readerPaper?.title}
              continuousScroll={settings?.continuousScroll !== false}
              onInsertQuote={insertQuoteFromHighlight}
              onSendToCanvas={onSendToCanvas}
              onToolbarState={handleToolbarState}
            />
            {readerToolbarExpanded && <ReaderPdfFloatingToolbar {...readerToolbarProps} />}
          </div>
        )}

        {pdfCollapsed && (
          <>
            <button
              type="button"
              onClick={() => {
                setPdfCollapsed(false);
                setNotesCollapsed(false);
              }}
              className="w-12 flex items-center justify-center bg-surface/50 hover:bg-surface border-r border-border transition-colors shrink-0"
              title="Expand PDF panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            {readerToolbarExpanded && <ReaderPdfFloatingToolbar {...readerToolbarProps} />}
          </>
        )}

        {!pdfCollapsed && !notesCollapsed && (
          <div
            className="w-4 cursor-col-resize hover:bg-secondary/20 active:bg-secondary/40 transition-colors flex items-center justify-center z-10 -ml-2 -mr-2 relative select-none"
            onMouseDown={startResize}
          >
            <div className="w-1 h-8 rounded-full bg-border/50" />
          </div>
        )}

        {!notesCollapsed && (
          <div
            style={{ width: pdfCollapsed ? '100%' : `${100 - leftWidth}%` }}
            className={`flex flex-col claude-card overflow-hidden ${pdfCollapsed ? '' : 'border-l-0 rounded-l-none'} h-full min-h-0 transition-all ${focusedPanel === 'notes' ? 'focus-panel-glow' : ''} notes-editor-container`}
            onClick={() => setFocusedPanel('notes')}
          >
          <div className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col bg-surface min-w-0">
            <div className="flex items-stretch gap-1.5 px-2 sm:px-3 py-2 border-b border-border/50 shrink-0">
              <div className="flex gap-0.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteTab('edit');
                  }}
                  className={`flex-1 min-w-0 px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                    noteTab === 'edit'
                      ? 'bg-secondary/10 text-secondary border border-secondary/30'
                      : 'text-muted hover:text-foreground hover:bg-surface/50 border border-transparent'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  <span className="truncate">Edit</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteTab('preview');
                  }}
                  className={`flex-1 min-w-0 px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                    noteTab === 'preview'
                      ? 'bg-secondary/10 text-secondary border border-secondary/30'
                      : 'text-muted hover:text-foreground hover:bg-surface/50 border border-transparent'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  <span className="truncate">Preview</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteTab('references');
                  }}
                  className={`flex-1 min-w-0 px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                    noteTab === 'references'
                      ? 'bg-secondary/10 text-secondary border border-secondary/30'
                      : 'text-muted hover:text-foreground hover:bg-surface/50 border border-transparent'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>
                  <span className="truncate">
                    <span className="sm:hidden">Refs</span>
                    <span className="hidden sm:inline">References</span>
                  </span>
                </button>
              </div>
              <div className="flex gap-0.5 shrink-0 items-center border-l border-border/40 pl-1.5 ml-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOutline((v) => !v);
                  }}
                  className={`p-1.5 rounded-md ${showOutline ? 'bg-secondary/20 text-secondary' : 'bg-surface/80 hover:bg-surface text-muted hover:text-foreground'} border border-border transition-colors`}
                  title="Toggle outline"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
              </div>
            </div>
            {showOutline && notesOutline.length > 0 && (
              <div className="border-b border-border/50 bg-surface/30 backdrop-blur-sm p-4 max-h-64 overflow-auto">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Outline
                </div>
                <div className="space-y-0.5 notes-outline-panel">
                  {notesOutline.map((item, idx) => (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (e.target.closest('a')) return;
                        scrollToOutlineItem(item.line);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          scrollToOutlineItem(item.line);
                        }
                      }}
                      className="block w-full text-left rounded px-2 py-1.5 cursor-pointer hover:bg-surface/50 transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
                    >
                      <span
                        data-level={item.level}
                        className="notes-outline-heading markdown-preview block truncate"
                        dangerouslySetInnerHTML={{ __html: renderOutlineHeadingInline(item.text) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {noteTab === 'references' ? (
              <div
                tabIndex={0}
                className="flex-1 min-h-0 overflow-y-auto px-8 sm:px-10 py-6 text-foreground outline-none focus:outline-none select-text"
                onFocus={() => setFocusedPanel('notes')}
              >
                <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4 max-w-[720px] mx-auto">
                  References
                </h2>
                {referencesLoading ? (
                  <p className="text-sm text-muted/70 max-w-[720px] mx-auto">Loading…</p>
                ) : addablePaperReferences.length === 0 ? (
                  <p className="text-sm text-muted/80 max-w-[720px] mx-auto">
                    {paperReferences.length > 0
                      ? 'No references with an arXiv ID we can add to your shelf.'
                      : 'Wasn&apos;t able to extract anything'}
                  </p>
                ) : (
                  <ul className="space-y-4 max-w-[720px] mx-auto">
                    {addablePaperReferences.map((ref, idx) => {
                      const rowKey = ref.label || `${ref.arxivId || ''}-${ref.doi || ''}-${idx}`;
                      const busy = addingReferenceKeys.has(rowKey);
                      const linkHref = referenceExternalLinkHref(ref);
                      const authorsShort = formatReferenceAuthorsEtAl(ref.authors, 5);
                      return (
                        <li
                          key={rowKey}
                          className="border-b border-border/40 pb-4 last:border-0 last:pb-0"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground leading-snug">{ref.title}</p>
                              {authorsShort ? (
                                <p className="text-xs text-muted/70 mt-1">{authorsShort}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
                              {linkHref ? (
                                <a
                                  href={linkHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md border border-border/60 text-muted hover:text-foreground hover:bg-surface/60 transition-colors"
                                >
                                  Link
                                </a>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => addShelfReference(ref.arxivId.trim(), rowKey)}
                                className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md bg-secondary/15 text-secondary border border-secondary/35 hover:bg-secondary/25 disabled:opacity-50 transition-colors"
                              >
                                {busy ? 'Adding…' : 'Add'}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : noteTab === 'edit' ? (
              <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden select-text">
                <textarea
                  ref={notesTextareaRef}
                  className="markdown-editor flex-1 min-h-0 w-full overflow-y-auto bg-transparent px-12 pt-8 pb-20 resize-none outline-none text-base text-foreground placeholder:text-muted/30 select-text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onSelect={(e) => requestAnimationFrame(() => scrollTextareaCaretIntoView(e.target))}
                  onClick={(e) => requestAnimationFrame(() => scrollTextareaCaretIntoView(e.target))}
                  onKeyUp={(e) => requestAnimationFrame(() => scrollTextareaCaretIntoView(e.currentTarget))}
                  onFocus={() => setFocusedPanel('notes')}
                  placeholder="Start writing your thoughts..."
                  spellCheck="true"
                />
                {foldedSections.size > 0 && (
                  <div className="absolute top-4 right-4 text-xs text-muted bg-surface/80 px-2 py-1 rounded border border-border">
                    {foldedSections.size} section(s) folded
                  </div>
                )}
                <div className="editor-status-bar absolute bottom-0 left-0 right-0 flex items-center justify-between px-12 py-2 border-t border-border/30">
                  <div className="flex items-center gap-4 text-xs text-muted/60">
                    <span className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                      {notes.split('\n').length} lines
                    </span>
                    <span className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                      {notes.split(/\s+/).filter(w => w.length > 0).length} words
                    </span>
                    <span className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/></svg>
                      {notes.length} chars
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 text-xs ${notesStatus === 'saved' ? 'text-muted/60' : notesStatus === 'saving' ? 'text-secondary/80' : 'text-red-400/80'}`}>
                      {notesStatus === 'saved' && (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Saved
                        </>
                      )}
                      {notesStatus === 'saving' && (
                        <>
                          <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          Saving
                        </>
                      )}
                      {notesStatus === 'error' && (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          Error
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={notesPreviewRef}
                tabIndex={0}
                className="flex-1 markdown-preview overflow-auto px-12 py-8 bg-transparent text-foreground outline-none focus:outline-none select-text"
                onFocus={() => setFocusedPanel('notes')}
              >
                <div
                  ref={mathPreviewContentRef}
                  className="max-w-[750px] mx-auto"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </div>
        </div>
        )}

        {notesCollapsed && (
          <button
            type="button"
            onClick={() => {
              setNotesCollapsed(false);
              setPdfCollapsed(false);
            }}
            className="w-12 flex items-center justify-center bg-surface/50 hover:bg-surface border-l border-border transition-colors"
            title="Expand notes panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        )}
      </div>

    </div>
  );
});

export default Reader;
