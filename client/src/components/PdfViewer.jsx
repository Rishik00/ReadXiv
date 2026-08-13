import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { getDocument, GlobalWorkerOptions, AnnotationMode } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import { captureAction, captureAppError, captureTiming, elapsedSince, startTimer } from '../lib/instrumentation';

GlobalWorkerOptions.workerSrc = pdfWorker;

// Question: whats a good way to do private global variables in JS? I dont want globale variables to be accessible via the app.
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;
const SCALE_STEP = 1.12;
const VALID_ZOOM_PRESETS = new Set(['actual', 'page-width', 'page-fit', 'auto']);

// Put this in a utils file or in the lib folder or something. Use stuff globally pls. 
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeZoomPreset(value) {
  return VALID_ZOOM_PRESETS.has(value) ? value : 'actual';
}

const PdfViewer = forwardRef(function PdfViewer(
  {
    paperId,
    paperTitle,
    continuousScroll = true,
    defaultZoom = 'actual',
    initialPage = 1,
    onPageProgress,
    onInsertQuote,
    onSendToCanvas,
    onToolbarState,
  },
  ref
) {
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const pdfDocumentRef = useRef(null);
  const pdfViewerRef = useRef(null);
  const linkServiceRef = useRef(null);
  const findControllerRef = useRef(null);

  // Question: what does eventBusRef do? 
  const eventBusRef = useRef(null);
  const findQueryRef = useRef('');
  const defaultZoomRef = useRef(normalizeZoomPreset(defaultZoom));
  const highlightsRef = useRef([]);
  const initialPageRef = useRef(Math.max(1, Number(initialPage) || 1));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfDarkMode, setPdfDarkMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState('');
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [pendingHighlight, setPendingHighlight] = useState(null);

  const pdfUrl = useMemo(() => (paperId ? `/api/reader/${paperId}/pdf` : null), [paperId]);


  // Why do these effect calls have to be chained like this? 
  // What are each of them doing? 

  
  useEffect(() => {
    findQueryRef.current = findQuery;
  }, [findQuery]);

  useEffect(() => {
    defaultZoomRef.current = normalizeZoomPreset(defaultZoom);
  }, [defaultZoom]);

  useEffect(() => {
    highlightsRef.current = highlights;
  }, [highlights]);

  useEffect(() => {
    if (!paperId) {
      setHighlights([]);
      return undefined;
    }
    let cancelled = false;
    axios
      .get(`/api/reader/${encodeURIComponent(paperId)}/highlights`)
      .then(({ data }) => {
        if (!cancelled) setHighlights(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        captureAppError(error, {
          route: 'reader',
          source: 'pdf_highlights_load',
          paperId,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  useEffect(() => {
    const container = containerRef.current;
    const viewer = viewerRef.current;
    if (!container || !viewer || !pdfUrl) return undefined;

    let cancelled = false;
    const abortController = new AbortController();
    
    // QUestion: What the fuck is this? 
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      linkService,
      findController,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      textLayerMode: 1,
      removePageBorders: true,
      abortSignal: abortController.signal,
    });

    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    findControllerRef.current = findController;
    pdfViewerRef.current = pdfViewer;
    linkService.setViewer(pdfViewer);

    const applyDefaultZoom = () => {
      pdfViewer.currentScaleValue = defaultZoomRef.current;
      setScale(pdfViewer.currentScale || 1);
    };

    const onPagesInit = () => {
      pdfViewer.scrollMode = continuousScroll ? ScrollMode.VERTICAL : ScrollMode.PAGE;
      applyDefaultZoom();
      const target = clamp(initialPageRef.current, 1, pdfDocumentRef.current?.numPages || 1);
      if (target > 1) pdfViewer.currentPageNumber = target;
    };
    const onPageChanging = ({ pageNumber }) => {
      setPage(pageNumber);
      onPageProgress?.({ page: pageNumber, totalPages: pdfDocumentRef.current?.numPages || 0 });
    };
    const onScaleChanging = ({ scale: nextScale }) => setScale(nextScale || pdfViewer.currentScale || 1);
    const onPageRendered = () => renderHighlightOverlays();
    const onFindState = ({ state, matchesCount }) => {
      if (!findQueryRef.current.trim()) {
        setFindStatus('');
        return;
      }
      if (state === 1) setFindStatus('Not found');
      else if (matchesCount?.total) setFindStatus(`${matchesCount.current || 1}/${matchesCount.total}`);
      else setFindStatus('Searching');
    };

    eventBus._on('pagesinit', onPagesInit);
    eventBus._on('pagechanging', onPageChanging);
    eventBus._on('scalechanging', onScaleChanging);
    eventBus._on('pagerendered', onPageRendered);
    eventBus._on('updatefindcontrolstate', onFindState);
    eventBus._on('updatefindmatchescount', onFindState);

    // Question: why function inside function, in python tbis is a red flag for me. 
    async function loadPdf() {
      const startedAt = startTimer();
      setLoading(true);
      setError(null);
      setNumPages(0);
      setPage(1);
      setFindQuery('');
      setFindStatus('');

      try {
        const task = getDocument({
          url: pdfUrl,
          stopAtErrors: false,
        });
        loadingTaskRef.current = task;
        const pdfDocument = await task.promise;
        if (cancelled) {
          await pdfDocument.destroy();
          return;
        }
        pdfDocumentRef.current = pdfDocument;
        linkService.setDocument(pdfDocument, null);
        findController.setDocument(pdfDocument);
        pdfViewer.setDocument(pdfDocument);
        setNumPages(pdfDocument.numPages);
        onPageProgress?.({
          page: clamp(initialPageRef.current, 1, pdfDocument.numPages),
          totalPages: pdfDocument.numPages,
        });
        captureTiming('pdf_load', elapsedSince(startedAt), {
          route: 'reader',
          paperId,
          paperTitle,
          numPages: pdfDocument.numPages,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load PDF');
          captureAppError(err, {
            route: 'reader',
            source: 'pdf_load',
            paperId,
            paperTitle,
            pdfUrl,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();

    // Question: bro why do we want to return all of this? what is this telling us? 
    // Question: what is an eventBus? 
    return () => {
      cancelled = true;
      abortController.abort();
      eventBus._off?.('pagesinit', onPagesInit);
      eventBus._off?.('pagechanging', onPageChanging);
      eventBus._off?.('scalechanging', onScaleChanging);
      eventBus._off?.('pagerendered', onPageRendered);
      eventBus._off?.('updatefindcontrolstate', onFindState);
      eventBus._off?.('updatefindmatchescount', onFindState);
      pdfViewer.setDocument(null);
      findController.setDocument(null);
      linkService.setDocument(null);
      loadingTaskRef.current?.destroy?.();
      pdfDocumentRef.current?.destroy?.();
      loadingTaskRef.current = null;
      pdfDocumentRef.current = null;
      pdfViewerRef.current = null;
      linkServiceRef.current = null;
      findControllerRef.current = null;
      eventBusRef.current = null;
    };
  }, [pdfUrl, continuousScroll, onPageProgress]);

  useEffect(() => {
    onToolbarState?.({
      scale,
      page,
      numPages,
      highlightMode,
      pdfDarkMode,
      highlightsCount: highlights.length,
      docReady: Boolean(pdfDocumentRef.current && !loading && !error),
      loading,
      error: Boolean(error),
    });
  }, [scale, page, numPages, highlightMode, highlights.length, pdfDarkMode, loading, error, onToolbarState]);

  useEffect(() => {
    renderHighlightOverlays();
  }, [highlights, scale, numPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = pdfViewerRef.current?.currentScale || scale;
      setViewerScale(event.deltaY > 0 ? current / SCALE_STEP : current * SCALE_STEP);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [scale]);

  useEffect(() => {
    if (!findOpen || !findQuery.trim()) return;
    const id = setTimeout(() => {
      eventBusRef.current?.dispatch('find', {
        source: rootRef.current,
        type: '',
        query: findQuery,
        phraseSearch: true,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: false,
        matchDiacritics: false,
      });
    }, 150);
    return () => clearTimeout(id);
  }, [findOpen, findQuery]);

  // Question: once again, why does this need to be inside the function? Can't we move it out? 
  function setViewerScale(nextScale) {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    viewer.currentScale = clamp(nextScale, SCALE_MIN, SCALE_MAX);
    setScale(viewer.currentScale);
    captureAction('pdf_zoom', {
      route: 'reader',
      paperId,
      scale: Number(viewer.currentScale.toFixed(3)),
    });
  }

  function jumpToPage(nextPage) {
    const viewer = pdfViewerRef.current;
    if (!viewer || !numPages) return;
    const targetPage = clamp(Number(nextPage) || 1, 1, numPages);
    viewer.currentPageNumber = targetPage;
    captureAction('pdf_jump_to_page', {
      route: 'reader',
      paperId,
      page: targetPage,
      numPages,
    });
  }

  function runFind(findPrevious = false) {
    if (!findQuery.trim()) return;
    captureAction('pdf_find', {
      route: 'reader',
      paperId,
      queryLength: findQuery.trim().length,
      direction: findPrevious ? 'previous' : 'next',
    });
    eventBusRef.current?.dispatch('find', {
      source: rootRef.current,
      type: 'again',
      query: findQuery,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  }

  function getHighlightColor(color) {
    if (color === 'blue') return 'rgba(96, 165, 250, 0.34)';
    if (color === 'pink') return 'rgba(244, 114, 182, 0.34)';
    if (color === 'green') return 'rgba(74, 222, 128, 0.32)';
    return 'rgba(250, 204, 21, 0.34)';
  }

  function renderHighlightOverlays() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.querySelectorAll('.readxiv-pdf-highlight-layer').forEach((node) => node.remove());

    const byPage = new Map();
    for (const highlight of highlightsRef.current) {
      const pageNumber = Number(highlight.page);
      if (!pageNumber) continue;
      if (!byPage.has(pageNumber)) byPage.set(pageNumber, []);
      byPage.get(pageNumber).push(highlight);
    }

    for (const [pageNumber, pageHighlights] of byPage.entries()) {
      const pageEl = viewer.querySelector(`.page[data-page-number="${pageNumber}"]`);
      if (!pageEl) continue;
      const layer = document.createElement('div');
      layer.className = 'readxiv-pdf-highlight-layer';
      layer.setAttribute('aria-hidden', 'true');
      pageEl.appendChild(layer);

      for (const highlight of pageHighlights) {
        const rects = Array.isArray(highlight.rect?.rects) ? highlight.rect.rects : [];
        for (const rect of rects) {
          const mark = document.createElement('button');
          mark.type = 'button';
          mark.className = 'readxiv-pdf-highlight-mark';
          mark.style.left = `${rect.left}%`;
          mark.style.top = `${rect.top}%`;
          mark.style.width = `${rect.width}%`;
          mark.style.height = `${rect.height}%`;
          mark.style.background = getHighlightColor(highlight.color);
          mark.title = highlight.note || highlight.text || 'Highlight';
          mark.addEventListener('click', (event) => {
            event.stopPropagation();
            onInsertQuote?.({ text: highlight.text, page: pageNumber });
          });
          layer.appendChild(mark);
        }
      }
    }
  }

  function buildPendingHighlight(selection, event) {
    const text = selection.toString().trim().replace(/\s+/g, ' ');
    if (!text) return null;

    const pageRects = new Map();
    for (const range of Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i))) {
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width < 2 || rect.height < 2) continue;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const pageEl = document.elementFromPoint(centerX, centerY)?.closest?.('.page[data-page-number]');
        if (!pageEl || !containerRef.current?.contains(pageEl)) continue;
        const pageNumber = Number(pageEl.dataset.pageNumber);
        const pageBox = pageEl.getBoundingClientRect();
        const clippedLeft = clamp(rect.left, pageBox.left, pageBox.right);
        const clippedRight = clamp(rect.right, pageBox.left, pageBox.right);
        const clippedTop = clamp(rect.top, pageBox.top, pageBox.bottom);
        const clippedBottom = clamp(rect.bottom, pageBox.top, pageBox.bottom);
        const normalized = {
          left: ((clippedLeft - pageBox.left) / pageBox.width) * 100,
          top: ((clippedTop - pageBox.top) / pageBox.height) * 100,
          width: ((clippedRight - clippedLeft) / pageBox.width) * 100,
          height: ((clippedBottom - clippedTop) / pageBox.height) * 100,
        };
        if (normalized.width <= 0 || normalized.height <= 0) continue;
        if (!pageRects.has(pageNumber)) pageRects.set(pageNumber, []);
        pageRects.get(pageNumber).push(normalized);
      }
    }

    const groups = Array.from(pageRects.entries()).map(([pageNumber, rects]) => ({ pageNumber, rects }));
    if (groups.length === 0) return null;
    const rootBox = rootRef.current.getBoundingClientRect();
    return {
      text,
      groups,
      color: 'yellow',
      note: '',
      x: clamp(event.clientX - rootBox.left + 12, 12, rootBox.width - 260),
      y: clamp(event.clientY - rootBox.top + 12, 12, rootBox.height - 180),
    };
  }

  async function savePendingHighlight({ insertQuote = false } = {}) {
    if (!pendingHighlight || !paperId) return;
    try {
      const created = [];
      for (const group of pendingHighlight.groups) {
        const { data } = await axios.post(`/api/reader/${encodeURIComponent(paperId)}/highlights`, {
          page: group.pageNumber,
          text: pendingHighlight.text,
          color: pendingHighlight.color,
          rect: { rects: group.rects },
          note: pendingHighlight.note,
        });
        created.push(data);
      }
      setHighlights((prev) => [...prev, ...created]);
      if (insertQuote) {
        onInsertQuote?.({ text: pendingHighlight.text, page: pendingHighlight.groups[0]?.pageNumber });
      }
      captureAction('pdf_highlight_create', {
        route: 'reader',
        paperId,
        pages: pendingHighlight.groups.length,
        quoteInserted: insertQuote,
      });
    } catch (error) {
      captureAppError(error, {
        route: 'reader',
        source: 'pdf_highlight_create',
        paperId,
      });
    } finally {
      setPendingHighlight(null);
      window.getSelection()?.removeAllRanges();
    }
  }

  function handleSelectionMouseUp(event) {
    if (!highlightMode) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const pending = buildPendingHighlight(selection, event);
    if (pending) setPendingHighlight(pending);
  }

  async function copyPageToClipboard() {
    const pdfDocument = pdfDocumentRef.current;
      if (!pdfDocument) return;
      try {
      const currentPage = await pdfDocument.getPage(page);
      const viewport = currentPage.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext('2d');
      await currentPage.render({ canvasContext: context, viewport }).promise;
      canvas.toBlob(async (blob) => {
        try {
          if (!blob) return;
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          captureAction('copy_pdf_page_to_clipboard', { route: 'reader', paperId, page });
        } catch (error) {
          captureAppError(error, {
            route: 'reader',
            source: 'copy_pdf_page_to_clipboard',
            paperId,
            page,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }, 'image/png');
    } catch (error) {
      captureAppError(error, {
        route: 'reader',
        source: 'copy_pdf_page_to_clipboard',
        paperId,
        page,
      });
      // Clipboard/image APIs are best-effort and vary by browser/Electron version.
    }
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => setViewerScale((pdfViewerRef.current?.currentScale || scale) * SCALE_STEP),
    zoomOut: () => setViewerScale((pdfViewerRef.current?.currentScale || scale) / SCALE_STEP),
    jumpToPage,
    focusScrollArea: () => containerRef.current?.focus(),
    togglePdfDarkMode: () => setPdfDarkMode((value) => !value),
    toggleHighlightMode: () => {
      setHighlightMode((value) => !value);
      setPendingHighlight(null);
    },
    openFind: () => {
      setFindOpen(true);
      requestAnimationFrame(() => rootRef.current?.querySelector('[data-pdf-find-input]')?.focus());
    },
    copyPageToClipboard,
    handleKeyDown: (event) => {
      if (!pdfViewerRef.current) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        requestAnimationFrame(() => rootRef.current?.querySelector('[data-pdf-find-input]')?.focus());
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        pdfViewerRef.current?.nextPage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        pdfViewerRef.current?.previousPage();
      } else if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        containerRef.current?.scrollBy({ top: 140, behavior: 'smooth' });
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        containerRef.current?.scrollBy({ top: -140, behavior: 'smooth' });
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setViewerScale((pdfViewerRef.current?.currentScale || scale) * SCALE_STEP);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setViewerScale((pdfViewerRef.current?.currentScale || scale) / SCALE_STEP);
      } else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        if (pdfViewerRef.current) {
          pdfViewerRef.current.currentScaleValue = defaultZoomRef.current;
          setScale(pdfViewerRef.current.currentScale || 1);
        }
      } else if (event.key === 'G' && event.shiftKey) {
        event.preventDefault();
        jumpToPage(numPages);
      }
    },
  }));

  return (
    <div
      ref={rootRef}
      className={`readxiv-pdfjs-root ${pdfDarkMode ? 'readxiv-pdfjs-dark' : ''} ${highlightMode ? 'readxiv-pdfjs-highlight-mode' : ''}`}
      aria-label={paperTitle ? `PDF viewer for ${paperTitle}` : 'PDF viewer'}
    >
      {findOpen && (
        <div className="readxiv-pdfjs-find">
          <input
            data-pdf-find-input
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setFindOpen(false);
                setFindQuery('');
                setFindStatus('');
                eventBusRef.current?.dispatch('findbarclose', { source: rootRef.current });
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runFind(event.shiftKey);
              }
            }}
            placeholder="Find in PDF"
            className="readxiv-pdfjs-find-input"
          />
          <button type="button" onClick={() => runFind(true)} className="readxiv-pdfjs-find-button">
            Prev
          </button>
          <button type="button" onClick={() => runFind(false)} className="readxiv-pdfjs-find-button">
            Next
          </button>
          <span className="readxiv-pdfjs-find-status">{findStatus}</span>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              setFindQuery('');
              setFindStatus('');
              eventBusRef.current?.dispatch('findbarclose', { source: rootRef.current });
            }}
            className="readxiv-pdfjs-find-button"
          >
            Close
          </button>
        </div>
      )}
      {loading && (
        <div className="readxiv-pdfjs-status">
          <div className="h-2 w-36 rounded skeleton-shimmer" />
          <span>Loading PDF...</span>
        </div>
      )}
      {error && <div className="readxiv-pdfjs-status text-red-300">{error}</div>}
      {highlightMode && !pendingHighlight && (
        <div className="readxiv-pdfjs-highlight-hint">Select text to highlight</div>
      )}
      {pendingHighlight && (
        <div
          className="readxiv-pdfjs-highlight-popover"
          style={{ left: `${pendingHighlight.x}px`, top: `${pendingHighlight.y}px` }}
        >
          <div className="readxiv-pdfjs-highlight-text">{pendingHighlight.text}</div>
          <textarea
            value={pendingHighlight.note}
            onChange={(event) => setPendingHighlight((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Annotation note"
            className="readxiv-pdfjs-highlight-note"
            rows={2}
          />
          <div className="readxiv-pdfjs-highlight-actions">
            {['yellow', 'green', 'blue', 'pink'].map((color) => (
              <button
                key={color}
                type="button"
                className={`readxiv-pdfjs-highlight-swatch ${pendingHighlight.color === color ? 'is-active' : ''}`}
                style={{ background: getHighlightColor(color) }}
                onClick={() => setPendingHighlight((prev) => ({ ...prev, color }))}
                aria-label={`${color} highlight`}
              />
            ))}
            <button type="button" onClick={() => savePendingHighlight()} className="readxiv-pdfjs-highlight-button">
              Save
            </button>
            <button type="button" onClick={() => savePendingHighlight({ insertQuote: true })} className="readxiv-pdfjs-highlight-button">
              Quote
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingHighlight(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="readxiv-pdfjs-highlight-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        tabIndex={0}
        data-pdf-scroll
        className="readxiv-pdfjs-container"
        onMouseUp={handleSelectionMouseUp}
      >
        <div ref={viewerRef} className="pdfViewer" />
      </div>
    </div>
  );
});

export default PdfViewer;
