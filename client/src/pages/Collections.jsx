import { useEffect, useState } from 'react'
import axios from 'axios'

export default function Collections({ openPaper, setPage, addToast }) {
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
        <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Library index</p><h1 className="mt-2 font-serif text-4xl text-foreground">Collections</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Keep a paper in more than one working shelf: labs, reading threads, or projects.</p></div>
        <button type="button" onClick={() => setPage('home')} className="text-sm text-muted hover:text-foreground">← Home</button>
      </header>
      <form onSubmit={createCollection} className="mb-8 flex max-w-md gap-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New collection name" aria-label="New collection name" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-secondary" />
        <button className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-[var(--button-on-secondary)]">Create</button>
      </form>
      {active ? (
        <section><button type="button" onClick={() => setActive(null)} className="mb-5 text-sm text-muted hover:text-foreground">← All collections</button><div className="mb-4 flex items-baseline justify-between border-b border-border pb-4"><h2 className="font-serif text-3xl text-foreground">{active.name}</h2><span className="font-mono text-xs text-muted">{active.papers?.length ?? '…'} papers</span></div>{active.papers === null ? <p className="text-sm text-muted">Loading papers…</p> : active.papers?.length ? <div className="divide-y divide-border border-y border-border">{active.papers.map((paper) => <button key={paper.id} type="button" onClick={() => openPaper(paper)} className="block w-full px-1 py-4 text-left hover:bg-surface/40"><div className="text-base text-foreground">{paper.title || paper.id}</div><div className="mt-1 font-mono text-xs text-muted">{[paper.authors, paper.year].filter(Boolean).join(' · ') || paper.id}</div></button>)}</div> : <p className="text-sm text-muted">No papers here yet. Assign one from the Library toolbar with X.</p>}</section>
      ) : <section className="divide-y divide-border border-y border-border">{loading ? <p className="py-6 text-sm text-muted">Loading collections…</p> : collections.length ? collections.map((collection) => <div key={collection.id} className="flex items-center gap-4 px-1 py-5 hover:bg-surface/40"><button type="button" onClick={() => openCollection(collection)} className="min-w-0 flex-1 text-left"><span className="font-serif text-xl text-foreground">{collection.name}</span><span className="mt-1 block font-mono text-xs text-muted">{collection.paper_count} {Number(collection.paper_count) === 1 ? 'paper' : 'papers'} →</span></button><button type="button" onClick={() => deleteCollection(collection)} className="text-xs text-muted hover:text-red-400">Remove</button></div>) : <p className="py-8 text-sm text-muted">No collections yet. Create one for a lab, topic, or project.</p>}</section>}
    </main>
  )
}
