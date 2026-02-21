export default function Settings({ settings, setSettings }) {
  return (
    <div className="mx-auto max-w-[920px] p-12 font-mono">
      <h1 className="mb-2 text-4xl font-bold tracking-brutalist uppercase text-foreground">Settings</h1>
      <p className="mb-10 text-[11px] text-muted uppercase tracking-[0.2em]">Tune your reading and note-taking experience.</p>

      <div className="border-2 border-border bg-surface p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="space-y-6">
          <div className="border-2 border-border bg-background px-6 py-4">
            <div className="text-xs font-bold uppercase tracking-widest mb-4">Secondary Color</div>
            <div className="flex gap-4">
              <button
                onClick={() => setSettings(prev => ({ ...prev, secondaryColor: 'orange' }))}
                className={`flex-1 border-2 p-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  settings.secondaryColor === 'orange' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted hover:border-muted'
                }`}
              >
                Rust Orange
              </button>
              <button
                onClick={() => setSettings(prev => ({ ...prev, secondaryColor: 'white' }))}
                className={`flex-1 border-2 p-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  settings.secondaryColor === 'white' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted hover:border-muted'
                }`}
              >
                Pure White
              </button>
            </div>
          </div>

          <div className="border-2 border-border bg-background px-6 py-4">
            <div className="text-xs font-bold uppercase tracking-widest mb-4">Font Family</div>
            <div className="flex gap-4">
              <button
                onClick={() => setSettings(prev => ({ ...prev, fontFamily: 'brutalist' }))}
                className={`flex-1 border-2 p-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  settings.fontFamily === 'brutalist' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted hover:border-muted'
                }`}
              >
                Space & JetBrains
              </button>
              <button
                onClick={() => setSettings(prev => ({ ...prev, fontFamily: 'inter' }))}
                className={`flex-1 border-2 p-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  settings.fontFamily === 'inter' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted hover:border-muted'
                }`}
              >
                Inter (Modern)
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between border-2 border-border bg-background px-6 py-4 hover:border-secondary transition-colors cursor-pointer group">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest group-hover:text-secondary transition-colors">Continuous PDF scrolling</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">Scroll through pages as one document</div>
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

          <label className="flex items-center justify-between border-2 border-border bg-background px-6 py-4 hover:border-secondary transition-colors cursor-pointer group">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest group-hover:text-secondary transition-colors">Live markdown preview</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">Show rendered notes preview in Reader</div>
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

          <div className="border-2 border-border bg-background px-6 py-4 text-[10px] text-muted uppercase tracking-widest leading-loose">
            Keyboard shortcuts: <br/>
            <span className="text-secondary font-bold">Ctrl+K</span> - focus search <br/>
            <span className="text-secondary font-bold">Ctrl+B</span> - toggle sidebar <br/>
            <span className="text-secondary font-bold">Ctrl+B (notes)</span> - bold selection
          </div>
        </div>
      </div>
    </div>
  )
}

