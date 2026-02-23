export default function Settings({ settings, setSettings }) {
  const themes = [
    { id: 'default', name: 'Black & Orange', primary: '#0A0A0A', secondary: '#D97706' },
    { id: 'monochrome', name: 'Black & White', primary: '#000000', secondary: '#FFFFFF' },
    { id: 'citron-sage', name: 'Citron & Sage', primary: '#6c6a1f', secondary: '#577b21' },
    { id: 'slate', name: 'Slate', primary: '#000000', secondary: '#a0aecd' },
    { id: 'mist', name: 'Mist', primary: '#f7f7f7', secondary: '#7da2a9' },
    { id: 'forest', name: 'Forest', primary: '#052415', secondary: '#ffffff' },
  ]

  return (
    <div className="mx-auto max-w-[800px] p-12 font-sans">
      <h1 className="mb-2 text-4xl font-serif text-foreground">Settings</h1>
      <p className="mb-10 text-sm text-muted">Tune your reading and note-taking experience.</p>

      <div className="claude-card p-8">
        <div className="space-y-8">
          <div className="bg-surface/50 rounded-xl px-6 py-5 border border-border">
            <div className="text-sm font-semibold mb-4 text-foreground">Color Scheme</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setSettings(prev => ({ ...prev, theme: theme.id }))}
                  className={`flex flex-col items-center gap-3 border rounded-xl p-4 text-xs font-medium transition-all ${
                    settings.theme === theme.id
                      ? 'border-secondary bg-secondary/10 text-secondary'
                      : 'border-border bg-surface text-muted hover:border-secondary/30'
                  }`}
                >
                  <div className="flex gap-1">
                    <div
                      className="w-5 h-5 rounded-md border border-border"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <div
                      className="w-5 h-5 rounded-md border border-border"
                      style={{ backgroundColor: theme.secondary }}
                    />
                  </div>
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between bg-surface/50 rounded-xl px-6 py-5 border border-border hover:border-secondary/30 transition-all cursor-pointer group">
              <div>
                <div className="text-sm font-semibold text-foreground group-hover:text-secondary transition-colors">Continuous PDF scrolling</div>
                <div className="text-xs text-muted mt-1">Scroll through pages as one document</div>
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
                <div className="text-xs text-muted mt-1">Show rendered notes preview in Reader</div>
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

          <div className="bg-surface rounded-xl px-6 py-5 border border-border text-xs text-muted leading-relaxed">
            <div className="font-semibold mb-2 text-foreground uppercase tracking-wider">Keyboard shortcuts</div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-secondary font-mono font-bold">Ctrl+P</span> command palette (search & navigate)</div>
              <div><span className="text-secondary font-mono font-bold">Ctrl+K</span> focus home search</div>
              <div><span className="text-secondary font-mono font-bold">Ctrl+B</span> toggle sidebar</div>
              <div><span className="text-secondary font-mono font-bold">Ctrl+B</span> bold (in notes)</div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50 text-muted/80">
              In command palette: <span className="text-secondary font-mono">↑↓jk</span> navigate · <span className="text-secondary font-mono">Enter</span> open · <span className="text-secondary font-mono">Tab</span> switch to commands · type <span className="text-secondary font-mono">&gt;</span> for app commands
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
