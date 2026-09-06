import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Modal, ModalContent, ModalFooter, ModalHeader } from '../components/ui/modal'
import { PageHeader, PageShell } from '../components/ui/page-shell'
import { Textarea } from '../components/ui/textarea'

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
  const visibilityToggleRef = useRef(false)

  const refresh = async () => {
    const { data } = await axios.get('/api/collections')
    setCollections(Array.isArray(data) ? data : [])
  }

  useEffect(() => { refresh().catch(() => addToast?.('Could not load collections', 'error')).finally(() => setLoading(false)) }, [])
  useEffect(() => setSelectedIndex((value) => Math.max(0, Math.min(value, collections.length - 1))), [collections.length])
  useEffect(() => {
    if (!createOpen) return undefined
    const focusInput = requestAnimationFrame(() => createNameRef.current?.focus())
    return () => cancelAnimationFrame(focusInput)
  }, [createOpen])
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      if (createOpen || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || !collections.length) return
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') { event.preventDefault(); setSelectedIndex((value) => Math.min(value + 1, collections.length - 1)) }
      else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') { event.preventDefault(); setSelectedIndex((value) => Math.max(value - 1, 0)) }
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

  const toggleHiddenInLibrary = async (collection) => {
    if (!collection || visibilityToggleRef.current) return
    visibilityToggleRef.current = true
    try {
      const { data } = await axios.patch(`/api/collections/${collection.id}`, { hidden_in_library: !Number(collection.hidden_in_library) })
      setCollections((items) => items.map((item) => item.id === data.id ? { ...item, ...data } : item))
      addToast?.(Number(data.hidden_in_library) ? `${data.name} hidden from Library` : `${data.name} shown in Library`, 'success')
    } catch (error) { addToast?.(error.response?.data?.error || 'Could not update collection visibility', 'error') }
    finally { visibilityToggleRef.current = false }
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      if (event.repeat || createOpen || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable || !collections.length || event.key.toLowerCase() !== 'h') return
      event.preventDefault()
      toggleHiddenInLibrary(collections[selectedIndex])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [collections, createOpen, selectedIndex])

  return (
    <PageShell width="large">
      <PageHeader
        title="Collections"
        description="Keep papers together across labs, reading threads, and projects. A paper can belong to more than one collection."
        actions={<Button onClick={() => setCreateOpen(true)}>+ Create collection</Button>}
      />

      <Modal
        as="form"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={createCollection}
        aria-labelledby="create-collection-title"
        className="max-w-md"
      >
        <ModalHeader>
          <div className="font-code text-very-small text-text-muted">Collections</div>
          <h2 id="create-collection-title" className="mt-1 text-large font-semibold text-text">Create collection</h2>
          <p className="mt-1 text-small text-text-muted">Name the shelf. Add context only if it helps.</p>
        </ModalHeader>
        <ModalContent className="space-y-4">
          <Input
            ref={createNameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Collection name"
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="min-h-24"
          />
          <div>
            <div className="mb-2 text-small text-text-muted">Collection color</div>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Use ${item}`}
                  aria-pressed={color === item}
                  onClick={() => setColor(item)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${color === item ? 'scale-110 border-text' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: item }}
                />
              ))}
            </div>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button type="submit">Create collection</Button>
        </ModalFooter>
      </Modal>

      <section className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <p className="py-6 text-small text-text-muted">Loading collections…</p>
        ) : collections.length ? (
          collections.map((collection, index) => {
            const collectionColor = collection.color || COLLECTION_COLORS[index % COLLECTION_COLORS.length]
            return <button
              key={collection.id}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onFocus={() => setSelectedIndex(index)}
              onClick={() => onOpenCollection(collection)}
              className={`collection-card rounded-md bg-surface-1 px-5 py-5 text-left transition-colors ${selectedIndex === index ? 'is-selected' : ''}`}
              style={{ '--collection-color': collectionColor }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="collection-card-title font-display text-text">{collection.name}</div>
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: collectionColor }} />
              </div>
              {collection.description && <p className="mt-2 text-small text-text-muted">{collection.description}</p>}
              <div className="mt-5 font-code text-very-small text-text-muted">
                {collection.paper_count} {Number(collection.paper_count) === 1 ? 'paper' : 'papers'} · Enter to open · A to add
                {Number(collection.hidden_in_library) ? ' · Hidden in Library' : ''}
              </div>
            </button>
          })
        ) : (
          <p className="py-8 text-small text-text-muted">No collections yet. Create one for a lab, topic, or project.</p>
        )}
      </section>
    </PageShell>
  )
}
