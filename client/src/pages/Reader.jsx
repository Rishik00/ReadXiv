import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import PdfViewer from '../components/PdfViewer';
import { Card, CardContent } from '../components/ui/card';

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

const Reader = forwardRef(function Reader({ paper, setSelectedPaper, setPage, settings, initialTab = 'edit', addToast, onSendToCanvas }, ref) {
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
  const [autoScrollSync, setAutoScrollSync] = useState(false);
  const lastPdfPageRef = useRef(1);
  const splitRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const notesTextareaRef = useRef(null);
  const notesPreviewRef = useRef(null);
  const pdfViewerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    togglePdfDarkMode: () => pdfViewerRef.current?.togglePdfDarkMode?.(),
    maximizePdf: () => {
      setNotesCollapsed(true);
      setPdfCollapsed(false);
    },
    minimizePdf: () => {
      setPdfCollapsed(true);
      setNotesCollapsed(false);
    },
  }));

  const paperId = useMemo(() => readerPaper?.id || paper?.id, [readerPaper?.id, paper?.id]);
  
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
    if (!autoScrollSync || !pdfViewerRef.current) return;

    const interval = setInterval(() => {
      const currentPage = pdfViewerRef.current?.getCurrentPage?.();
      if (currentPage && currentPage !== lastPdfPageRef.current) {
        lastPdfPageRef.current = currentPage;
        
        const pageMatches = notes.match(new RegExp(`(?:page|p\\.?)\\s*${currentPage}`, 'gi'));
        if (pageMatches && notesTextareaRef.current) {
          const textarea = notesTextareaRef.current;
          const index = notes.toLowerCase().indexOf(pageMatches[0].toLowerCase());
          if (index !== -1) {
            const lines = notes.substring(0, index).split('\n');
            const lineNumber = lines.length - 1;
            textarea.scrollTop = (lineNumber / notes.split('\n').length) * textarea.scrollHeight;
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoScrollSync, notes]);

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
    textarea.scrollTop = (lineNumber / lines.length) * textarea.scrollHeight;
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
        {!pdfCollapsed && (
          <div
            ref={pdfPanelRef}
            tabIndex={0}
            style={{ width: notesCollapsed ? '100%' : `${leftWidth}%` }}
            className={`claude-card overflow-hidden relative ${notesCollapsed ? '' : 'border-r-0 rounded-r-none'} h-full transition-all outline-none focus:outline-none ${focusedPanel === 'pdf' ? 'focus-panel-glow' : ''}`}
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
            <div className="absolute top-2 right-2 z-50">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPdfCollapsed(true);
                  setNotesCollapsed(false);
                }}
                className="p-1.5 rounded-md bg-surface/80 hover:bg-surface border border-border text-muted hover:text-foreground transition-colors"
                title="Collapse PDF panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            </div>
            <PdfViewer
              ref={pdfViewerRef}
              paperId={paperId}
              paperTitle={readerPaper?.title}
              continuousScroll={settings?.continuousScroll !== false}
              onInsertQuote={insertQuoteFromHighlight}
              onSendToCanvas={onSendToCanvas}
            />
          </div>
        )}

        {pdfCollapsed && (
          <button
            type="button"
            onClick={() => {
              setPdfCollapsed(false);
              setNotesCollapsed(false);
            }}
            className="w-12 flex items-center justify-center bg-surface/50 hover:bg-surface border-r border-border transition-colors"
            title="Expand PDF panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}

        {!pdfCollapsed && !notesCollapsed && (
          <div
            className="w-4 cursor-col-resize hover:bg-secondary/20 active:bg-secondary/40 transition-colors flex items-center justify-center z-10 -ml-2 -mr-2 relative"
            onMouseDown={startResize}
          >
            <div className="w-1 h-8 rounded-full bg-border/50" />
          </div>
        )}

        {!notesCollapsed && (
          <div
            style={{ width: pdfCollapsed ? '100%' : `${100 - leftWidth}%` }}
            className={`flex flex-col claude-card overflow-hidden ${pdfCollapsed ? '' : 'border-l-0 rounded-l-none'} h-full transition-all ${focusedPanel === 'notes' ? 'focus-panel-glow' : ''} notes-editor-container`}
            onClick={() => setFocusedPanel('notes')}
          >
          <div className="absolute top-2 right-2 z-50 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAutoScrollSync((v) => !v);
              }}
              className={`p-1.5 rounded-md ${autoScrollSync ? 'bg-secondary/20 text-secondary' : 'bg-surface/80 hover:bg-surface text-muted hover:text-foreground'} border border-border transition-colors`}
              title="Toggle auto-scroll sync"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowOutline((v) => !v);
              }}
              className={`p-1.5 rounded-md ${showOutline ? 'bg-secondary/20 text-secondary' : 'bg-surface/80 hover:bg-surface text-muted hover:text-foreground'} border border-border transition-colors`}
              title="Toggle outline"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNotesCollapsed(true);
                setPdfCollapsed(false);
              }}
              className="p-1.5 rounded-md bg-surface/80 hover:bg-surface border border-border text-muted hover:text-foreground transition-colors"
              title="Collapse notes panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          <div className="flex-1 p-0 overflow-hidden flex flex-col bg-surface">
            {settings?.liveMarkdownPreview && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 shrink-0">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setNoteTab('edit')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                      noteTab === 'edit' ? 'bg-secondary/10 text-secondary border border-secondary/30' : 'text-muted hover:text-foreground hover:bg-surface/50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      Edit
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteTab('preview')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                      noteTab === 'preview' ? 'bg-secondary/10 text-secondary border border-secondary/30' : 'text-muted hover:text-foreground hover:bg-surface/50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      Preview
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted/60">
                </div>
              </div>
            )}
            {showOutline && notesOutline.length > 0 && (
              <div className="border-b border-border/50 bg-surface/30 backdrop-blur-sm p-4 max-h-64 overflow-auto">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  Outline
                </div>
                <div className="space-y-0.5">
                  {notesOutline.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => scrollToOutlineItem(item.line)}
                      className="block w-full text-left text-sm hover:text-secondary hover:bg-surface/50 transition-all rounded px-2 py-1.5 group"
                      style={{ paddingLeft: `${8 + (item.level - 1) * 16}px` }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-muted/40 group-hover:text-secondary/60 transition-colors" style={{ fontSize: `${Math.max(0.6, 1 - item.level * 0.1)}rem` }}>
                          {'#'.repeat(item.level)}
                        </span>
                        <span className="flex-1 truncate">{item.text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!settings?.liveMarkdownPreview || noteTab === 'edit' ? (
              <div className="flex-1 flex flex-col relative">
                <textarea
                  ref={notesTextareaRef}
                  className="markdown-editor flex-1 w-full bg-transparent px-12 py-8 resize-none outline-none text-base text-foreground placeholder:text-muted/30"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                className="flex-1 markdown-preview overflow-auto px-12 py-8 bg-transparent text-foreground outline-none focus:outline-none"
                onFocus={() => setFocusedPanel('notes')}
              >
                <div className="max-w-[750px] mx-auto" dangerouslySetInnerHTML={{ __html: compiledMarkdown }} />
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
