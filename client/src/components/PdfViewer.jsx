import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, AnnotationMode, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';

GlobalWorkerOptions.workerSrc = pdfWorker;

const COLOR_CLASSES = {
  yellow: 'border-amber-400/80 bg-amber-300/25',
};

const SCALE_MIN = 0.6;
const SCALE_MAX = 3.2;
const RENDER_QUALITY_MULTIPLIER = 1.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeClientRect(rect, containerRect) {
  const x = (rect.left - containerRect.left) / containerRect.width;
  const y = (rect.top - containerRect.top) / containerRect.height;
  const w = rect.width / containerRect.width;
  const h = rect.height / containerRect.height;

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    w: clamp(w, 0, 1),
    h: clamp(h, 0, 1),
  };
}

function normalizeHighlight(highlight) {
  const rect = highlight.rect || (highlight.rect_json ? JSON.parse(highlight.rect_json) : null);
  return {
    ...highlight,
    rect,
    color: highlight.color || 'yellow',
  };
}

export default function PdfViewer({ paperId, continuousScroll = true, onInsertQuote }) {
  const pageCanvasRefs = useRef([]);
  const pageWrapperRefs = useRef([]);
  const pageTextLayerRefs = useRef([]);
  const contentRef = useRef(null);
  const userAdjustedScaleRef = useRef(false);
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [pageTextLayers, setPageTextLayers] = useState({});

  const pdfUrl = useMemo(() => (paperId ? `/api/reader/${paperId}/pdf` : null), [paperId]);

  useEffect(() => {
    let mounted = true;
    let task;

    async function loadPdf() {
      if (!pdfUrl) return;
      setLoading(true);
      setError(null);
      setDoc(null);
      setPage(1);
      setPageTextLayers({});
      userAdjustedScaleRef.current = false;

      try {
        task = getDocument({
          url: pdfUrl,
          stopAtErrors: false,
        });
        const loadedDoc = await task.promise;
        if (!mounted) return;
        setDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load PDF');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPdf();
    return () => {
      mounted = false;
      if (task?.destroy) task.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    let active = true;
    async function fetchHighlights() {
      if (!paperId) return;
      try {
        const { data } = await axios.get(`/api/reader/${paperId}/highlights`);
        if (!active) return;
        setHighlights(data.map(normalizeHighlight));
      } catch {
        setHighlights([]);
      }
    }
    fetchHighlights();
    return () => {
      active = false;
    };
  }, [paperId]);

  useEffect(() => {
    let cancelled = false;
    async function fitToContainer() {
      if (!doc || userAdjustedScaleRef.current) return;
      const container = contentRef.current;
      if (!container) return;
      try {
        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        const viewport = firstPage.getViewport({ scale: 1 });
        const availableWidth = Math.max(container.clientWidth - 40, 480);
        const fittedScale = clamp(availableWidth / Math.max(viewport.width, 1), 1.05, 2.2);
        setScale(Number(fittedScale.toFixed(2)));
      } catch {
        // no-op
      }
    }
    fitToContainer();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    async function renderPages() {
      if (!doc) return;

      const pages = continuousScroll ? Array.from({ length: numPages }, (_, i) => i + 1) : [page];
      const dpr = (window.devicePixelRatio || 1) * RENDER_QUALITY_MULTIPLIER;
      const renderedTextLayers = {};
      let failedPages = 0;
      let lastError = null;

      for (const pageNumber of pages) {
        const canvas = pageCanvasRefs.current[pageNumber - 1];
        if (!canvas) continue;

        try {
          const currentPage = await doc.getPage(pageNumber);
          if (cancelled) return;

          const viewport = currentPage.getViewport({ scale });
          const context = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          context.setTransform(dpr, 0, 0, dpr, 0, 0);

          await currentPage.render({
            canvasContext: context,
            viewport,
            annotationMode: AnnotationMode.DISABLE,
          }).promise;

          const textContent = await currentPage.getTextContent();
          renderedTextLayers[pageNumber] = {
            viewport: {
              width: viewport.width,
              height: viewport.height,
              transform: viewport.transform,
            },
            items: textContent.items,
          };
        } catch (err) {
          failedPages += 1;
          lastError = err;
          // Continue rendering the rest of the document even if one page fails.
        }
      }

      if (!cancelled) {
        setPageTextLayers((prev) => ({ ...prev, ...renderedTextLayers }));
        if (failedPages > 0 && failedPages === pages.length) {
          setError(lastError?.message || 'Failed to render PDF');
        } else if (failedPages === 0) {
          setError(null);
        }
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, continuousScroll, numPages]);

  async function createHighlight({ pageNumber, rect, text }) {
    if (!paperId) return;
    try {
      const { data } = await axios.post(`/api/reader/${paperId}/highlights`, {
        page: pageNumber,
        rect,
        text,
        color: 'yellow',
      });
      const normalized = normalizeHighlight(data);
      setHighlights((prev) => [...prev, normalized]);
    } catch {
      // no-op
    }
  }

  async function deleteHighlight(highlightId) {
    if (!paperId || !highlightId) return;
    try {
      await axios.delete(`/api/reader/${paperId}/highlights/${highlightId}`);
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    } catch {
      // no-op
    }
  }

  async function onTextLayerMouseUp(pageNumber) {
    if (!highlightMode) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const wrapper = pageWrapperRefs.current[pageNumber - 1];
    const textLayer = pageTextLayerRefs.current[pageNumber - 1];
    if (!wrapper || !textLayer || !textLayer.contains(range.commonAncestorContainer)) return;

    const selectedText = selection.toString().trim().replace(/\s+/g, ' ');
    if (!selectedText) return;

    const rangeRect = range.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const rect = normalizeClientRect(rangeRect, wrapperRect);
    if (rect.w < 0.003 || rect.h < 0.003) return;

    await createHighlight({
      pageNumber,
      rect,
      text: selectedText,
    });
    selection.removeAllRanges();
  }

  function updateScale(nextScale) {
    userAdjustedScaleRef.current = true;
    setScale(clamp(Number(nextScale.toFixed(2)), SCALE_MIN, SCALE_MAX));
  }

  function handleWheelZoom(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const step = event.deltaY > 0 ? -0.08 : 0.08;
    updateScale(scale + step);
  }

  function goToPage(nextPage) {
    const clamped = Math.max(1, Math.min(numPages, nextPage));
    setPage(clamped);
    if (continuousScroll) {
      const wrapper = pageWrapperRefs.current[clamped - 1];
      wrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function getHighlightClasses(color) {
    return COLOR_CLASSES[color] || COLOR_CLASSES.yellow;
  }

  function renderTextLayer(pageNumber) {
    const layer = pageTextLayers[pageNumber];
    if (!layer || !layer.viewport) return null;

    return (
      <div
        ref={(el) => {
          pageTextLayerRefs.current[pageNumber - 1] = el;
        }}
        className={`absolute inset-0 z-20 ${highlightMode ? 'pointer-events-auto select-text' : 'pointer-events-none select-none'}`}
        onMouseUp={() => onTextLayerMouseUp(pageNumber)}
      >
        {layer.items.map((item, idx) => {
          if (!item?.str) return null;
          const tx = Util.transform(layer.viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          const angle = Math.atan2(tx[1], tx[0]);
          return (
            <span
              key={`${pageNumber}-${idx}`}
              style={{
                position: 'absolute',
                left: `${tx[4]}px`,
                top: `${tx[5] - fontHeight}px`,
                fontSize: `${fontHeight}px`,
                transform: `rotate(${angle}rad)`,
                transformOrigin: '0 0',
                color: 'transparent',
                whiteSpace: 'pre',
                lineHeight: 1,
                cursor: highlightMode ? 'text' : 'default',
              }}
            >
              {item.str}
            </span>
          );
        })}
      </div>
    );
  }

  function renderPageCanvas(pageNumber) {
    const pageHighlights = highlights.filter((h) => Number(h.page) === Number(pageNumber) && h.rect);
    return (
      <div
        key={pageNumber}
        ref={(el) => {
          pageWrapperRefs.current[pageNumber - 1] = el;
        }}
        className={`relative mb-4 flex justify-center ${highlightMode ? 'select-none' : ''}`}
      >
        <canvas
          ref={(el) => {
            pageCanvasRefs.current[pageNumber - 1] = el;
          }}
          className="rounded-md border border-border"
        />
        {renderTextLayer(pageNumber)}
        {pageHighlights.map((h) => (
          <div
            key={h.id}
            className={`absolute border-l-2 ${highlightMode ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${getHighlightClasses(h.color)}`}
            title={highlightMode ? 'Click to remove highlight' : (h.text || 'Highlighted text')}
            onClick={() => {
              if (!highlightMode) return;
              deleteHighlight(h.id);
            }}
            style={{
              left: `${h.rect.x * 100}%`,
              top: `${h.rect.y * 100}%`,
              width: `${h.rect.w * 100}%`,
              height: `${h.rect.h * 100}%`,
            }}
          />
        ))}
      </div>
    );
  }

  const recentQuoteHighlights = highlights.filter((h) => h.text?.trim()).slice(-5).reverse();

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => goToPage(page - 1)} disabled={!doc || page <= 1}>
            ◀
          </Button>
          <span className="text-xs text-muted font-mono">
            {doc ? `${page} / ${numPages}` : '— / —'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(page + 1)}
            disabled={!doc || page >= numPages}
          >
            ▶
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={highlightMode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setHighlightMode((v) => !v)}
            disabled={!doc}
          >
            ✦ Highlight
          </Button>
          <Button variant="ghost" size="sm" onClick={() => updateScale(scale - 0.1)} disabled={!doc}>
            −
          </Button>
          <span className="text-xs text-muted font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => updateScale(scale + 0.1)} disabled={!doc}>
            +
          </Button>
        </div>
      </CardHeader>
      {highlightMode && (
        <div className="px-4 py-2 text-xs border-y border-border bg-surface/70">
          Select text to create a yellow highlight. Click an existing highlight to remove it.
        </div>
      )}
      {recentQuoteHighlights.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-border bg-surface/50">
          {recentQuoteHighlights.map((highlight) => (
            <button
              key={`quote-${highlight.id}`}
              type="button"
              className="max-w-[320px] text-left rounded-md border border-border px-2 py-1 text-xs hover:border-secondary/40 hover:bg-surface"
              onClick={() => onInsertQuote?.({ text: highlight.text, page: Number(highlight.page) })}
              title="Insert quote into notes"
            >
              <span className="text-secondary mr-1">Quote</span>
              <span className="text-muted line-clamp-1">{highlight.text}</span>
            </button>
          ))}
        </div>
      )}
      <CardContent ref={contentRef} onWheel={handleWheelZoom} className="h-[calc(100%-53px)] overflow-auto bg-background">
        {loading && <div className="text-sm text-muted mt-8">Loading PDF…</div>}
        {error && <div className="text-sm text-red-400 mt-8">{error}</div>}
        {!loading &&
          !error &&
          (continuousScroll ? (
            <div className="px-2 pt-2">{Array.from({ length: numPages }, (_, i) => renderPageCanvas(i + 1))}</div>
          ) : (
            <div className="flex justify-center items-start pt-2">{renderPageCanvas(page)}</div>
          ))}
      </CardContent>
    </Card>
  );
}

