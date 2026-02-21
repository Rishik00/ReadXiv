import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';

GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PdfViewer({ paperId, continuousScroll = true }) {
  const pageCanvasRefs = useRef([]);
  const pageWrapperRefs = useRef([]);
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [draftHighlight, setDraftHighlight] = useState(null);

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

      try {
        task = getDocument(pdfUrl);
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
        setHighlights(
          data.map((h) => ({
            ...h,
            rect: h.rect || (h.rect_json ? JSON.parse(h.rect_json) : null),
          }))
        );
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
    async function renderPages() {
      if (!doc) return;

      const pages = continuousScroll ? Array.from({ length: numPages }, (_, i) => i + 1) : [page];
      const dpr = window.devicePixelRatio || 1;

      for (const pageNumber of pages) {
        const canvas = pageCanvasRefs.current[pageNumber - 1];
        if (!canvas) continue;

        const currentPage = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = currentPage.getViewport({ scale });
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        await currentPage.render({ canvasContext: context, viewport }).promise;
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, continuousScroll, numPages]);

  async function createHighlight(pageNumber, rect) {
    if (!paperId) return;
    try {
      const { data } = await axios.post(`/api/reader/${paperId}/highlights`, {
        page: pageNumber,
        rect,
        color: 'yellow',
      });
      setHighlights((prev) => [...prev, data]);
    } catch {
      // no-op
    }
  }

  function startDraw(event, pageNumber, wrapperElement) {
    if (!highlightMode) return;
    event.preventDefault();

    const rect = wrapperElement.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / rect.width;
    const startY = (event.clientY - rect.top) / rect.height;
    setDraftHighlight({
      page: pageNumber,
      startX,
      startY,
      x: startX,
      y: startY,
      w: 0,
      h: 0,
    });

    function onMove(moveEvent) {
      const curX = (moveEvent.clientX - rect.left) / rect.width;
      const curY = (moveEvent.clientY - rect.top) / rect.height;
      const x = Math.max(0, Math.min(startX, curX));
      const y = Math.max(0, Math.min(startY, curY));
      const w = Math.min(1, Math.abs(curX - startX));
      const h = Math.min(1, Math.abs(curY - startY));
      setDraftHighlight({
        page: pageNumber,
        startX,
        startY,
        x,
        y,
        w,
        h,
      });
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDraftHighlight((draft) => {
        if (draft && draft.page === pageNumber && draft.w > 0.01 && draft.h > 0.01) {
          createHighlight(pageNumber, { x: draft.x, y: draft.y, w: draft.w, h: draft.h });
        }
        return null;
      });
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function goToPage(nextPage) {
    const clamped = Math.max(1, Math.min(numPages, nextPage));
    setPage(clamped);
    if (continuousScroll) {
      const wrapper = pageWrapperRefs.current[clamped - 1];
      wrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
          onMouseDown={(e) => startDraw(e, pageNumber, pageWrapperRefs.current[pageNumber - 1])}
        />
        {pageHighlights.map((h) => (
          <div
            key={h.id}
            className="pointer-events-none absolute border-l-2 border-yellow-300 bg-yellow-300/20"
            style={{
              left: `${h.rect.x * 100}%`,
              top: `${h.rect.y * 100}%`,
              width: `${h.rect.w * 100}%`,
              height: `${h.rect.h * 100}%`,
            }}
          />
        ))}
        {draftHighlight && draftHighlight.page === pageNumber && (
          <div
            className="pointer-events-none absolute border-l-2 border-yellow-300 bg-yellow-300/20"
            style={{
              left: `${draftHighlight.x * 100}%`,
              top: `${draftHighlight.y * 100}%`,
              width: `${draftHighlight.w * 100}%`,
              height: `${draftHighlight.h * 100}%`,
            }}
          />
        )}
      </div>
    );
  }

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
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))))} disabled={!doc}>
            −
          </Button>
          <span className="text-xs text-muted font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.1).toFixed(2))))} disabled={!doc}>
            +
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-[calc(100%-53px)] overflow-auto bg-background">
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

