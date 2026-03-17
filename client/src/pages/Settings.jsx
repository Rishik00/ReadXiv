export default function Settings({ settings, setSettings, setPage }) {
  const themes = [
    { id: 'default', name: 'Black & Orange' },
    { id: 'monochrome', name: 'Black & White' },
    { id: 'blue', name: 'Black & Blue' },
  ]

  return (
    <div className="mx-auto max-w-[800px] p-12 font-sans">
      <h1 className="mb-2 text-4xl font-serif text-foreground">Settings</h1>
      <p className="mb-10 text-sm text-muted">Tune your note-taking experience.</p>

      <div className="claude-card p-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all">
              <div>
                <div className="text-sm font-semibold text-foreground">Color scheme</div>
                <div className="text-sm text-muted mt-1">Those who use light mode need help</div>
              </div>
              <select
                value={settings.theme || 'default'}
                onChange={(e) => setSettings(prev => ({ ...prev, theme: e.target.value }))}
                className="w-40 pl-3 pr-8 py-2 text-sm font-medium rounded-lg border-2 border-border bg-surface text-foreground focus:border-secondary/50 focus:outline-none cursor-pointer appearance-none shrink-0"
                style={{
                  backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
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

            <label className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all cursor-pointer group">
              <div>
                <div className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors">Continuous PDF scrolling</div>
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

            <label className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all cursor-pointer group">
              <div>
                <div className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors">Live markdown preview</div>
                <div className="text-sm text-muted mt-1">Show rendered notes preview in Reader</div>
              </div>
              <input
                type="checkbox"
                className="w-5 h-5 accent-secondary cursor-pointer"
                checked={settings.liveMarkdownPreview}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, liveMarkdownPreview: e.target.checked }))
                }
              />
            </label>
          </div>

          {/* <div className="bg-surface rounded-xl px-6 py-5 border border-border">
            <div className="text-sm font-semibold mb-2 text-foreground">Keyboard shortcuts</div>
            <p className="text-sm text-muted mb-3">All shortcuts are listed on the Help page.</p>
            <button
              type="button"
              onClick={() => setPage('help')}
              className="text-sm font-medium text-secondary hover:underline"
            >
              Open Help page →
            </button>
          </div> */}
        </div>
      </div>
    </div>
  )
}
