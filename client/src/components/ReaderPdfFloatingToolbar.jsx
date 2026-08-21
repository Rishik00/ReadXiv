import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const dropdownPanelClass =
  'absolute bottom-[calc(100%+10px)] left-1/2 z-[101] flex -translate-x-1/2 flex-col gap-0.5 rounded-xl border border-border bg-surface p-1.5 shadow-[0_10px_25px_rgba(0,0,0,0.5)] transition-all duration-200';

const dropdownOpenClass = 'pointer-events-auto translate-y-0 opacity-100';
const dropdownClosedClass = 'pointer-events-none translate-y-2 opacity-0';

function flattenOutline(items, depth = 0) {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenOutline(Array.isArray(item.items) ? item.items : [], depth + 1),
  ]);
}

/**
 * Bottom-left PDF toolbar. Space+T (reader) opens page jump. Parent hides via Space+o.
 */
const STATUS_OPTIONS = [
  { id: 'queued', label: 'Queued' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
  { id: 'done', label: 'Done' },
];

function statusColor(status) {
  if (status === 'reading') return 'var(--status-reading)';
  if (status === 'writing') return 'var(--status-writing)';
  if (status === 'done') return 'var(--status-done)';
  return 'var(--status-queued)';
}

export default function ReaderPdfFloatingToolbar({
  pdfViewerRef,
  pdfPanelRef,
  toolbarMetrics,
  viewMode,
  onSetView,
  pageInputFocusNonce = 0,
  documentOutline = [],
  noteTemplates = [],
  selectedNoteTemplate,
  onChangeNoteTemplate,
  status = 'queued',
  onChangeStatus,
}) {
  const [stripOpen, setStripOpen] = useState(true);
  const [mouseActive, setMouseActive] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const barRef = useRef(null);
  const pageInputRef = useRef(null);
  const idleTimerRef = useRef(null);

  const docReady = toolbarMetrics?.docReady;
  const scalePct = toolbarMetrics?.scale != null ? Math.round(toolbarMetrics.scale * 100) : null;
  const numPages = toolbarMetrics?.numPages ?? 0;
  const currentPage = toolbarMetrics?.page ?? 1;
  const highlightMode = Boolean(toolbarMetrics?.highlightMode);
  const highlightsCount = toolbarMetrics?.highlightsCount ?? 0;

  const run = useCallback(
    (method) => () => {
      pdfViewerRef.current?.[method]?.();
    },
    [pdfViewerRef]
  );

  useEffect(() => {
    const resetIdleTimer = () => {
      setMouseActive(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setMouseActive(false);
      }, 1800);
    };

    resetIdleTimer();
    window.addEventListener('mousemove', resetIdleTimer, { passive: true });
    window.addEventListener('mousedown', resetIdleTimer, { passive: true });
    window.addEventListener('wheel', resetIdleTimer, { passive: true });
    window.addEventListener('keydown', resetIdleTimer);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
      window.removeEventListener('wheel', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
    };
  }, []);

  useEffect(() => {
    if (!viewMenuOpen && !outlineOpen && !statusMenuOpen && !templateMenuOpen) return;
    const close = (e) => {
      if (barRef.current?.contains(e.target)) return;
      setViewMenuOpen(false);
      setOutlineOpen(false);
      setStatusMenuOpen(false);
      setTemplateMenuOpen(false);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [viewMenuOpen, outlineOpen, statusMenuOpen, templateMenuOpen]);

  useEffect(() => {
    if (pageInputFocusNonce < 1) return;
    setViewMenuOpen(false);
    setOutlineOpen(false);
    setTemplateMenuOpen(false);
    const id = requestAnimationFrame(() => pageInputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [pageInputFocusNonce]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const openViewMenu = () => {
    setOutlineOpen(false);
    setStatusMenuOpen(false);
    setTemplateMenuOpen(false);
    setViewMenuOpen((o) => !o);
  };

  const openOutlineMenu = () => {
    setViewMenuOpen(false);
    setStatusMenuOpen(false);
    setTemplateMenuOpen(false);
    setOutlineOpen((o) => !o);
  };

  const openStatusMenu = () => {
    setViewMenuOpen(false);
    setOutlineOpen(false);
    setTemplateMenuOpen(false);
    setStatusMenuOpen((o) => !o);
  };

  const openTemplateMenu = () => {
    setViewMenuOpen(false);
    setOutlineOpen(false);
    setStatusMenuOpen(false);
    setTemplateMenuOpen((open) => !open);
  };

  const submitPageInput = () => {
    const target = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(target) || target < 1 || target > numPages) {
      setPageInput(String(currentPage));
      return;
    }
    pdfViewerRef.current?.jumpToPage?.(target);
  };

  const viewLabel =
    viewMode === 'pdf' ? 'PDF' : viewMode === 'notes' ? 'Notes' : 'Split';
  const statusLabel = (STATUS_OPTIONS.find((s) => s.id === status) || STATUS_OPTIONS[0]).label;
  const outlineItems = flattenOutline(documentOutline);
  const templateLabel = (noteTemplates.find((template) => template.id === selectedNoteTemplate)?.label) || 'Custom';

  const toolIconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[20px] border border-border bg-background text-foreground transition-colors hover:bg-border disabled:opacity-40';

  const bar = (
    <div
      ref={barRef}
      className={`reader-pdf-toolbar-m8 pointer-events-auto flex items-center gap-2 sm:gap-3 ${stripOpen ? 'reader-pdf-toolbar-m8-expanded' : ''} ${!stripOpen && !mouseActive ? 'reader-pdf-toolbar-m8-idle' : ''}`}
      onMouseEnter={() => setMouseActive(true)}
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

      <div className="reader-pdf-toolbar-m8-panel flex max-w-[min(100vw-5rem,60rem)] flex-wrap items-center gap-1.5 rounded-[30px] border border-border bg-surface px-2 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] sm:gap-2 sm:px-3">
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
              { id: 'pdf', label: 'PDF Only', hint: 'Space 1' },
              { id: 'split', label: 'Split View', hint: 'Space 2' },
              { id: 'notes', label: 'Notes Only', hint: 'Space 3' },
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

        {onChangeStatus && (
          <>
            <div className="relative">
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-[20px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-border sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${statusMenuOpen ? 'ring-1 ring-secondary/40' : ''}`}
                onClick={openStatusMenu}
                title="Set status"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: statusColor(status) }}
                  aria-hidden
                />
                <span className="max-w-[4.5rem] truncate sm:max-w-none">{statusLabel}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 sm:w-[14px] sm:h-[14px]">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <div className={`${dropdownPanelClass} min-w-[10rem] ${statusMenuOpen ? dropdownOpenClass : dropdownClosedClass}`}>
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors hover:bg-border sm:gap-3 sm:px-3 sm:text-sm ${
                      status === opt.id ? 'bg-secondary/10 text-secondary' : 'text-foreground'
                    }`}
                    onClick={() => {
                      setStatusMenuOpen(false);
                      onChangeStatus(opt.id);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: statusColor(opt.id) }}
                        aria-hidden
                      />
                      {opt.label}
                    </span>
                    {opt.id === 'done' && <span className="text-[10px] text-muted sm:text-[11px]">& close</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
          </>
        )}

        <div
          className="flex cursor-text items-center rounded-[20px] border border-border bg-background font-mono text-[11px] text-foreground sm:text-sm"
          onMouseDown={(event) => {
            if (event.target === pageInputRef.current) return;
            event.preventDefault();
            pageInputRef.current?.focus({ preventScroll: true });
          }}
        >
          <input
            ref={pageInputRef}
            type="text"
            inputMode="numeric"
            aria-label="Page number"
            title="Go to page (Space + T)"
            disabled={!docReady || !numPages}
            value={docReady && numPages ? pageInput : '—'}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitPageInput();
                pageInputRef.current?.blur();
              }
              if (e.key === 'Escape') {
                setPageInput(String(currentPage));
                pageInputRef.current?.blur();
              }
            }}
            onBlur={() => setPageInput(String(currentPage))}
            className="w-10 rounded-l-[20px] bg-transparent py-1.5 pl-2.5 text-right tabular-nums outline-none disabled:opacity-40 sm:w-12 sm:px-3 sm:py-2"
          />
          <span className="pr-2.5 text-muted tabular-nums sm:pr-3">/ {numPages || '—'}</span>
        </div>

        {outlineItems.length > 0 && (
          <div className="relative">
            <button
              type="button"
              className={`flex h-9 items-center gap-1.5 rounded-[20px] border border-border bg-background px-3 font-mono text-[11px] text-foreground transition-colors hover:bg-border sm:text-sm ${outlineOpen ? 'ring-1 ring-secondary/50 text-secondary' : ''}`}
              onClick={openOutlineMenu}
              title="Document outline"
              aria-label="Toggle document outline"
              aria-expanded={outlineOpen}
            >
              <span>Outline</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className={`${dropdownPanelClass} max-h-[min(70vh,34rem)] w-[min(88vw,24rem)] overflow-y-auto !p-2 ${outlineOpen ? dropdownOpenClass : dropdownClosedClass}`}>
              {outlineItems.map((item, index) => (
                <button
                  key={`${item.title || 'section'}-${index}`}
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-border"
                  style={{ paddingLeft: `${12 + item.depth * 16}px` }}
                  onClick={() => {
                    pdfViewerRef.current?.jumpToDestination?.(item.dest);
                    setOutlineOpen(false);
                  }}
                >
                  {item.title || 'Untitled section'}
                </button>
              ))}
            </div>
          </div>
        )}

        {onChangeNoteTemplate && (
          <div className="relative">
            <button
              type="button"
              className={`flex h-9 max-w-40 items-center gap-1.5 rounded-[20px] border border-border bg-background px-3 font-mono text-[11px] text-foreground transition-colors hover:bg-border sm:max-w-48 sm:text-sm ${templateMenuOpen ? 'ring-1 ring-secondary/40' : ''}`}
              onClick={openTemplateMenu}
              aria-label="Choose note template"
              aria-expanded={templateMenuOpen}
              title="Choose note template"
            >
              <span className="truncate">{templateLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className={`${dropdownPanelClass} min-w-[12rem] ${templateMenuOpen ? dropdownOpenClass : dropdownClosedClass}`}>
              {selectedNoteTemplate === 'custom' && <span className="px-3 py-2 font-mono text-xs text-muted">Custom notes</span>}
              {noteTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-border sm:text-sm ${template.id === selectedNoteTemplate ? 'bg-secondary/10 text-secondary' : 'text-foreground'}`}
                  onClick={() => {
                    onChangeNoteTemplate(template.id);
                    setTemplateMenuOpen(false);
                  }}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        )}

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
          className={`${toolIconBtn} ${highlightMode ? 'ring-1 ring-secondary/50 text-secondary' : ''}`}
          onClick={run('toggleHighlightMode')}
          disabled={!docReady}
          title={highlightMode ? 'Highlight mode on' : 'Highlight text'}
          aria-label="Highlight text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 11-6 6v4h4l6-6" />
            <path d="m22 12-8.5-8.5a2.1 2.1 0 0 0-3 0l-2 2a2.1 2.1 0 0 0 0 3L17 17" />
            <path d="M7 17h8" />
          </svg>
          {highlightsCount > 0 && (
            <span className="sr-only">{highlightsCount} saved highlights</span>
          )}
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
