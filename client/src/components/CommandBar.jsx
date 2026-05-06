import { useEffect, useMemo, useRef, useState } from 'react';

const ARXIV_RE = /(?:arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i;

function cleanInput(value) {
  const trimmed = value.trimStart();
  if (trimmed.startsWith(':')) {
    return trimmed.slice(1);
  }
  return trimmed;
}

function commandMatches(command, query) {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return [command.label, command.id, ...(command.aliases || [])].some((value) =>
    value.toLowerCase().includes(q)
  );
}

function displayShortcut(shortcut) {
  return shortcut || '';
}

export default function CommandBar({
  open,
  currentPage,
  onClose,
  onSearch,
  onAddPaper,
  onNavigate,
  onRecent,
  onReaderAction,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const text = cleanInput(query);
  const arxivMatch = text.match(ARXIV_RE);
  const canAdd = Boolean(arxivMatch);

  const commands = useMemo(() => {
    const base = [
      { id: 'search', label: 'Open Search Palette', aliases: ['search', 'find', '/', 'p'], shortcut: 'Ctrl+P', run: () => onSearch?.() },
      { id: 'home', label: 'Open Home', aliases: ['home', 'start', 'h'], shortcut: 'Space h', run: () => onNavigate?.('home') },
      { id: 'shelf', label: 'Open Shelf', aliases: ['library', 'papers', 's'], shortcut: 'Space s', run: () => onNavigate?.('shelf') },
      { id: 'settings', label: 'Open Settings', aliases: ['preferences', 'config', 'c'], shortcut: 'Space c', run: () => onNavigate?.('settings') },
      { id: 'recent', label: 'Recent Papers', aliases: ['recents', 'history', 'f'], shortcut: 'Space f', run: () => onRecent?.() },
      ...(canAdd
        ? [{ id: 'add', label: `Add arXiv ${arxivMatch[1]}`, aliases: ['add', 'a'], shortcut: 'Enter', run: () => onAddPaper?.(text) }]
        : []),
    ];

    if (currentPage === 'reader') {
      base.push(
        { id: 'split', label: 'Reader: Split View', aliases: ['split', 'w'], shortcut: 'Space w', run: () => onReaderAction?.('split') },
        { id: 'pdf', label: 'Reader: PDF Only', aliases: ['pdf', 'q'], shortcut: 'Space q', run: () => onReaderAction?.('pdf') },
        { id: 'notes', label: 'Reader: Notes Only', aliases: ['notes', 'e'], shortcut: 'Space e', run: () => onReaderAction?.('notes') },
        { id: 'refs', label: 'Reader: References', aliases: ['references', 'refs', 'r'], shortcut: ': refs', run: () => onReaderAction?.('references') },
        { id: 'page', label: 'Reader: Jump to Page', aliases: ['page', 't'], shortcut: 'Space t', run: () => onReaderAction?.('page') },
        { id: 'toolbar', label: 'Reader: Toggle PDF Toolbar', aliases: ['toolbar', 'o'], shortcut: 'Space o', run: () => onReaderAction?.('toolbar') },
      );
    }
    return base;
  }, [arxivMatch, canAdd, currentPage, onAddPaper, onNavigate, onReaderAction, onRecent, onSearch, text]);

  const commandResults = useMemo(
    () => commands.filter((command) => commandMatches(command, text)),
    [commands, text]
  );

  const items = commandResults;

  useEffect(() => {
    if (!open) return;
    setQuery(':');
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  function move(delta) {
    if (items.length === 0) return;
    setActiveIndex((idx) => Math.max(0, Math.min(items.length - 1, idx + delta)));
  }

  function runItem(item = items[activeIndex]) {
    if (!item) return;
    item.run?.();
    onClose?.();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === 'ArrowDown' || (event.ctrlKey && event.key.toLowerCase() === 'n')) {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp' || (event.ctrlKey && event.key.toLowerCase() === 'p')) {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runItem();
    }
  }

  const placeholder = ': search, : shelf, : add 2501.12345, : refs';

  return (
    <div className="global-command-bar" onMouseDown={(event) => event.stopPropagation()}>
      <div className="global-command-input-row">
        <span className="global-command-prefix">:</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="global-command-input"
          autoComplete="off"
          spellCheck="false"
        />
        <kbd className="global-command-esc">Esc</kbd>
      </div>

      <div ref={listRef} className="global-command-results">
        {items.length === 0 ? (
          <div className="global-command-empty">
            No command found. Try :search, :shelf, :add 2501.12345
          </div>
        ) : (
          items.map((item, idx) => (
            <button
              key={`${item.type || 'cmd'}-${item.id}`}
              type="button"
              data-index={idx}
              className={`global-command-result ${idx === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => runItem(item)}
            >
              <span>{item.label}</span>
              <kbd>{displayShortcut(item.shortcut)}</kbd>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
