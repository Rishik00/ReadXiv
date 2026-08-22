import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export const COLLECTION_COLORS = ['#e7645b', '#df9940', '#c9ad43', '#79a969', '#4b9d98', '#4e8dcb', '#776ac6', '#a065bd', '#cf6e99', '#9a785b']

export default function Collections({ onOpenCollection, onAddToCollection, addToast }) {
  const [collections, setCollections] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLLECTION_COLORS[0])
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const createNameRef = useRef(null)

  const refresh = async () => {
    const { data } = await axios.get('/api/collections')
    setCollections(Array.isArray(data) ? data : [])
  }

  useEffect(() => { refresh().catch(() => addToast?.('Could not load collections', 'error')).finally(() => setLoading(false)) }, [])
  useEffect(() => setSelectedIndex((value) => Math.max(0, Math.min(value, collections.length - 1))), [collections.length])
  useEffect(() => {
    if (!createOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setCreateOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    requestAnimationFrame(() => createNameRef.current?.focus())
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [createOpen])
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      if (createOpen || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || !collections.length) return
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'j') { event.preventDefault(); setSelectedIndex((value) => Math.min(value + 1, collections.length - 1)) }
      else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'k') { event.preventDefault(); setSelectedIndex((value) => Math.max(value - 1, 0)) }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((value) => Math.min(value + 2, collections.length - 1)) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((value) => Math.max(value - 2, 0)) }
      else if (event.key === 'Enter') { event.preventDefault(); onOpenCollection(collections[selectedIndex]) }
      else if (event.key.toLowerCase() === 'a') { event.preventDefault(); onAddToCollection(collections[selectedIndex]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [collections, createOpen, onAddToCollection, onOpenCollection, selectedIndex])

  const createCollection = async (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    try {
      const { data } = await axios.post('/api/collections', { name: value, description, color })
      setName(''); setDescription(''); setColor(COLLECTION_COLORS[0]); setCreateOpen(false)
      await refresh()
      addToast?.(`Created ${data.name}`, 'success')
    } catch (error) { addToast?.(error.response?.data?.error || 'Could not create collection', 'error') }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
        <div><h1 className="font-serif text-4xl text-foreground">Collections</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Keep papers together across labs, reading threads, and projects. A paper can belong to more than one collection.</p></div>
        <button type="button" onClick={() => setCreateOpen(true)} className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-[var(--button-on-secondary)]">Create collection</button>
      </header>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Arrow keys to choose · Enter to open in Library · A to add papers</p>
      {createOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" onMouseDown={() => setCreateOpen(false)}><form onSubmit={createCollection} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl"><div className="border-b border-border px-5 py-4"><div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Collections</div><h2 className="mt-1 text-lg font-semibold text-foreground">Create collection</h2><p className="mt-1 text-sm text-muted">Name the shelf. Add context only if it helps.</p></div><div className="space-y-4 p-5"><input ref={createNameRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name" className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-secondary" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-secondary" /><div><div className="mb-2 text-sm text-muted">Collection color</div><div className="flex flex-wrap gap-2">{COLLECTION_COLORS.map((item) => <button key={item} type="button" aria-label={`Use ${item}`} aria-pressed={color === item} onClick={() => setColor(item)} className={`h-7 w-7 rounded-full border-2 transition-transform ${color === item ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: item }} />)}</div></div></div><div className="flex justify-end gap-2 border-t border-border px-5 py-3"><button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-2 text-sm text-muted">Cancel</button><button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-[var(--button-on-secondary)]">Create collection</button></div></form></div>}
      <section className="grid gap-3 sm:grid-cols-2">{loading ? <p className="py-6 text-sm text-muted">Loading collections…</p> : collections.length ? collections.map((collection, index) => <button key={collection.id} type="button" onMouseEnter={() => setSelectedIndex(index)} onFocus={() => setSelectedIndex(index)} onClick={() => onOpenCollection(collection)} className={`rounded-lg border bg-surface px-5 py-5 text-left transition-colors ${selectedIndex === index ? 'border-secondary bg-secondary/5 ring-1 ring-secondary/25' : 'border-border hover:border-secondary/50 hover:bg-surface/70'}`} style={{ borderLeftWidth: '5px', borderLeftColor: collection.color || COLLECTION_COLORS[index % COLLECTION_COLORS.length] }}><div className="flex items-start justify-between gap-3"><div className="font-serif text-2xl text-foreground">{collection.name}</div><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: collection.color || COLLECTION_COLORS[index % COLLECTION_COLORS.length] }} /></div>{collection.description && <p className="mt-2 text-sm leading-5 text-muted">{collection.description}</p>}<div className="mt-5 font-mono text-xs text-muted">{collection.paper_count} {Number(collection.paper_count) === 1 ? 'paper' : 'papers'} · Enter to open · A to add</div></button>) : <p className="py-8 text-sm text-muted">No collections yet. Create one for a lab, topic, or project.</p>}</section>
    </main>
  )
}
