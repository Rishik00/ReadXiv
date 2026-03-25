import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders text with LaTeX (math, \textit, \emph, \textbf) for arXiv abstracts.
 */
export default function LatexText({ text, className = '', style = {} }) {
  const html = useMemo(() => {
    if (!text || typeof text !== 'string') return ''
    let out = escapeHtml(text)

    // Replace \textit{...}, \emph{...}, \textbf{...} - run multiple passes for nesting
    for (let i = 0; i < 5; i++) {
      const prev = out
      out = out.replace(/\\textit\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<i>$1</i>')
      out = out.replace(/\\emph\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<em>$1</em>')
      out = out.replace(/\\textbf\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '<strong>$1</strong>')
      if (out === prev) break
    }

    // Render display math $$...$$
    out = out.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
      } catch {
        return `$$${math}$$`
      }
    })

    // Render inline math $...$ (avoid $$)
    out = out.replace(/(?<!\$)\$(?!\$)([^$]+)\$(?!\$)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
      } catch {
        return `$${math}$`
      }
    })

    return out
  }, [text])

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
