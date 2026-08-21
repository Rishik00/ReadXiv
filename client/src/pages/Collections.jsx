import { useEffect, useState } from 'react'
import axios from 'axios'

export default function Collections({ onOpenCollection, addToast }) {
  const [collections, setCollections] = useState([])
  const [active, setActive] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const { data } = await axios.get('/api/collections')
    setCollections(Array.isArray(data) ? data : [])
  }

  useEffect(() => { refresh().catch(() => addToast?.('Could not load collections', 'error')).finally(() => setLoading(false)) }, [])

  const createCollection = async (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    try {
      const { data } = await axios.post('/api/collections', { name: value })
      setName('')
      await refresh()
      setActive({ ...data, papers: [] })
      addToast?.(`Created ${data.name}`, 'success')
    } catch (error) { addToast?.(error.response?.data?.error || 'Could not create collection', 'error') }
  }

  const openCollection = async (collection) => {
    try { setActive((current) => current?.id === collection.id ? current : { ...collection, papers: null }); const { data } = await axios.get(`/api/collections/${collection.id}`); setActive(data) }
    catch { addToast?.('Could not open collection', 'error') }
  }

  const deleteCollection = async (collection) => {
    if (!window.confirm(`Delete "${collection.name}"? Papers will stay in your library.`)) return
    try {
      await axios.delete(`/api/collections/${collection.id}`)
      if (active?.id === collection.id) setActive(null)
      await refresh()
      addToast?.(`Deleted ${collection.name}`, 'success')
    } catch { addToast?.('Could not delete collection', 'error') }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
        <div><h1 className="font-serif text-4xl text-foreground">Collections</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Keep papers together across labs, reading threads, and projects. A paper can live in more than one collection.</p></div>
        <button type="button" onClick={() => document.getElementById('create-collection-name')?.focus()} className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-[var(--button-on-secondary)]">Create collection</button>
      </header>
      <form onSubmit={createCollection} className="mb-8 flex max-w-md gap-2">
        <input id="create-collection-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Collection name" aria-label="New collection name" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-secondary" />
        <button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-[var(--button-on-secondary)]">Create</button>
      </form>
      <section className="grid gap-3 sm:grid-cols-2">{loading ? <p className="py-6 text-sm text-muted">Loading collections…</p> : collections.length ? collections.map((collection) => <button key={collection.id} type="button" onClick={() => onOpenCollection(collection)} className="rounded-lg border border-border bg-surface px-5 py-5 text-left transition-colors hover:border-secondary/50 hover:bg-surface/70"><div className="font-serif text-2xl text-foreground">{collection.name}</div>{collection.description && <p className="mt-2 text-sm leading-5 text-muted">{collection.description}</p>}<div className="mt-5 font-mono text-xs text-muted">{collection.paper_count} {Number(collection.paper_count) === 1 ? 'paper' : 'papers'} · open in Library →</div></button>) : <p className="py-8 text-sm text-muted">No collections yet. Create one for a lab, topic, or project.</p>}</section>
    </main>
  )
}
