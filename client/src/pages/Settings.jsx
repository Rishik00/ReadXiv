import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { PageHeader, PageShell } from '../components/ui/page-shell'
import { Select } from '../components/ui/select'
import { SettingRow } from '../components/ui/setting-row'

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
    { id: 'monochrome', name: 'Black & White' },
    { id: 'umber', name: 'Umber — warm brown' },
    { id: 'olive', name: 'Olive' },
  ]

  const fonts = [
    { id: 'dm-sans', name: 'DM Sans' },
    { id: 'fraunces', name: 'Fraunces' },
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
    <PageShell width="medium">
      <PageHeader title="Settings" description="Tune your note-taking experience." />

      <Card className="mb-8 p-8">
        <h2 className="text-large font-semibold text-foreground mb-1">Backup</h2>
        <p className="text-small text-muted mb-6">
          Saves a copy of <code className="text-very-small font-mono px-1 rounded bg-surface border border-border">papyrus.db</code> to{' '}
          <code className="text-very-small font-mono px-1 rounded bg-surface border border-border">~/.papyrus/backups/</code>.
          Up to 20 backups are kept; oldest are rotated out automatically.
        </p>

        <div className="space-y-5">
          <SettingRow
            title="Auto-backup interval"
            description={
              <>
                {backup.status?.lastBackupAt
                  ? `Last backup: ${new Date(backup.status.lastBackupAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : 'No backup yet'}
                {backup.status?.backupCount > 0 && ` · ${backup.status.backupCount} saved`}
              </>
            }
          >
            <Select
              value={backup.status?.intervalDays ?? 7}
              onChange={(e) => backup.saveInterval(e.target.value)}
              variant="strong"
              className="w-40 shrink-0"
            >
              <option value={0}>Never</option>
              <option value={3}>Every 3 days</option>
              <option value={7}>Every week</option>
              <option value={14}>Every 2 weeks</option>
              <option value={30}>Every month</option>
            </Select>
          </SettingRow>

          <div className="flex gap-3 items-center">
            <Button
              size="large"
              onClick={backup.runBackup}
              disabled={backup.loading}
            >
              {backup.loading ? 'Backing up…' : 'Back up now'}
            </Button>
            {backup.status?.backupCount > 0 && (
              <span className="text-very-small text-muted font-mono">{backup.status.backupsDir}</span>
            )}
          </div>

          {backup.msg && <p className="text-small text-secondary">{backup.msg}</p>}
          {backup.err && <p className="text-small text-red-400">{backup.err}</p>}
        </div>
      </Card>

      <Card className="mb-8 p-8">
        <h2 className="text-large font-semibold text-foreground mb-1">Todoist</h2>
        <p className="text-small text-muted mb-6">
          Add papers from search as tasks. Your API token is stored only in{' '}
          <code className="text-very-small font-mono px-1 rounded bg-surface border border-border">
            ~/.papyrus/config.json
          </code>{' '}
          on this machine (never in the browser profile). Get a token from Todoist → Settings → Integrations.
        </p>

        {todoistMeta?.envOverridesToken && (
          <div className="mb-4 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-small text-foreground">
            <span className="font-semibold">Environment variable active:</span>{' '}
            <code className="font-mono text-very-small">TODOIST_API_TOKEN</code> overrides the saved token. Clear it to use the
            token from this form.
          </div>
        )}
        {todoistMeta?.envOverridesProject && (
          <div className="mb-4 rounded-lg border border-border bg-foreground/[0.03] px-4 py-3 text-small text-muted">
            <code className="font-mono text-very-small">TODOIST_PROJECT_ID</code> overrides the saved project for new tasks.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-very-small font-medium text-muted uppercase tracking-wide mb-2">
              API token
            </label>
            <Input
              type="password"
              autoComplete="off"
              value={todoistToken}
              onChange={(e) => setTodoistToken(e.target.value)}
              placeholder={todoistMeta?.hasFileToken ? '•••••••• (saved — type to replace)' : 'Paste token once'}
              disabled={!!todoistMeta?.envOverridesToken}
              variant="strong"
              className="max-w-xl font-code"
            />
            {todoistMeta?.hasFileToken && !todoistMeta?.envOverridesToken && (
              <Button
                variant="destructive"
                size="link"
                onClick={removeTodoistToken}
                disabled={todoistLoading}
                className="mt-2"
              >
                Remove saved token
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="secondaryStrong"
              onClick={previewProjects}
              disabled={todoistLoading || !!todoistMeta?.envOverridesToken || !todoistToken.trim()}
            >
              Fetch projects (token field)
            </Button>
            <Button
              variant="secondaryStrong"
              onClick={() => refreshTodoist()}
              disabled={todoistLoading || !todoistMeta?.ready}
            >
              Reload project list
            </Button>
            <Button
              variant="secondaryStrong"
              onClick={ensureReadxivProject}
              disabled={todoistLoading || !todoistMeta?.ready}
              title="Creates a project named “ReadXiv Todoist” if needed"
            >
              Create / use “ReadXiv Todoist”
            </Button>
          </div>

          <div>
            <label className="block text-very-small font-medium text-muted uppercase tracking-wide mb-2">
              Default project for new tasks
            </label>
            <Select
              value={todoistProjectId}
              onChange={(e) => setTodoistProjectId(e.target.value)}
              variant="strongComfortable"
              className="w-full max-w-xl"
            >
              <option value="">Todoist Inbox</option>
              {todoistProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              size="large"
              onClick={saveTodoist}
              disabled={todoistLoading}
            >
              Save Todoist settings
            </Button>
          </div>

          {todoistMsg && <p className="text-small text-secondary">{todoistMsg}</p>}
          {todoistErr && <p className="text-small text-red-400">{todoistErr}</p>}
        </div>
      </Card>

      <Card className="mb-8 p-8">
        <h2 className="text-large font-semibold text-foreground mb-1">Semantic Scholar</h2>
        <p className="text-small text-muted mb-6">
          Optional API key for the Reader → <span className="text-foreground">References</span> tab (higher rate
          limits on Semantic Scholar&apos;s Graph API). Without a key, references may still load, but can hit limits
          faster. The key is stored only in{' '}
          <code className="text-very-small font-mono px-1 rounded bg-surface border border-border">
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
          <div className="mb-4 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-small text-foreground">
            <span className="font-semibold">Environment variable active:</span>{' '}
            <code className="font-mono text-very-small">SEMANTIC_SCHOLAR_API_KEY</code> overrides the saved key. Unset it to
            use the key from this form.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-very-small font-medium text-muted uppercase tracking-wide mb-2">API key</label>
            <Input
              type="password"
              autoComplete="off"
              value={s2ApiKey}
              onChange={(e) => setS2ApiKey(e.target.value)}
              placeholder={s2Meta?.hasFileKey ? '•••••••• (saved — type to replace)' : 'Paste key (optional)'}
              disabled={!!s2Meta?.envOverridesKey}
              variant="strong"
              className="max-w-xl font-code"
            />
            {s2Meta?.hasFileKey && !s2Meta?.envOverridesKey && (
              <Button
                variant="destructive"
                size="link"
                onClick={removeSemanticScholarKey}
                disabled={s2Loading}
                className="mt-2"
              >
                Remove saved key
              </Button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              size="large"
              onClick={saveSemanticScholar}
              disabled={s2Loading || !!s2Meta?.envOverridesKey || !s2ApiKey.trim()}
            >
              Save Semantic Scholar key
            </Button>
          </div>

          {s2Msg && <p className="text-small text-secondary">{s2Msg}</p>}
          {s2Err && <p className="text-small text-red-400">{s2Err}</p>}
        </div>
      </Card>

      <Card className="p-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <SettingRow title="Color scheme" description="Those who use light mode need help">
              <Select
                value={settings.theme || 'monochrome'}
                onChange={(e) => setSettings((prev) => ({ ...prev, theme: e.target.value }))}
                variant="strong"
                className="w-40 shrink-0"
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow title="Global font" description="Typeface used across the application">
              <Select
                aria-label="Global font"
                value={settings.fontFamily || 'dm-sans'}
                onChange={(event) => {
                  setSettings((prev) => ({ ...prev, fontFamily: event.target.value }))
                  addToast?.('Global font changed', 'success')
                }}
                variant="strong"
                className="w-52 shrink-0"
              >
                {fonts.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow title="Notes font" description="Typeface used while writing and reading notes">
              <Select
                aria-label="Notes font"
                value={settings.notesFontFamily || 'current'}
                onChange={(event) => {
                  setSettings((prev) => ({ ...prev, notesFontFamily: event.target.value }))
                  addToast?.('font changed', 'success')
                }}
                variant="strong"
                className="w-52 shrink-0"
              >
                <option value="current">Current (default)</option>
                <option value="source-sans-3">Source Sans 3</option>
                <option value="atkinson-hyperlegible">Atkinson Hyperlegible</option>
              </Select>
            </SettingRow>

            <SettingRow title="Home page layout" description="Choose how search results are displayed">
              <Select
                value={settings.homeLayout || 'list'}
                onChange={(e) => setSettings((prev) => ({ ...prev, homeLayout: e.target.value }))}
                variant="strong"
                className="w-40 shrink-0"
              >
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow title="Default PDF zoom" description="Controls the initial PDF scale and Ctrl+0 reset">
              <Select
                value={settings.defaultPdfZoom || 'actual'}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultPdfZoom: e.target.value }))}
                variant="strong"
                className="w-44 shrink-0"
              >
                {pdfZoomOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow title="Default reader view" description="How each paper opens when you enter the reader">
              <Select
                value={settings.defaultReaderView || 'split'}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultReaderView: e.target.value }))}
                variant="strong"
                className="w-40 shrink-0"
              >
                {readerViewOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </SettingRow>

            <SettingRow
              as="label"
              title="Continuous PDF scrolling"
              description="Scroll through pages as one document"
              className="cursor-pointer"
            >
              <input
                type="checkbox"
                className="w-5 h-5 accent-secondary cursor-pointer"
                checked={settings.continuousScroll}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, continuousScroll: e.target.checked }))
                }
              />
            </SettingRow>

          </div>
        </div>
      </Card>
    </PageShell>
  )
}
