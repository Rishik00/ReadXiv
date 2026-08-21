import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

export default function CollectionAssignModal({ paper, onClose, onChanged, addToast }) {
  const [collections, setCollections] = useState([])
  const [assigned, setAssigned] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  const load = async () => {
    const [all, current] = await Promise.all([axios.get('/api/collections'), axios.get(`/api/collections/paper/${encodeURIComponent(paper.id)}`)])
    setCollections(Array.isArray(all.data) ? all.data : [])
    setAssigned(Array.isArray(current.data) ? current.data.map((item) => item.id) : [])
  }
  useEffect(() => { load().catch(() => addToast?.('Could not load collections', 'error')).finally(() => setLoading(false)); requestAnimationFrame(() => inputRef.current?.focus()); }, [paper.id])
  const visible = useMemo(() => collections.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [collections, query])
  useEffect(() => setSelected(0), [query])

  const assign = async (collection) => {
    if (!collection) return
    try {
      const exists = assigned.includes(collection.id)
      await axios({ method: exists ? 'delete' : 'put', url: `/api/collections/${collection.id}/papers/${encodeURIComponent(paper.id)}` })
      await load()
      onChanged?.()
      addToast?.(exists ? `Removed from ${collection.name}` : `Added to ${collection.name}`, 'success')
    } catch { addToast?.('Could not update collection', 'error') }
  }

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Assign paper to collection" className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="border-b border-border px-5 py-4"><div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Collections</div><h2 className="mt-1 text-lg font-semibold text-foreground">Assign “{paper.title || paper.id}”</h2><p className="mt-1 text-sm text-muted">Search a collection, then press Enter to add it.</p></header>
      <div className="p-5"><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); assign(visible[selected]) } if (event.key === 'ArrowDown') setSelected((value) => Math.min(value + 1, visible.length - 1)); if (event.key === 'ArrowUp') setSelected((value) => Math.max(value - 1, 0)); if (event.key === 'Escape') onClose() }} placeholder="Search collections" className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-secondary" />
      <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-border/70">{loading ? <p className="p-3 text-sm text-muted">Loading collections…</p> : visible.length ? visible.map((collection, index) => { const exists = assigned.includes(collection.id); return <button key={collection.id} type="button" onMouseEnter={() => setSelected(index)} onClick={() => assign(collection)} className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm ${index === selected ? 'bg-secondary/10' : 'hover:bg-background/70'}`}><span className="text-foreground">{collection.name}</span><span className={`font-mono text-xs ${exists ? 'text-secondary' : 'text-muted'}`}>{exists ? 'Added' : 'Add'}</span></button> }) : <p className="p-3 text-sm text-muted">No matching collection. Create one from Collections first.</p>}</div></div>
      <footer className="flex justify-end border-t border-border px-5 py-3"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:text-foreground">Close</button></footer>
    </section>
  </div>
}
