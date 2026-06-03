import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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

const SCALE_MIN = 0.5;
const SCALE_MAX = 4;
const SCALE_STEP = 1.12;
const VALID_ZOOM_PRESETS = new Set(['actual', 'page-width', 'page-fit', 'auto']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeZoomPreset(value) {
  return VALID_ZOOM_PRESETS.has(value) ? value : 'actual';
}

const PdfViewer = forwardRef(function PdfViewer(
  { paperId, paperTitle, continuousScroll = true, defaultZoom = 'actual', onSendToCanvas, onToolbarState },
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
  const eventBusRef = useRef(null);
  const findQueryRef = useRef('');
  const defaultZoomRef = useRef(normalizeZoomPreset(defaultZoom));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pdfDarkMode, setPdfDarkMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findStatus, setFindStatus] = useState('');

  const pdfUrl = useMemo(() => (paperId ? `/api/reader/${paperId}/pdf` : null), [paperId]);

  useEffect(() => {
    findQueryRef.current = findQuery;
  }, [findQuery]);

  useEffect(() => {
    defaultZoomRef.current = normalizeZoomPreset(defaultZoom);
  }, [defaultZoom]);

  useEffect(() => {
    const container = containerRef.current;
    const viewer = viewerRef.current;
    if (!container || !viewer || !pdfUrl) return undefined;

    let cancelled = false;
    const abortController = new AbortController();
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
    };
    const onPageChanging = ({ pageNumber }) => setPage(pageNumber);
    const onScaleChanging = ({ scale: nextScale }) => setScale(nextScale || pdfViewer.currentScale || 1);
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
    eventBus._on('updatefindcontrolstate', onFindState);
    eventBus._on('updatefindmatchescount', onFindState);

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

    return () => {
      cancelled = true;
      abortController.abort();
      eventBus._off?.('pagesinit', onPagesInit);
      eventBus._off?.('pagechanging', onPageChanging);
      eventBus._off?.('scalechanging', onScaleChanging);
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
  }, [pdfUrl, continuousScroll]);

  useEffect(() => {
    onToolbarState?.({
      scale,
      page,
      numPages,
      highlightMode: false,
      pdfDarkMode,
      highlightsCount: 0,
      docReady: Boolean(pdfDocumentRef.current && !loading && !error),
      loading,
      error: Boolean(error),
    });
  }, [scale, page, numPages, pdfDarkMode, loading, error, onToolbarState]);

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
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        onSendToCanvas?.({ page });
        captureAction('copy_pdf_page_to_clipboard', { route: 'reader', paperId, page });
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
      setFindOpen((value) => !value);
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
      className={`readxiv-pdfjs-root ${pdfDarkMode ? 'readxiv-pdfjs-dark' : ''}`}
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
      <div ref={containerRef} tabIndex={0} data-pdf-scroll className="readxiv-pdfjs-container">
        <div ref={viewerRef} className="pdfViewer" />
      </div>
    </div>
  );
});

export default PdfViewer;
