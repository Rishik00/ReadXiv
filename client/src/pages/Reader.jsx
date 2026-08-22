import {
  forwardRef,
  Profiler,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import {
  MDXEditor,
  codeBlockPlugin,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import PdfViewer from '../components/PdfViewer';
import ReaderPdfFloatingToolbar from '../components/ReaderPdfFloatingToolbar';
import { latexEditorPlugin } from '../components/LatexEditorPlugin';
import { Card, CardContent } from '../components/ui/card';
import {
  captureAction,
  captureAppError,
  captureEvent,
  captureTiming,
  elapsedSince,
  getInstrumentationSessionId,
  startTimer,
} from '../lib/instrumentation';
import useReadingSession from '../lib/useReadingSession';
import { buildTitleOnlyNote, getPaperNoteTitle, NOTE_TEMPLATES } from '../lib/noteTemplates';

const DEFAULT_SPLIT = 68;
const PERF_FLAG = 'readxiv-perf';
const NOTE_BENCHMARK_FLAG = 'readxiv-note-benchmark';
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

function readPerfEnabled() {
  try {
    return localStorage.getItem(PERF_FLAG) === '1';
  } catch {
    return false;
  }
}

function readNoteBenchmarkEnabled() {
  try {
    return localStorage.getItem(NOTE_BENCHMARK_FLAG) === '1';
  } catch {
    return false;
  }
}

function perfLog(label, payload = {}) {
  if (!readPerfEnabled()) return;
  if (typeof window !== 'undefined') {
    window.__readxivPerfEvents = window.__readxivPerfEvents || [];
    window.__readxivPerfEvents.push({
      kind: 'event',
      label,
      at: performance.now(),
      payload,
    });
  }
  console.log(`[readxiv:perf] ${label}`, payload);
}

function profileRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  if (!readPerfEnabled()) return;
  if (typeof window !== 'undefined') {
    window.__readxivPerfEvents = window.__readxivPerfEvents || [];
    window.__readxivPerfEvents.push({
      kind: 'profiler',
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });
  }
  console.log(`[readxiv:profiler] ${id}`, {
    phase,
    actualMs: Number(actualDuration.toFixed(2)),
    baseMs: Number(baseDuration.toFixed(2)),
    startMs: Number(startTime.toFixed(2)),
    commitMs: Number(commitTime.toFixed(2)),
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForFrames(count = 2) {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function countNoteWords(value) {
  let words = 0;
  let insideWord = false;
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    const whitespace = charCode <= 32;
    if (!whitespace && !insideWord) words += 1;
    insideWord = !whitespace;
  }
  return words;
}

function makeSyntheticMarkdown(targetKb) {
  const target = targetKb * 1024;
  const paragraphs = [];
  let i = 1;
  while (paragraphs.join('\n\n').length < target) {
    paragraphs.push(
      `## Section ${i}\n\n` +
        `This synthetic benchmark paragraph contains representative paper notes, equations like $x_${i} = y + z$, ` +
        `short observations, citation reminders, and action items for later reading. ` +
        `The goal is to approximate normal markdown editing cost without relying on any one real note.`
    );
    i += 1;
  }
  return paragraphs.join('\n\n').slice(0, target);
}

function summarizeEvents(events, sizeKb, markdown, editCount, elapsedMs) {
  const profilers = events.filter((event) => event.kind === 'profiler');
  const byId = new Map();
  for (const event of profilers) {
    const current = byId.get(event.id) || { count: 0, total: 0, max: 0 };
    current.count += 1;
    current.total += event.actualDuration;
    current.max = Math.max(current.max, event.actualDuration);
    byId.set(event.id, current);
  }
  const lines = markdown.split('\n').length;
  const words = markdown.split(/\s+/).filter(Boolean).length;
  const row = {
    sizeKb,
    chars: markdown.length,
    lines,
    words,
    edits: editCount,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    readerCommits: events.filter((e) => e.label === 'Reader commit').length,
    onChanges: events.filter((e) => e.label === 'MDXEditor onChange').length,
    outlineRuns: events.filter((e) => e.label === 'notesOutline recomputed').length,
  };
  for (const [id, stats] of byId) {
    const shortId = id.replace(/^Reader\./, '');
    row[`${shortId} commits`] = stats.count;
    row[`${shortId} avgMs`] = Number((stats.total / stats.count).toFixed(2));
    row[`${shortId} maxMs`] = Number(stats.max.toFixed(2));
  }
  return row;
}

function normalizeReaderView(value) {
  return value === 'pdf' || value === 'notes' ? value : 'split';
}

function extractMarkdownTitle(markdown) {
  if (!markdown || typeof markdown !== 'string') return null;
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (!match) continue;
    const title = match[1]
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return title || null;
  }
  return null;
}

function normalizeMarkdownForComparison(markdown) {
  return String(markdown || '').replace(/\r\n/g, '\n').trim();
}

function isStarterNote(markdown, paper) {
  const normalized = normalizeMarkdownForComparison(markdown);
  if (!normalized) return true;

  const title = getPaperNoteTitle(paper);
  const placeholderTitle = paper?.id ? `arXiv:${paper.id}` : null;
  const titleOnlyCandidates = [
    `# ${title}`,
    placeholderTitle ? `# ${placeholderTitle}` : null,
  ].filter(Boolean);
  if (titleOnlyCandidates.includes(normalized)) return true;

  return NOTE_TEMPLATES.some((template) => {
    if (template.id === 'none') return false;
    return normalizeMarkdownForComparison(template.build(paper)) === normalized;
  });
}

function inferNoteTemplateId(markdown, paper) {
  const normalized = normalizeMarkdownForComparison(markdown);
  if (!normalized) return 'none';

  const title = getPaperNoteTitle(paper);
  const placeholderTitle = paper?.id ? `arXiv:${paper.id}` : null;
  if (normalized === `# ${title}` || (placeholderTitle && normalized === `# ${placeholderTitle}`)) {
    return 'none';
  }

  const matchedTemplate = NOTE_TEMPLATES.find((template) => (
    template.id !== 'none' &&
    normalizeMarkdownForComparison(template.build(paper)) === normalized
  ));
  return matchedTemplate?.id || 'custom';
}

function isPlaceholderPaperTitle(paper) {
  if (!paper?.id || !paper?.title) return false;
  return String(paper.title).trim() === `arXiv:${paper.id}`;
}

const Reader = forwardRef(function Reader(
  { paper, setSelectedPaper, setPage, settings, initialTab = 'edit', addToast, onExit },
  ref
) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const normalizedInitialTab = initialTab === 'references' ? 'references' : 'edit';
  const [readerPaper, setReaderPaper] = useState(paper);
  const [notes, setNotes] = useState('');
  const [serverNotes, setServerNotes] = useState('');
  const [notesStatus, setNotesStatus] = useState('idle');
  const [noteTab, setNoteTab] = useState(normalizedInitialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_SPLIT);
  const [backgroundPdfLoading, setBackgroundPdfLoading] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState('pdf');
  const initialReaderView = normalizeReaderView(settings?.defaultReaderView);
  const [pdfCollapsed, setPdfCollapsed] = useState(initialReaderView === 'notes');
  const [notesCollapsed, setNotesCollapsed] = useState(initialReaderView === 'pdf');
  const [showOutline, setShowOutline] = useState(false);
  const [foldedSections, setFoldedSections] = useState(new Set());
  const [pdfToolbarMetrics, setPdfToolbarMetrics] = useState(null);
  const [readerToolbarExpanded, setReaderToolbarExpanded] = useState(true);
  const progressSaveTimerRef = useRef(null);
  const lastReadingProgressRef = useRef(null);
  const [pageInputFocusNonce, setPageInputFocusNonce] = useState(0);
  const [documentOutline, setDocumentOutline] = useState([]);
  const [paperReferences, setPaperReferences] = useState([]);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesLoadedForPaperId, setReferencesLoadedForPaperId] = useState(null);
  const [addingReferenceKeys, setAddingReferenceKeys] = useState(() => new Set());
  const [addedReferenceKeys, setAddedReferenceKeys] = useState(() => new Set());
  const [selectedNoteTemplate, setSelectedNoteTemplate] = useState('paper-digest');
  const splitRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pdfPanelRef = useRef(null);
  const mdxEditorRef = useRef(null);
  const pdfViewerRef = useRef(null);
  const benchmarkRanRef = useRef(false);
  const benchmarkActiveRef = useRef(false);
  const notesTitleSyncRef = useRef(new Set());
  const paperId = useMemo(() => readerPaper?.id || paper?.id, [readerPaper?.id, paper?.id]);
  useReadingSession(paperId);

  const saveReadingProgress = useCallback(({ page, totalPages }) => {
    if (!paperId) return;
    lastReadingProgressRef.current = { page, totalPages };
    if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
    progressSaveTimerRef.current = setTimeout(() => {
      axios.put(`/api/papers/${encodeURIComponent(paperId)}/progress`, { page, totalPages })
        .then(() => window.dispatchEvent(new Event('readxiv:paper-accessed')))
        .catch(() => {});
      progressSaveTimerRef.current = null;
    }, 700);
  }, [paperId]);

  useEffect(() => () => {
    if (!progressSaveTimerRef.current || !paperId || !lastReadingProgressRef.current) return;
    clearTimeout(progressSaveTimerRef.current);
    axios.put(
      `/api/papers/${encodeURIComponent(paperId)}/progress`,
      lastReadingProgressRef.current
    ).catch(() => {});
  }, [paperId]);

  useEffect(() => {
    perfLog('Reader commit', {
      render: renderCountRef.current,
      paperId,
      notesLength: notes.length,
      noteTab,
      pdfCollapsed,
      notesCollapsed,
    });
  });

  const mdxPlugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      linkPlugin(),
      tablePlugin(),
      thematicBreakPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
      markdownShortcutPlugin(),
      latexEditorPlugin(),
    ],
    []
  );

  const setReaderView = useCallback((mode) => {
    captureAction('reader_view_change', { route: 'reader', paperId, mode });
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
  }, [paperId]);

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
      setNoteTab: (tab) => setNoteTab(tab === 'references' ? 'references' : 'edit'),
      openPdfPageJumpMenu: () => setPageInputFocusNonce((value) => value + 1),
    }),
    [setReaderView]
  );

  const handleToolbarState = useCallback((metrics) => {
    setPdfToolbarMetrics(metrics);
  }, []);

  const handleDocumentOutline = useCallback((outline) => {
    setDocumentOutline(Array.isArray(outline) ? outline : []);
  }, []);

  const changeStatus = useCallback(async (nextStatus) => {
    if (!paperId) return;
    const previousStatus = readerPaper?.status;
    if (nextStatus === previousStatus) {
      if (nextStatus === 'done') onExit?.();
      return;
    }
    // optimistic
    setReaderPaper((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    setSelectedPaper?.((prev) => (prev?.id === paperId ? { ...prev, status: nextStatus } : prev));
    try {
      await axios.patch(`/api/papers/${encodeURIComponent(paperId)}`, { status: nextStatus });
      captureAction('reader_status_change', { route: 'reader', paperId, fromStatus: previousStatus, toStatus: nextStatus });
      if (nextStatus === 'done') {
        addToast?.('Marked done', 'success');
        onExit?.();
      } else {
        addToast?.(`Status: ${nextStatus}`, 'success');
      }
    } catch (err) {
      // rollback
      setReaderPaper((prev) => (prev ? { ...prev, status: previousStatus } : prev));
      setSelectedPaper?.((prev) => (prev?.id === paperId ? { ...prev, status: previousStatus } : prev));
      addToast?.(err.response?.data?.error || 'Could not update status', 'error');
    }
  }, [paperId, readerPaper?.status, setSelectedPaper, addToast, onExit]);

  const readerView = pdfCollapsed ? 'notes' : notesCollapsed ? 'pdf' : 'split';
  const pdfSolo = readerView === 'pdf';
  const isWebArticle = readerPaper?.source === 'web' && /^https:\/\//i.test(readerPaper?.url || '');

  const addShelfReference = useCallback(
    async (arxivId, dedupeKey) => {
      if (!arxivId || dedupeKey == null) return;
      setAddingReferenceKeys((prev) => new Set(prev).add(dedupeKey));
      try {
        await axios.post('/api/arxiv/add', { input: `https://arxiv.org/abs/${arxivId}` });
        setAddedReferenceKeys((prev) => new Set(prev).add(dedupeKey));
        addToast?.('Added to library', 'success');
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
    const startedAt = performance.now();
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
    perfLog('notesOutline recomputed', {
      notesLength: notes.length,
      lines: lines.length,
      headings: outline.length,
      ms: Number((performance.now() - startedAt).toFixed(2)),
    });
    return outline;
  }, [notes]);
  const notesWordCount = useMemo(() => countNoteWords(notes), [notes]);

  const addablePaperReferences = useMemo(
    () => paperReferences.filter(referenceIsAddableToShelf),
    [paperReferences]
  );

  function renderOutlineHeadingInline(source) {
    const s = source ?? '';
    try {
      return md.renderInline(s);
    } catch {
      return md.utils.escapeHtml(s);
    }
  }

  useEffect(() => {
    setNoteTab(normalizedInitialTab);
  }, [normalizedInitialTab, paperId]);

  useEffect(() => {
    setReaderView(normalizeReaderView(settings?.defaultReaderView));
    setLeftWidth(DEFAULT_SPLIT);
  }, [paperId, settings?.defaultReaderView, setReaderView]);

  useEffect(() => {
    setPaperReferences([]);
    setReferencesLoadedForPaperId(null);
    setAddingReferenceKeys(new Set());
    setAddedReferenceKeys(new Set());
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
    const inferredTemplateId = inferNoteTemplateId(notes, readerPaper || paper);
    if (inferredTemplateId && inferredTemplateId !== selectedNoteTemplate) {
      setSelectedNoteTemplate(inferredTemplateId);
    }
  }, [notes, readerPaper, paper, selectedNoteTemplate]);

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;
    let pollAttempts = 0;
    async function loadReaderData() {
      if (!paperId) return;
      const startedAt = startTimer();
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
        if ((!data.hasPdf && data.status === 'loading') || isPlaceholderPaperTitle(data)) {
          pollTimer = setInterval(async () => {
            try {
              pollAttempts += 1;
              const { data: refreshed } = await axios.get(`/api/reader/${paperId}`, {
                params: { brief: 1 },
              });
              if (!mounted) return;
              setReaderPaper((prev) => ({ ...prev, ...refreshed }));
              setBackgroundPdfLoading(Boolean(!refreshed.hasPdf && refreshed.status === 'loading'));
              const pdfPreparationFinished = refreshed.hasPdf || refreshed.status !== 'loading';
              const metadataPreparationFinished = !isPlaceholderPaperTitle(refreshed);
              if ((pdfPreparationFinished && metadataPreparationFinished) || pollAttempts >= 60) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
            } catch {
              /* keep polling */
            }
          }, 2000);
        }
        captureTiming('paper_load', elapsedSince(startedAt), {
          route: 'reader',
          paperId,
          paperTitle: data.title,
          hasPdf: Boolean(data.hasPdf),
          status: data.status,
        });
      } catch (err) {
        if (!mounted) return;
        const message = err.response?.data?.error || 'Failed to load reader data';
        setError(message);
        captureAppError(err, {
          route: 'reader',
          source: 'reader_data_load',
          paperId,
          message,
        });
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
    captureEvent('paper_view', {
      route: 'reader',
      paperId,
      paperTitle: readerPaper?.title || paper?.title,
    });
    axios.post(`/api/papers/${paperId}/access`, {
      sessionId: getInstrumentationSessionId(),
      source: 'reader',
    }).catch(() => {
      // Best-effort analytics update for recents; ignore failures.
    });
  }, [paperId]);

  useEffect(() => {
    if (!paperId || !notes || !isPlaceholderPaperTitle(readerPaper)) return;
    const nextTitle = extractMarkdownTitle(notes);
    if (!nextTitle || nextTitle === readerPaper.title || nextTitle === `arXiv:${paperId}`) return;
    const syncKey = `${paperId}:${nextTitle}`;
    if (notesTitleSyncRef.current.has(syncKey)) return;
    notesTitleSyncRef.current.add(syncKey);
    axios
      .patch(`/api/papers/${paperId}`, { title: nextTitle })
      .then(({ data }) => {
        setReaderPaper((prev) => ({ ...prev, ...data }));
        setSelectedPaper?.((prev) => (prev?.id === paperId ? { ...prev, ...data } : prev));
        addToast?.('Paper title updated from notes', 'success');
      })
      .catch(() => {
        notesTitleSyncRef.current.delete(syncKey);
      });
  }, [paperId, notes, readerPaper?.title, setSelectedPaper, addToast]);

  useEffect(() => {
    if (benchmarkActiveRef.current) return undefined;
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
    if (!readPerfEnabled() || !readNoteBenchmarkEnabled()) return undefined;
    if (benchmarkRanRef.current || noteTab !== 'edit' || loading || !paperId) return undefined;
    let cancelled = false;
    benchmarkRanRef.current = true;

    async function runBenchmark() {
      const sizes = [10, 25, 50, 100, 250];
      const editCount = 8;
      const results = [];
      benchmarkActiveRef.current = true;
      setNotesStatus('idle');
      perfLog('note benchmark started', { sizes, editCount });

      try {
        for (const sizeKb of sizes) {
          if (cancelled) return;
          const synthetic = makeSyntheticMarkdown(sizeKb);
          setNotes(synthetic);
          await wait(800);
          await waitForFrames(3);

          if (cancelled) return;
          window.__readxivPerfEvents = [];
          const startedAt = performance.now();
          for (let i = 0; i < editCount; i += 1) {
            mdxEditorRef.current?.insertMarkdown?.(` bench${i}`);
            await wait(120);
          }
          await wait(700);
          await waitForFrames(3);
          const elapsedMs = performance.now() - startedAt;
          const events = window.__readxivPerfEvents || [];
          results.push(summarizeEvents(events, sizeKb, synthetic, editCount, elapsedMs));
        }

        if (cancelled) return;
        window.__readxivNoteBenchmarkResults = results;
        console.table(results);
        perfLog('note benchmark complete', {
          results,
          note: 'Results are also available at window.__readxivNoteBenchmarkResults',
        });
      } finally {
        benchmarkActiveRef.current = false;
        setNotesStatus('idle');
      }
    }

    runBenchmark();
    return () => {
      cancelled = true;
      benchmarkActiveRef.current = false;
    };
  }, [noteTab, loading, paperId]);

  useEffect(() => {
    if (noteTab !== 'edit') return;
    const startedAt = performance.now();
    const editorMarkdown = mdxEditorRef.current?.getMarkdown?.();
    perfLog('MDX sync effect checked', {
      notesLength: notes.length,
      editorLength: editorMarkdown?.length,
      changed: editorMarkdown !== undefined && editorMarkdown !== notes,
      ms: Number((performance.now() - startedAt).toFixed(2)),
    });
    if (editorMarkdown !== undefined && editorMarkdown !== notes) {
      mdxEditorRef.current?.setMarkdown(notes);
    }
  }, [notes, noteTab, paperId]);

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
                  mdxEditorRef.current?.focus?.();
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

  function resetSplit() {
    setLeftWidth(DEFAULT_SPLIT);
    setPdfCollapsed(false);
    setNotesCollapsed(false);
  }

  function wrapSelection(prefix, suffix = '') {
    const selected = mdxEditorRef.current?.getSelectionMarkdown?.();
    if (!selected) return;
    mdxEditorRef.current?.insertMarkdown?.(`${prefix}${selected}${suffix}`);
  }

  function insertAtCursor(text) {
    if (noteTab !== 'edit') {
      setNoteTab('edit');
      setTimeout(() => mdxEditorRef.current?.insertMarkdown?.(text), 80);
    } else {
      mdxEditorRef.current?.insertMarkdown?.(text);
    }
  }

  function applyNoteTemplate(templateId) {
    const template = NOTE_TEMPLATES.find((item) => item.id === templateId) || NOTE_TEMPLATES[0];
    const activePaper = readerPaper || paper;
    const markdown = template.id === 'none'
      ? buildTitleOnlyNote(activePaper)
      : `${template.build(activePaper).trimEnd()}\n`;

    setSelectedNoteTemplate(template.id);
    setNoteTab('edit');
    setNotes((prev) => {
      if (isStarterNote(prev, activePaper)) return markdown;
      if (template.id === 'none') return prev;
      return `${prev.trimEnd()}\n\n${markdown}`;
    });
    captureAction('apply_note_template', {
      paperId,
      templateId: template.id,
    });
    if (template.id !== 'none') {
      addToast?.(`${template.label} template applied`, 'success');
    }
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
    setNoteTab('edit');
    requestAnimationFrame(() => {
      mdxEditorRef.current?.focus?.();
      const headingText = notes.split('\n')[lineNumber]?.replace(/^#{1,6}\s+/, '').trim();
      if (!headingText) return;
      const editable = document.querySelector('.readxiv-mdx-editor [contenteditable="true"]');
      const heading = Array.from(editable?.querySelectorAll('h1,h2,h3,h4,h5,h6') || [])
        .find((el) => el.textContent?.trim() === headingText);
      heading?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
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
    const startedAt = performance.now();
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
    
    const folded = result.join('\n');
    perfLog('displayNotes recomputed', {
      notesLength: notes.length,
      foldedLength: folded.length,
      foldedSections: foldedSections.size,
      ms: Number((performance.now() - startedAt).toFixed(2)),
    });
    return folded;
  }, [notes, foldedSections]);


  if (!paperId) {
    return (
      <div className="p-8 max-w-[980px] mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-muted text-sm">Select a paper from the Library to begin reading.</p>
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
    viewMode: readerView,
    onSetView: setReaderView,
    pageInputFocusNonce,
    documentOutline,
    selectedNoteTemplate,
    noteTemplates: NOTE_TEMPLATES,
    onChangeNoteTemplate: applyNoteTemplate,
    status: readerPaper?.status || 'queued',
    onChangeStatus: changeStatus,
  };

  return (
    <div className={`reader-workspace w-full mx-auto font-sans h-screen flex flex-col overflow-hidden animate-view-fade ${
      pdfSolo ? 'reader-workspace-pdf-solo max-w-none p-0' : 'max-w-[1800px] p-4 sm:p-5'
    }`}>
      {backgroundPdfLoading && (
        <div className="mb-4 flex-shrink-0 rounded-lg border border-border/60 bg-background/80 px-4 py-3 backdrop-blur">
          <div className="mb-2 text-sm font-medium text-secondary">
            The paper is being chunked and rendered for the panel, please wait
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-foreground/20 rounded-full">
            <div className="loading-indicator h-full w-1/3 bg-secondary rounded-full" />
          </div>
        </div>
      )}

      <div ref={splitRootRef} className={`reader-split-shell flex gap-0 flex-1 min-h-0 relative ${pdfSolo ? 'reader-split-shell-solo' : ''}`}>
        {!pdfCollapsed && (
          <div
            ref={pdfPanelRef}
            tabIndex={0}
            style={{ width: notesCollapsed ? '100%' : `${leftWidth}%` }}
            className={`reader-panel reader-pdf-panel overflow-hidden relative ${notesCollapsed ? 'reader-pdf-panel--solo' : ''} ${notesCollapsed ? '' : 'rounded-r-none'} h-full min-h-0 transition-all outline-none focus:outline-none ${focusedPanel === 'pdf' ? 'reader-panel-focused' : ''}`}
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
            <Profiler id="Reader.PdfViewer" onRender={profileRender}>
              {isWebArticle ? (
                <div className="flex h-full min-h-0 flex-col bg-[var(--pdf-canvas-bg)]">
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 py-2.5">
                    <div className="min-w-0"><div className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted">Live web article</div><div className="truncate text-sm text-foreground">{readerPaper?.url}</div></div>
                    <a href={readerPaper.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:border-secondary">Open original ↗</a>
                  </div>
                  <iframe title={readerPaper?.title || 'Web article'} src={readerPaper.url} className="min-h-0 w-full flex-1 border-0 bg-white" referrerPolicy="no-referrer" />
                </div>
              ) : readerPaper?.hasPdf ? (
                <PdfViewer
                  ref={pdfViewerRef}
                  paperId={paperId}
                  paperTitle={readerPaper?.title}
                  continuousScroll={settings?.continuousScroll !== false}
                  defaultZoom={settings?.defaultPdfZoom ?? 'actual'}
                  initialPage={readerPaper?.current_page || 1}
                  onPageProgress={saveReadingProgress}
                  onInsertQuote={insertQuoteFromHighlight}
                  onToolbarState={handleToolbarState}
                  onDocumentOutline={handleDocumentOutline}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-[var(--pdf-canvas-bg)] px-6 text-center">
                  <div className="max-w-sm rounded-lg border border-border/70 bg-background/85 px-5 py-4 shadow-xl">
                    <div className="text-sm font-semibold text-foreground">
                      {readerPaper?.status === 'error' ? 'PDF unavailable' : 'Preparing PDF'}
                    </div>
                    <div className="mt-1.5 text-xs leading-5 text-muted">
                      {readerPaper?.status === 'error'
                        ? 'The PDF download failed. You can keep notes here or try adding the paper again later.'
                        : 'ReadXiv is fetching the document. Notes are ready while the PDF is being prepared.'}
                    </div>
                  </div>
                </div>
              )}
            </Profiler>
            {readerToolbarExpanded && readerPaper?.hasPdf && (
              <Profiler id="Reader.PdfToolbar" onRender={profileRender}>
                <ReaderPdfFloatingToolbar {...readerToolbarProps} />
              </Profiler>
            )}
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
              className="reader-collapse-rail w-10 flex items-center justify-center transition-colors shrink-0"
              title="Expand PDF panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            {readerToolbarExpanded && readerPaper?.hasPdf && (
              <Profiler id="Reader.PdfToolbar.CollapsedPdf" onRender={profileRender}>
                <ReaderPdfFloatingToolbar {...readerToolbarProps} />
              </Profiler>
            )}
          </>
        )}

        {!pdfCollapsed && !notesCollapsed && (
          <div
            className="reader-resize-seam w-3 cursor-col-resize flex items-center justify-center z-10 -ml-1.5 -mr-1.5 relative select-none"
            onMouseDown={startResize}
            onDoubleClick={resetSplit}
            title="Drag to resize. Double-click to reset."
          >
            <div className="reader-resize-grip w-px h-10 rounded-full" />
          </div>
        )}

        {!notesCollapsed && (
          <div
            style={{ width: pdfCollapsed ? '100%' : `${100 - leftWidth}%` }}
            className={`reader-panel reader-notes-panel flex flex-col overflow-hidden ${pdfCollapsed ? '' : 'rounded-l-none'} h-full min-h-0 transition-all ${focusedPanel === 'notes' ? 'reader-panel-focused' : ''} notes-editor-container`}
            onClick={() => setFocusedPanel('notes')}
          >
          <div className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-3 px-8 sm:px-12 py-3 border-b border-border/20 shrink-0 bg-background/10">
              <div className="flex items-center gap-6 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteTab('edit');
                  }}
                  className={`relative flex items-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
                    noteTab === 'edit'
                      ? 'text-foreground'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  <span className="truncate">Notes</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteTab('references');
                  }}
                  className={`relative flex items-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
                    noteTab === 'references'
                      ? 'text-foreground'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>
                  <span className="truncate">
                    <span className="sm:hidden">Refs</span>
                    <span className="hidden sm:inline">References</span>
                  </span>
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOutline((v) => !v);
                  }}
                  className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${
                    showOutline
                      ? 'text-secondary bg-secondary/10'
                      : 'text-muted hover:text-foreground'
                  }`}
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
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-5 max-w-[720px] mx-auto">
                  References
                </h2>
                {referencesLoading ? (
                  <div className="max-w-[720px] mx-auto rounded-lg border border-border/60 bg-surface/40 p-4">
                    <div className="h-3 w-40 rounded skeleton-shimmer" />
                    <div className="mt-3 h-2.5 w-5/6 rounded skeleton-shimmer" />
                    <div className="mt-2 h-2.5 w-2/3 rounded skeleton-shimmer" />
                  </div>
                ) : addablePaperReferences.length === 0 ? (
                  <div className="rx-empty-state !h-auto max-w-[720px] mx-auto rounded-lg border border-border/60 bg-surface/35">
                    <div className="rx-empty-state-inner">
                      <div className="rx-empty-state-title">
                        {paperReferences.length > 0 ? 'No addable arXiv references' : 'No references extracted'}
                      </div>
                      <div className="rx-empty-state-copy">
                        {paperReferences.length > 0
                          ? 'References were found, but none included an arXiv ID that can be added directly.'
                          : 'This PDF may not expose references in a form ReadXiv can parse yet.'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-6 max-w-[720px] mx-auto">
                    {addablePaperReferences.map((ref, idx) => {
                      const rowKey = ref.label || `${ref.arxivId || ''}-${ref.doi || ''}-${idx}`;
                      const busy = addingReferenceKeys.has(rowKey);
                      const added = addedReferenceKeys.has(rowKey);
                      const linkHref = referenceExternalLinkHref(ref);
                      const authorsShort = formatReferenceAuthorsEtAl(ref.authors, 5);
                      return (
                        <li
                          key={rowKey}
                          className="pb-5 border-b border-border/25 last:border-0 last:pb-0"
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
                                  className="inline-flex items-center justify-center px-1 py-1 text-xs font-medium text-muted hover:text-foreground transition-colors"
                                >
                                  Link
                                </a>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy || added}
                                onClick={() => addShelfReference(ref.arxivId.trim(), rowKey)}
                                className={`inline-flex items-center justify-center px-1 py-1 text-xs font-medium transition-colors ${
                                  added
                                    ? 'text-muted cursor-default'
                                    : 'text-secondary hover:text-foreground disabled:opacity-50'
                                }`}
                              >
                                {added ? 'Added' : busy ? 'Adding...' : 'Add'}
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div
                className="flex-1 min-h-0 flex flex-col relative overflow-hidden select-text"
                onFocusCapture={() => setFocusedPanel('notes')}
              >
                <Profiler id="Reader.MDXEditor" onRender={profileRender}>
                  <MDXEditor
                    ref={mdxEditorRef}
                    markdown={notes}
                    plugins={mdxPlugins}
                    className="readxiv-mdx-editor markdown-editor flex-1 min-h-0 w-full overflow-y-auto bg-transparent px-8 sm:px-12 pt-7 pb-8 text-base text-foreground select-text"
                    contentEditableClassName="readxiv-mdx-content markdown-preview max-w-[750px] mx-auto min-h-full outline-none"
                    placeholder="Start writing your thoughts..."
                    onChange={(markdown) => {
                      perfLog('MDXEditor onChange', {
                        previousLength: notes.length,
                        nextLength: markdown.length,
                      });
                      setNotes(markdown);
                    }}
                    onError={(payload) => {
                      console.warn('MDXEditor markdown parse error', payload);
                    }}
                  />
                </Profiler>
                {foldedSections.size > 0 && (
                  <div className="absolute top-4 right-4 text-xs text-muted bg-surface/80 px-2 py-1 rounded border border-border">
                    {foldedSections.size} section(s) folded
                  </div>
                )}
                <div className="editor-status-bar shrink-0 flex flex-wrap items-center justify-between gap-2 px-8 sm:px-12 py-2 border-t border-border/20">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted/60">
                    <span className="flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
                      {notesWordCount} words
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
            className="reader-collapse-rail w-10 flex items-center justify-center transition-colors"
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
