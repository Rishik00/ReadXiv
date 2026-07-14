import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

function useBackup() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/backup/status')
      setStatus(data)
    } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const runBackup = async () => {
    setErr(null); setMsg(null); setLoading(true)
    try {
      await axios.post('/api/backup')
      setMsg('Backup saved.')
      await refresh()
    } catch (e) {
      setErr(e.response?.data?.error || e.message)
    } finally { setLoading(false) }
  }

  const saveInterval = async (days) => {
    setErr(null); setMsg(null)
    try {
      await axios.patch('/api/backup/settings', { intervalDays: Number(days) })
      await refresh()
    } catch (e) {
      setErr(e.response?.data?.error || e.message)
    }
  }

  return { status, loading, msg, err, runBackup, saveInterval }
}

export default function Settings({ settings, setSettings, setPage, addToast }) {
  const backup = useBackup()
  const [todoistMeta, setTodoistMeta] = useState(null)
  const [todoistToken, setTodoistToken] = useState('')
  const [todoistProjectId, setTodoistProjectId] = useState('')
  const [todoistProjects, setTodoistProjects] = useState([])
  const [todoistLoading, setTodoistLoading] = useState(false)
  const [todoistMsg, setTodoistMsg] = useState(null)
  const [todoistErr, setTodoistErr] = useState(null)

  const [s2Meta, setS2Meta] = useState(null)
  const [s2ApiKey, setS2ApiKey] = useState('')
  const [s2Loading, setS2Loading] = useState(false)
  const [s2Msg, setS2Msg] = useState(null)
  const [s2Err, setS2Err] = useState(null)

  const refreshTodoist = useCallback(async () => {
    const { data } = await axios.get('/api/todoist/settings')
    setTodoistMeta(data)
    setTodoistProjectId(data.fileProjectId || '')
    if (data.ready) {
      try {
        const pr = await axios.get('/api/todoist/projects')
        setTodoistProjects(pr.data.projects || [])
      } catch {
        setTodoistProjects([])
      }
    } else {
      setTodoistProjects([])
    }
    return data
  }, [])

  const refreshSemanticScholar = useCallback(async () => {
    const { data } = await axios.get('/api/semantic-scholar/settings')
    setS2Meta(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshTodoist()
      } catch (e) {
        if (!cancelled) {
          setTodoistErr(e.response?.data?.error || e.message)
        }
      }
      try {
        await refreshSemanticScholar()
      } catch (e) {
        if (!cancelled) {
          setS2Err(e.response?.data?.error || e.message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshTodoist, refreshSemanticScholar])

  const previewProjects = async () => {
    if (!todoistToken.trim()) {
      setTodoistErr('Paste your Todoist API token first, then fetch projects.')
      return
    }
    setTodoistErr(null)
    setTodoistMsg(null)
    setTodoistLoading(true)
    try {
      const { data } = await axios.post('/api/todoist/projects-preview', {
        apiToken: todoistToken.trim(),
      })
      setTodoistProjects(data.projects || [])
      setTodoistMsg('Project list updated. Choose one and click Save.')
    } catch (e) {
      setTodoistErr(e.response?.data?.error || e.message)
    } finally {
      setTodoistLoading(false)
    }
  }

  const saveTodoist = async () => {
    setTodoistErr(null)
    setTodoistMsg(null)
    setTodoistLoading(true)
    try {
      const payload = {
        projectId: todoistProjectId === '' ? null : todoistProjectId,
      }
      if (todoistToken.trim()) {
        payload.apiToken = todoistToken.trim()
      }
      await axios.post('/api/todoist/settings', payload)
      setTodoistToken('')
      setTodoistMsg('Saved.')
      await refreshTodoist()
    } catch (e) {
      setTodoistErr(e.response?.data?.error || e.message)
    } finally {
      setTodoistLoading(false)
    }
  }

  const removeTodoistToken = async () => {
    if (!window.confirm('Remove the saved Todoist token from this computer?')) return
    setTodoistErr(null)
    setTodoistMsg(null)
    setTodoistLoading(true)
    try {
      await axios.post('/api/todoist/settings', { clearToken: true })
      setTodoistToken('')
      setTodoistMsg('Saved token removed from config.')
      await refreshTodoist()
    } catch (e) {
      setTodoistErr(e.response?.data?.error || e.message)
    } finally {
      setTodoistLoading(false)
    }
  }

  const saveSemanticScholar = async () => {
    setS2Err(null)
    setS2Msg(null)
    setS2Loading(true)
    try {
      await axios.post('/api/semantic-scholar/settings', {
        apiKey: s2ApiKey.trim(),
      })
      setS2ApiKey('')
      setS2Msg('Saved.')
      await refreshSemanticScholar()
    } catch (e) {
      setS2Err(e.response?.data?.error || e.message)
    } finally {
      setS2Loading(false)
    }
  }

  const removeSemanticScholarKey = async () => {
    if (!window.confirm('Remove the saved Semantic Scholar API key from this computer?')) return
    setS2Err(null)
    setS2Msg(null)
    setS2Loading(true)
    try {
      await axios.post('/api/semantic-scholar/settings', { clearApiKey: true })
      setS2ApiKey('')
      setS2Msg('Saved key removed from config.')
      await refreshSemanticScholar()
    } catch (e) {
      setS2Err(e.response?.data?.error || e.message)
    } finally {
      setS2Loading(false)
    }
  }

  const ensureReadxivProject = async () => {
    setTodoistErr(null)
    setTodoistMsg(null)
    setTodoistLoading(true)
    try {
      const { data } = await axios.post('/api/todoist/ensure-readxiv-project')
      setTodoistProjectId(data.projectId)
      setTodoistMsg(
        data.created
          ? 'Created the “ReadXiv Todoist” project and selected it.'
          : 'Selected your existing “ReadXiv Todoist” project.'
      )
      await refreshTodoist()
    } catch (e) {
      setTodoistErr(e.response?.data?.error || e.message)
    } finally {
      setTodoistLoading(false)
    }
  }

  const themes = [
    { id: 'mist', name: 'Mist — sage gray' },
    { id: 'plum', name: 'Plum — violet' },
    { id: 'periwinkle', name: 'Periwinkle — ink & blue' },
    { id: 'lichen', name: 'Lichen — gray & sage' },
    { id: 'cinder', name: 'Cinder — graphite & mauve' },
    { id: 'monochrome', name: 'Black & White' },
    { id: 'blue', name: 'Black & Blue' },
    { id: 'noir', name: 'Noir' },
    { id: 'olive', name: 'Olive' },
  ]

  const layouts = [
    { id: 'list', name: 'List View' },
    { id: 'split', name: 'Split View' },
  ]

  const pdfZoomOptions = [
    { id: 'actual', name: '100% (Actual size)' },
    { id: 'page-width', name: 'Page width' },
    { id: 'page-fit', name: 'Page fit' },
    { id: 'auto', name: 'Auto' },
  ]

  const readerViewOptions = [
    { id: 'split', name: 'Split view' },
    { id: 'pdf', name: 'PDF only' },
    { id: 'notes', name: 'Notes only' },
  ]

  return (
    <div className="mx-auto max-w-[800px] p-12 font-sans">
      <h1 className="mb-2 text-4xl font-serif text-foreground">Settings</h1>
      <p className="mb-10 text-sm text-muted">Tune your note-taking experience.</p>

      <div className="claude-card p-8 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-1">Backup</h2>
        <p className="text-sm text-muted mb-6">
          Saves a copy of <code className="text-xs font-mono px-1 rounded bg-surface border border-border">papyrus.db</code> to{' '}
          <code className="text-xs font-mono px-1 rounded bg-surface border border-border">~/.papyrus/backups/</code>.
          Up to 20 backups are kept; oldest are rotated out automatically.
        </p>

        <div className="space-y-5">
          <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
            <div>
              <div className="text-sm font-semibold text-foreground">Auto-backup interval</div>
              <div className="text-sm text-muted mt-1">
                {backup.status?.lastBackupAt
                  ? `Last backup: ${new Date(backup.status.lastBackupAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : 'No backup yet'}
                {backup.status?.backupCount > 0 && ` · ${backup.status.backupCount} saved`}
              </div>
            </div>
            <select
              value={backup.status?.intervalDays ?? 7}
              onChange={(e) => backup.saveInterval(e.target.value)}
              className="w-40 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
              style={{
                backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='292.4' height='292.4'%3E%3Cpath fill='%23737373' d='M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem top 50%',
                backgroundSize: '0.5rem auto',
              }}
            >
              <option value={0}>Never</option>
              <option value={3}>Every 3 days</option>
              <option value={7}>Every week</option>
              <option value={14}>Every 2 weeks</option>
              <option value={30}>Every month</option>
            </select>
          </div>

          <div className="flex gap-3 items-center">
            <button
              type="button"
              onClick={backup.runBackup}
              disabled={backup.loading}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-secondary text-[var(--button-on-secondary)] hover:opacity-90 disabled:opacity-60"
            >
              {backup.loading ? 'Backing up…' : 'Back up now'}
            </button>
            {backup.status?.backupCount > 0 && (
              <span className="text-xs text-muted font-mono">{backup.status.backupsDir}</span>
            )}
          </div>

          {backup.msg && <p className="text-sm text-secondary">{backup.msg}</p>}
          {backup.err && <p className="text-sm text-red-400">{backup.err}</p>}
        </div>
      </div>

      <div className="claude-card p-8 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-1">Todoist</h2>
        <p className="text-sm text-muted mb-6">
          Add papers from search as tasks. Your API token is stored only in{' '}
          <code className="text-xs font-mono px-1 rounded bg-surface border border-border">
            ~/.papyrus/config.json
          </code>{' '}
          on this machine (never in the browser profile). Get a token from Todoist → Settings → Integrations.
        </p>

        {todoistMeta?.envOverridesToken && (
          <div className="mb-4 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-foreground">
            <span className="font-semibold">Environment variable active:</span>{' '}
            <code className="font-mono text-xs">TODOIST_API_TOKEN</code> overrides the saved token. Clear it to use the
            token from this form.
          </div>
        )}
        {todoistMeta?.envOverridesProject && (
          <div className="mb-4 rounded-lg border border-border bg-foreground/[0.03] px-4 py-3 text-sm text-muted">
            <code className="font-mono text-xs">TODOIST_PROJECT_ID</code> overrides the saved project for new tasks.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
              API token
            </label>
            <input
              type="password"
              autoComplete="off"
              value={todoistToken}
              onChange={(e) => setTodoistToken(e.target.value)}
              placeholder={todoistMeta?.hasFileToken ? '•••••••• (saved — type to replace)' : 'Paste token once'}
              disabled={!!todoistMeta?.envOverridesToken}
              className="w-full max-w-xl bg-background border-2 border-border rounded-lg px-3 py-2.5 text-sm font-mono disabled:opacity-60"
            />
            {todoistMeta?.hasFileToken && !todoistMeta?.envOverridesToken && (
              <button
                type="button"
                onClick={removeTodoistToken}
                disabled={todoistLoading}
                className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-60"
              >
                Remove saved token
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={previewProjects}
              disabled={todoistLoading || !!todoistMeta?.envOverridesToken || !todoistToken.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface hover:border-secondary/50 disabled:opacity-50"
            >
              Fetch projects (token field)
            </button>
            <button
              type="button"
              onClick={() => refreshTodoist()}
              disabled={todoistLoading || !todoistMeta?.ready}
              className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface hover:border-secondary/50 disabled:opacity-50"
            >
              Reload project list
            </button>
            <button
              type="button"
              onClick={ensureReadxivProject}
              disabled={todoistLoading || !todoistMeta?.ready}
              className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface hover:border-secondary/50 disabled:opacity-50"
              title="Creates a project named “ReadXiv Todoist” if needed"
            >
              Create / use “ReadXiv Todoist”
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
              Default project for new tasks
            </label>
            <select
              value={todoistProjectId}
              onChange={(e) => setTodoistProjectId(e.target.value)}
              className="w-full max-w-xl pl-3 pr-8 py-2.5 text-sm rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem top 50%',
                backgroundSize: '0.5rem auto',
              }}
            >
              <option value="">Todoist Inbox</option>
              {todoistProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={saveTodoist}
              disabled={todoistLoading}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-secondary text-[var(--button-on-secondary)] hover:opacity-90 disabled:opacity-60"
            >
              Save Todoist settings
            </button>
          </div>

          {todoistMsg && <p className="text-sm text-secondary">{todoistMsg}</p>}
          {todoistErr && <p className="text-sm text-red-400">{todoistErr}</p>}
        </div>
      </div>

      <div className="claude-card p-8 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-1">Semantic Scholar</h2>
        <p className="text-sm text-muted mb-6">
          Optional API key for the Reader → <span className="text-foreground">References</span> tab (higher rate
          limits on Semantic Scholar&apos;s Graph API). Without a key, references may still load, but can hit limits
          faster. The key is stored only in{' '}
          <code className="text-xs font-mono px-1 rounded bg-surface border border-border">
            ~/.papyrus/config.json
          </code>{' '}
          on this machine. Request a key from{' '}
          <a
            href="https://www.semanticscholar.org/product/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-secondary hover:underline"
          >
            semanticscholar.org/product/api
          </a>
          .
        </p>

        {s2Meta?.envOverridesKey && (
          <div className="mb-4 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-foreground">
            <span className="font-semibold">Environment variable active:</span>{' '}
            <code className="font-mono text-xs">SEMANTIC_SCHOLAR_API_KEY</code> overrides the saved key. Unset it to
            use the key from this form.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">API key</label>
            <input
              type="password"
              autoComplete="off"
              value={s2ApiKey}
              onChange={(e) => setS2ApiKey(e.target.value)}
              placeholder={s2Meta?.hasFileKey ? '•••••••• (saved — type to replace)' : 'Paste key (optional)'}
              disabled={!!s2Meta?.envOverridesKey}
              className="w-full max-w-xl bg-background border-2 border-border rounded-lg px-3 py-2.5 text-sm font-mono disabled:opacity-60"
            />
            {s2Meta?.hasFileKey && !s2Meta?.envOverridesKey && (
              <button
                type="button"
                onClick={removeSemanticScholarKey}
                disabled={s2Loading}
                className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-60"
              >
                Remove saved key
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={saveSemanticScholar}
              disabled={s2Loading || !!s2Meta?.envOverridesKey || !s2ApiKey.trim()}
              className="px-5 py-2.5 text-sm font-medium rounded-lg bg-secondary text-[var(--button-on-secondary)] hover:opacity-90 disabled:opacity-60"
            >
              Save Semantic Scholar key
            </button>
          </div>

          {s2Msg && <p className="text-sm text-secondary">{s2Msg}</p>}
          {s2Err && <p className="text-sm text-red-400">{s2Err}</p>}
        </div>
      </div>

      <div className="claude-card p-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Color scheme</div>
                <div className="text-sm text-muted mt-1">Those who use light mode need help</div>
              </div>
              <select
                value={settings.theme || 'mist'}
                onChange={(e) => setSettings((prev) => ({ ...prev, theme: e.target.value }))}
                className="w-40 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem top 50%',
                  backgroundSize: '0.5rem auto',
                }}
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-6 bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Notes font</div>
                <div className="text-sm text-muted mt-1">Typeface used while writing and reading notes</div>
              </div>
              <select
                aria-label="Notes font"
                value={settings.notesFontFamily || 'current'}
                onChange={(event) => {
                  setSettings((prev) => ({ ...prev, notesFontFamily: event.target.value }))
                  addToast?.('font changed', 'success')
                }}
                className="w-52 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="current">Current (default)</option>
                <option value="source-sans-3">Source Sans 3</option>
                <option value="atkinson-hyperlegible">Atkinson Hyperlegible</option>
              </select>
            </div>

            <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Home page layout</div>
                <div className="text-sm text-muted mt-1">Choose how search results are displayed</div>
              </div>
              <select
                value={settings.homeLayout || 'list'}
                onChange={(e) => setSettings((prev) => ({ ...prev, homeLayout: e.target.value }))}
                className="w-40 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem top 50%',
                  backgroundSize: '0.5rem auto',
                }}
              >
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Default PDF zoom</div>
                <div className="text-sm text-muted mt-1">Controls the initial PDF scale and Ctrl+0 reset</div>
              </div>
              <select
                value={settings.defaultPdfZoom || 'actual'}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultPdfZoom: e.target.value }))}
                className="w-44 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem top 50%',
                  backgroundSize: '0.5rem auto',
                }}
              >
                {pdfZoomOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Default reader view</div>
                <div className="text-sm text-muted mt-1">How each paper opens when you enter the reader</div>
              </div>
              <select
                value={settings.defaultReaderView || 'split'}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultReaderView: e.target.value }))}
                className="w-40 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
                style={{
                  backgroundImage:
                    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem top 50%',
                  backgroundSize: '0.5rem auto',
                }}
              >
                {readerViewOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all cursor-pointer group">
              <div>
                <div className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors">
                  Continuous PDF scrolling
                </div>
                <div className="text-sm text-muted mt-1">Scroll through pages as one document</div>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5 accent-secondary cursor-pointer"
                checked={settings.continuousScroll}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, continuousScroll: e.target.checked }))
                }
              />
            </label>

          </div>
        </div>
      </div>
    </div>
  )
}
