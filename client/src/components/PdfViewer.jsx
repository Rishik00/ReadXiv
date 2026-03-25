import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
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

const PdfViewer = forwardRef(function PdfViewer({ paperId, paperTitle, continuousScroll = true, onInsertQuote, onSendToCanvas }, ref) {
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
  const [pdfDarkMode, setPdfDarkMode] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [pageTextLayers, setPageTextLayers] = useState({});
  const [visiblePages, setVisiblePages] = useState(new Set([1]));
  const [fitMode, setFitMode] = useState('width');
  const renderTasksRef = useRef({});
  const intersectionObserverRef = useRef(null);
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
      setVisiblePages(new Set([1]));
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
        setLoading(false);
        
        if (loadedDoc.numPages > 1) {
          setTimeout(async () => {
            for (let i = 2; i <= Math.min(5, loadedDoc.numPages); i++) {
              if (!mounted) break;
              try {
                await loadedDoc.getPage(i);
              } catch {
                break;
              }
            }
          }, 100);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load PDF');
        setLoading(false);
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
        const availableHeight = container.clientHeight - 40;
        
        let fittedScale;
        if (fitMode === 'width') {
          fittedScale = clamp(availableWidth / Math.max(viewport.width, 1), 1.05, 2.2);
        } else if (fitMode === 'height') {
          fittedScale = clamp(availableHeight / Math.max(viewport.height, 1), 0.8, 2.2);
        } else {
          fittedScale = clamp(availableWidth / Math.max(viewport.width, 1), 1.05, 2.2);
        }
        setScale(Number(fittedScale.toFixed(2)));
      } catch {
        // no-op
      }
    }
    fitToContainer();
    return () => {
      cancelled = true;
    };
  }, [doc, fitMode]);

  useEffect(() => {
    if (!doc || !continuousScroll) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = new Set();
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.dataset.pageNumber, 10);
          if (entry.isIntersecting) {
            visible.add(pageNum);
            for (let i = Math.max(1, pageNum - 2); i <= Math.min(numPages, pageNum + 2); i++) {
              visible.add(i);
            }
          }
        });
        if (visible.size > 0) {
          setVisiblePages(visible);
          const firstVisible = Math.min(...visible);
          setPage(firstVisible);
        }
      },
      {
        root: contentRef.current,
        rootMargin: '400px 0px',
        threshold: 0.01,
      }
    );

    intersectionObserverRef.current = observer;

    pageWrapperRefs.current.forEach((wrapper) => {
      if (wrapper) observer.observe(wrapper);
    });

    return () => {
      observer.disconnect();
    };
  }, [doc, continuousScroll, numPages]);

  useEffect(() => {
    let cancelled = false;
    async function renderPages() {
      if (!doc) return;

      const pages = continuousScroll ? Array.from(visiblePages).sort((a, b) => a - b) : [page];
      const dpr = (window.devicePixelRatio || 1) * RENDER_QUALITY_MULTIPLIER;
      const renderedTextLayers = {};
      let failedPages = 0;
      let lastError = null;

      for (const pageNumber of pages) {
        const canvas = pageCanvasRefs.current[pageNumber - 1];
        if (!canvas) continue;

        if (renderTasksRef.current[pageNumber]) {
          renderTasksRef.current[pageNumber].cancel();
        }

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

          const renderTask = currentPage.render({
            canvasContext: context,
            viewport,
            annotationMode: AnnotationMode.DISABLE,
          });
          
          renderTasksRef.current[pageNumber] = renderTask;
          await renderTask.promise;
          delete renderTasksRef.current[pageNumber];

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
          if (err?.name === 'RenderingCancelledException') {
            continue;
          }
          failedPages += 1;
          lastError = err;
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
      Object.values(renderTasksRef.current).forEach((task) => {
        if (task?.cancel) task.cancel();
      });
    };
  }, [doc, page, scale, continuousScroll, numPages, visiblePages]);

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

  async function clearAllHighlights() {
    if (!paperId || highlights.length === 0) return;
    if (!window.confirm('Clear all highlights from this paper?')) return;
    try {
      await axios.delete(`/api/reader/${paperId}/highlights`);
      setHighlights([]);
    } catch {
      // no-op
    }
  }

  function exportHighlightsAsMarkdown() {
    if (highlights.length === 0) return;
    
    const sortedHighlights = [...highlights]
      .filter((h) => h.text?.trim())
      .sort((a, b) => Number(a.page) - Number(b.page));
    
    let markdown = '# Highlights\n\n';
    let currentPage = null;
    
    sortedHighlights.forEach((h) => {
      if (h.page !== currentPage) {
        currentPage = h.page;
        markdown += `\n## Page ${h.page}\n\n`;
      }
      markdown += `> ${h.text}\n\n`;
    });
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlights-${paperId || 'export'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyPageToClipboard() {
    if (!doc) return;
    
    try {
      const currentPage = await doc.getPage(page);
      const renderScale = 2;
      const viewport = currentPage.getViewport({ scale: renderScale });
      
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;
      const context = offscreenCanvas.getContext('2d');
      
      await currentPage.render({
        canvasContext: context,
        viewport,
        annotationMode: AnnotationMode.DISABLE,
      }).promise;
      
      offscreenCanvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          onSendToCanvas?.({ page });
        } catch (err) {
          console.error('Failed to copy to clipboard:', err);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to capture page:', err);
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

  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY > 0 ? -0.08 : 0.08;
      updateScale(scaleRef.current + step);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!doc || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const el = contentRef.current;
      if (!el) return;
      const active = document.activeElement;
      const pdfFocused = el.contains(active) || active?.contains?.(el);
      if (!pdfFocused) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollBy({ top: e.key === 'ArrowUp' ? -120 : 120, behavior: 'smooth' });
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [doc]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let touchStartDistance = 0;
    let touchStartScale = 1;
    let touchStartX = 0;
    let touchStartTime = 0;

    const getTouchDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDistance = getTouchDistance(e.touches);
        touchStartScale = scaleRef.current;
      } else if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const distance = getTouchDistance(e.touches);
        const scaleChange = distance / touchStartDistance;
        const newScale = touchStartScale * scaleChange;
        updateScale(newScale);
      }
    };

    const handleTouchEnd = (e) => {
      if (e.changedTouches.length === 1 && Date.now() - touchStartTime < 300) {
        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX;
        
        if (Math.abs(swipeDistance) > 100) {
          if (swipeDistance > 0) {
            goToPage(page - 1);
          } else {
            goToPage(page + 1);
          }
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [page]);

  function handleKeyDown(e) {
    if (!doc) return;

    const meta = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (e.key === 'j') {
      e.preventDefault();
      contentRef.current?.scrollBy({ top: 120, behavior: 'smooth' });
      return;
    }
    if (e.key === 'k') {
      e.preventDefault();
      contentRef.current?.scrollBy({ top: -120, behavior: 'smooth' });
      return;
    }
    if (e.key === 'g' && !shift) {
      e.preventDefault();
      const secondG = setTimeout(() => {}, 500);
      const handler = (e2) => {
        if (e2.key === 'g') {
          clearTimeout(secondG);
          goToPage(1);
          window.removeEventListener('keydown', handler);
        }
      };
      window.addEventListener('keydown', handler);
      setTimeout(() => window.removeEventListener('keydown', handler), 600);
      return;
    }
    if (e.key === 'G' && shift) {
      e.preventDefault();
      goToPage(numPages);
      return;
    }
    if (e.key === '[') {
      e.preventDefault();
      const sortedHighlights = [...highlights].sort((a, b) => Number(a.page) - Number(b.page));
      const prevHighlight = sortedHighlights.reverse().find((h) => Number(h.page) < page);
      if (prevHighlight) goToPage(Number(prevHighlight.page));
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      const sortedHighlights = [...highlights].sort((a, b) => Number(a.page) - Number(b.page));
      const nextHighlight = sortedHighlights.find((h) => Number(h.page) > page);
      if (nextHighlight) goToPage(Number(nextHighlight.page));
      return;
    }

    // Ctrl+Shift+S to copy current page to clipboard
    if (meta && shift && e.key.toLowerCase() === 's') {
      e.preventDefault();
      copyPageToClipboard();
      return;
    }

    if (meta && shift && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      updateScale(scaleRef.current + 0.1);
      return;
    }
    if (meta && shift && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      updateScale(scaleRef.current - 0.1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPage(page - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToPage(page + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      contentRef.current?.scrollBy({ top: -120, behavior: 'smooth' });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      contentRef.current?.scrollBy({ top: 120, behavior: 'smooth' });
      return;
    }
  }

  useImperativeHandle(ref, () => ({
    handleKeyDown,
    focusScrollArea: () => contentRef.current?.focus(),
    togglePdfDarkMode: () => setPdfDarkMode((v) => !v),
    jumpToPage: (pageNum) => goToPage(pageNum),
    getNumPages: () => numPages,
    getCurrentPage: () => page,
  }));

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

  /** Merge adjacent text items into larger spans for smoother selection. */
  function mergeTextItems(items, viewport) {
    if (!items?.length) return [];
    const groups = [];
    let current = null;

    for (const item of items) {
      if (!item?.str) continue;
      const tx = Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const left = tx[4];
      const top = tx[5] - fontHeight;
      const width = item.width != null ? Math.abs(tx[0]) * item.width : fontHeight * item.str.length * 0.5;
      const right = left + width;
      const angle = Math.atan2(tx[1], tx[0]);

      const sameLine = current && Math.abs(top - current.top) < fontHeight * 0.5;
      const closeHoriz = current && left - current.right < fontHeight * 1.2;

      if (current && sameLine && closeHoriz && Math.abs(angle - current.angle) < 0.01) {
        current.str += item.str;
        current.right = right;
      } else {
        current = { str: item.str, left, top, fontHeight, angle, right };
        groups.push(current);
      }
    }
    return groups;
  }

  function renderTextLayer(pageNumber) {
    const layer = pageTextLayers[pageNumber];
    if (!layer || !layer.viewport) return null;

    const merged = mergeTextItems(layer.items, layer.viewport);

    return (
      <div
        ref={(el) => {
          pageTextLayerRefs.current[pageNumber - 1] = el;
        }}
        className="absolute inset-0 z-20 pointer-events-auto select-text"
        onMouseUp={() => onTextLayerMouseUp(pageNumber)}
      >
        {merged.map((g, idx) => (
          <span
            key={`${pageNumber}-${idx}`}
            style={{
              position: 'absolute',
              left: `${g.left}px`,
              top: `${g.top}px`,
              fontSize: `${g.fontHeight}px`,
              transform: `rotate(${g.angle}rad)`,
              transformOrigin: '0 0',
              color: 'transparent',
              whiteSpace: 'pre',
              lineHeight: 1,
              cursor: 'text',
            }}
          >
            {g.str}
          </span>
        ))}
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
        data-page-number={pageNumber}
        className="relative mb-4 flex justify-center"
        role="article"
        aria-label={`Page ${pageNumber}`}
      >
        <div className={`relative ${pdfDarkMode ? 'pdf-canvas-container' : ''}`}>
          <canvas
            ref={(el) => {
              pageCanvasRefs.current[pageNumber - 1] = el;
            }}
            className="rounded-md border border-border"
            aria-label={`PDF page ${pageNumber} content`}
          />
          {renderTextLayer(pageNumber)}
          {pageHighlights.map((h) => (
            <div
              key={h.id}
              className={`absolute z-30 border-l-2 ${highlightMode ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} ${getHighlightClasses(h.color)}`}
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
      </div>
    );
  }

  const recentQuoteHighlights = highlights.filter((h) => h.text?.trim()).slice(-5).reverse();

  return (
    <Card className="h-full overflow-hidden" role="region" aria-label="PDF Viewer">
      <CardHeader className="flex items-center justify-between px-3 py-2" role="toolbar" aria-label="PDF controls">
        <div className="flex items-center gap-2">
          <Button
            variant={pdfDarkMode ? 'secondary' : 'ghost'}
            size="sm"
            className="text-sm h-7 px-2"
            onClick={() => setPdfDarkMode((v) => !v)}
            disabled={!doc}
            title="Toggle PDF dark mode"
          >
            Dark
          </Button>
          <Button
            variant={highlightMode ? 'secondary' : 'ghost'}
            size="sm"
            className="text-sm h-7 px-2"
            onClick={() => setHighlightMode((v) => !v)}
            disabled={!doc}
            title="Highlight mode"
          >
            ✦ Highlight
          </Button>
          {highlights.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="text-sm h-7 px-2" onClick={clearAllHighlights} disabled={!doc} title="Clear all highlights">
                Clear all
              </Button>
              <Button variant="ghost" size="sm" className="text-sm h-7 px-2" onClick={exportHighlightsAsMarkdown} disabled={!doc} title="Export highlights as markdown">
                Export
              </Button>
            </>
          )}
          <div className="h-4 w-px bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-sm h-7 px-2"
            onClick={copyPageToClipboard}
            disabled={!doc}
            title="Copy current page to clipboard"
          >
            Copy Page
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <Button variant="ghost" size="sm" className="text-sm h-7 px-2" onClick={() => updateScale(scale - 0.1)} disabled={!doc}>
            −
          </Button>
          <span className="text-sm text-muted font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" className="text-sm h-7 px-2" onClick={() => updateScale(scale + 0.1)} disabled={!doc}>
            +
          </Button>
        </div>
        <div className="flex items-center gap-3 mr-2">
          <Button variant="ghost" size="sm" className="text-sm h-7 px-2.5" onClick={() => goToPage(page - 1)} disabled={!doc || page <= 1}>
            ◀
          </Button>
          <span className="text-sm text-muted font-mono min-w-[4.5rem] text-center">
            {doc ? `${page} / ${numPages}` : '— / —'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-sm h-7 px-2.5"
            onClick={() => goToPage(page + 1)}
            disabled={!doc || page >= numPages}
          >
            ▶
          </Button>
        </div>
      </CardHeader>
      {highlightMode && (
        <div className="px-4 py-2 text-sm border-b border-border bg-surface/70">
          Select text to create a yellow highlight. Click an existing highlight to remove it.
        </div>
      )}
      {recentQuoteHighlights.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-border bg-surface/50">
          {recentQuoteHighlights.map((highlight) => (
            <button
              key={`quote-${highlight.id}`}
              type="button"
              className="max-w-[320px] text-left rounded-md border border-border px-2 py-1 text-sm hover:border-secondary/40 hover:bg-surface"
              onClick={() => onInsertQuote?.({ text: highlight.text, page: Number(highlight.page) })}
              title="Insert quote into notes"
            >
              <span className="text-secondary mr-1">Quote</span>
              <span className="text-muted line-clamp-1">{highlight.text}</span>
            </button>
          ))}
        </div>
      )}
      <CardContent
        ref={contentRef}
        tabIndex={0}
        data-pdf-scroll
        role="document"
        aria-label={`PDF document, page ${page} of ${numPages}`}
        className="h-[calc(100%-44px)] overflow-auto bg-background outline-none focus:ring-2 focus:ring-secondary/50"
        onKeyDown={handleKeyDown}
        onClick={() => contentRef.current?.focus()}
        onWheel={() => contentRef.current?.focus()}
        onScroll={() => contentRef.current?.focus()}
      >
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
});

export default PdfViewer;

