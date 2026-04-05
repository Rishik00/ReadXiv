import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const dropdownPanelClass =
  'absolute bottom-[calc(100%+10px)] left-1/2 z-[101] flex -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.5)] transition-all duration-200';

const dropdownOpenClass = 'pointer-events-auto translate-y-0 opacity-100';
const dropdownClosedClass = 'pointer-events-none translate-y-2 opacity-0';

/**
 * Bottom-left PDF toolbar. Space+T (reader) opens page jump. Parent hides via Space+o.
 */
export default function ReaderPdfFloatingToolbar({
  pdfViewerRef,
  pdfPanelRef,
  toolbarMetrics,
  viewMode,
  onSetView,
  pageJumpMenuNonce = 0,
}) {
  const [stripOpen, setStripOpen] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const [pageJumpQuery, setPageJumpQuery] = useState('');
  const barRef = useRef(null);
  const pageJumpInputRef = useRef(null);
  const [panelBox, setPanelBox] = useState({ w: 0, h: 0 });

  const docReady = toolbarMetrics?.docReady;
  const scalePct = toolbarMetrics?.scale != null ? Math.round(toolbarMetrics.scale * 100) : null;
  const numPages = toolbarMetrics?.numPages ?? 0;
  const currentPage = toolbarMetrics?.page ?? 1;

  const run = useCallback(
    (method) => () => {
      pdfViewerRef.current?.[method]?.();
    },
    [pdfViewerRef]
  );

  useEffect(() => {
    const el = pdfPanelRef?.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPanelBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfPanelRef]);

  useEffect(() => {
    if (!viewMenuOpen && !pageJumpOpen) return;
    const close = (e) => {
      if (barRef.current?.contains(e.target)) return;
      setViewMenuOpen(false);
      setPageJumpOpen(false);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [viewMenuOpen, pageJumpOpen]);

  /** Space + T: close/reopen so focus + query reset even if the menu was already open. */
  useEffect(() => {
    if (pageJumpMenuNonce < 1) return;
    setViewMenuOpen(false);
    setPageJumpOpen(false);
    const t = setTimeout(() => setPageJumpOpen(true), 0);
    return () => clearTimeout(t);
  }, [pageJumpMenuNonce]);

  useEffect(() => {
    if (!pageJumpOpen) return;
    setPageJumpQuery('');
    const id = requestAnimationFrame(() => {
      pageJumpInputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [pageJumpOpen]);

  const filteredPages = useMemo(() => {
    if (!numPages || numPages < 1) return [];
    const q = pageJumpQuery.trim();
    if (!q) return [];
    const out = [];
    for (let p = 1; p <= numPages; p++) {
      if (String(p).includes(q)) out.push(p);
      if (out.length >= 200) break;
    }
    return out;
  }, [numPages, pageJumpQuery]);

  /** Large panel (~3× earlier half-panel caps); up to ~90% of PDF area, generous viewport fallbacks. */
  const jumpMaxStyle = useMemo(() => {
    const h = panelBox.h > 60 ? Math.floor(panelBox.h * 0.9) : 0;
    const w = panelBox.w > 60 ? Math.floor(panelBox.w * 0.9) : 0;
    return {
      maxHeight: h ? `${h}px` : 'min(85vh, 840px)',
      maxWidth: w ? `${w}px` : 'min(80vw, 780px)',
    };
  }, [panelBox.h, panelBox.w]);

  const goToFilteredPage = useCallback(
    (p) => {
      pdfViewerRef.current?.jumpToPage?.(p);
      setPageJumpOpen(false);
      setPageJumpQuery('');
    },
    [pdfViewerRef]
  );

  const onPageJumpKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPageJumpOpen(false);
        setPageJumpQuery('');
        return;
      }
      if (e.key === 'Enter') {
        const q = pageJumpQuery.trim();
        const n = parseInt(q, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= numPages) {
          e.preventDefault();
          goToFilteredPage(n);
          return;
        }
        if (filteredPages.length === 1) {
          e.preventDefault();
          goToFilteredPage(filteredPages[0]);
        }
      }
    },
    [pageJumpQuery, numPages, filteredPages, goToFilteredPage]
  );

  const openViewMenu = () => {
    setPageJumpOpen(false);
    setViewMenuOpen((o) => !o);
  };

  const openPageJumpMenu = () => {
    setViewMenuOpen(false);
    setPageJumpOpen((o) => !o);
  };

  const viewLabel =
    viewMode === 'pdf' ? 'PDF' : viewMode === 'notes' ? 'Notes' : 'Split';

  const toolIconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[20px] border border-border bg-background text-foreground transition-colors hover:bg-border disabled:opacity-40';

  const bar = (
    <div
      ref={barRef}
      className={`reader-pdf-toolbar-m8 pointer-events-auto flex items-center gap-2 sm:gap-3 ${stripOpen ? 'reader-pdf-toolbar-m8-expanded' : ''}`}
    >
      <button
        type="button"
        className="reader-pdf-toolbar-m8-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-colors hover:bg-surface/90"
        title={stripOpen ? 'Collapse toolbar' : 'Expand toolbar'}
        aria-expanded={stripOpen}
        onClick={() => setStripOpen((v) => !v)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: stripOpen ? 'rotate(180deg)' : 'none' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div className="reader-pdf-toolbar-m8-panel flex max-w-[min(100vw-5rem,36rem)] flex-wrap items-center gap-1.5 rounded-[30px] border border-border bg-surface px-2 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] sm:gap-2 sm:px-3">
        <div className="flex items-center rounded-[20px] border border-border bg-background p-0.5">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-base text-foreground transition-colors hover:bg-border disabled:opacity-40"
            onClick={run('zoomOut')}
            disabled={!docReady}
            title="Zoom out"
          >
            −
          </button>
          <span className="w-9 text-center font-mono text-[11px] text-muted tabular-nums sm:w-11 sm:text-[13px]">
            {scalePct != null ? `${scalePct}%` : '—'}
          </span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-base text-foreground transition-colors hover:bg-border disabled:opacity-40"
            onClick={run('zoomIn')}
            disabled={!docReady}
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="h-5 w-px shrink-0 bg-border" aria-hidden />

        <div className="relative">
          <button
            type="button"
            className={`flex items-center gap-1 rounded-[20px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-border sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${viewMenuOpen ? 'ring-1 ring-secondary/40' : ''}`}
            onClick={openViewMenu}
          >
            <span className="max-w-[4.5rem] truncate sm:max-w-none">{viewLabel}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 sm:w-[14px] sm:h-[14px]">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div
            className={`${dropdownPanelClass} min-w-[10rem] ${viewMenuOpen ? dropdownOpenClass : dropdownClosedClass}`}
          >
            {[
              { id: 'pdf', label: 'PDF Only', hint: 'Space q' },
              { id: 'split', label: 'Split View', hint: 'Space w' },
              { id: 'notes', label: 'Notes Only', hint: 'Space e' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors hover:bg-border sm:gap-3 sm:px-3 sm:text-sm ${
                  viewMode === opt.id ? 'bg-secondary/10 text-secondary' : 'text-foreground'
                }`}
                onClick={() => {
                  onSetView(opt.id);
                  setViewMenuOpen(false);
                }}
              >
                <span>{opt.label}</span>
                <span className="text-[10px] text-muted sm:text-[11px]">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={!docReady || !numPages}
            className={`flex items-center gap-1 rounded-[20px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-border disabled:opacity-40 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${pageJumpOpen ? 'ring-1 ring-secondary/40' : ''}`}
            onClick={openPageJumpMenu}
            title="Go to page (Space + T)"
          >
            <span className="tabular-nums">
              {docReady && numPages ? `${currentPage}/${numPages}` : '—'}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 sm:w-[14px] sm:h-[14px]">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <div
            className={`${dropdownPanelClass} grid min-h-0 min-w-[min(90vw,22rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden !p-2 sm:min-w-[min(90vw,28rem)] sm:!p-3 ${pageJumpOpen ? dropdownOpenClass : dropdownClosedClass}`}
            style={jumpMaxStyle}
          >
            <div className="shrink-0 border-b border-border/60 px-1 pb-2">
              <h3 className="mb-2 font-serif text-base font-semibold text-foreground sm:text-lg">Search for page</h3>
              <input
                ref={pageJumpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Type digits to filter (e.g. 12 for 12, 112…)"
                value={pageJumpQuery}
                onChange={(e) => setPageJumpQuery(e.target.value)}
                onKeyDown={onPageJumpKeyDown}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted/60 focus:border-secondary/50 focus:outline-none sm:px-4 sm:py-3 sm:text-base"
              />
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-0.5 pt-2">
              {!docReady || !numPages ? (
                <p className="px-2 py-3 text-sm text-muted">No document</p>
              ) : !pageJumpQuery.trim() ? null : filteredPages.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted">No matching pages</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filteredPages.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-3 py-2.5 text-left font-mono text-sm transition-colors hover:bg-border sm:px-4 sm:py-3 sm:text-base ${
                          p === currentPage ? 'bg-secondary/15 text-secondary' : 'text-foreground'
                        }`}
                        onClick={() => goToFilteredPage(p)}
                      >
                        Page {p}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="h-5 w-px shrink-0 bg-border" aria-hidden />

        <button
          type="button"
          className={toolIconBtn}
          onClick={run('togglePdfDarkMode')}
          disabled={!docReady}
          title="PDF dark mode"
          aria-label="Toggle PDF dark mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>
        <button
          type="button"
          className={toolIconBtn}
          onClick={run('toggleHighlightMode')}
          disabled={!docReady}
          title="Highlight mode"
          aria-label="Toggle highlight mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 11 3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </button>
        <button
          type="button"
          className={toolIconBtn}
          onClick={run('copyPageToClipboard')}
          disabled={!docReady}
          title="Copy page"
          aria-label="Copy page to clipboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="pointer-events-none fixed bottom-10 left-5 z-[100] max-w-[calc(100vw-2.5rem)]">{bar}</div>,
    document.body
  );
}
