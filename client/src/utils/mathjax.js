/** Lazy-load MathJax only when preview needs it (avoids blocking initial app load). */
const MATHJAX_SRC = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

function configureMathJax() {
  if (window.MathJax?.version) return;
  window.MathJax = {
    tex: {
      // ReadXiv: `$$…$$` = inline; `$$$$…$$$$` = display (block). Put `$$` before `$` so pairs resolve first.
      inlineMath: [
        ['$$', '$$'],
        ['$', '$'],
        ['\\(', '\\)'],
      ],
      displayMath: [
        ['$$$$', '$$$$'],
        ['\\[', '\\]'],
      ],
    },
    svg: { fontCache: 'global' },
  };
}

/**
 * @returns {Promise<void>}
 */
export function ensureMathJax() {
  if (window.__readxivMathJaxPromise) return window.__readxivMathJaxPromise;

  if (window.MathJax?.startup?.promise) {
    window.__readxivMathJaxPromise = window.MathJax.startup.promise.catch(() => {});
    return window.__readxivMathJaxPromise;
  }

  const existing = document.getElementById('MathJax-script');
  if (existing) {
    window.__readxivMathJaxPromise = new Promise((resolve, reject) => {
      const done = () => {
        window.MathJax?.startup?.promise?.then(resolve).catch(resolve);
      };
      if (window.MathJax?.version) {
        done();
        return;
      }
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('MathJax load failed')));
    });
    return window.__readxivMathJaxPromise;
  }

  configureMathJax();

  window.__readxivMathJaxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'MathJax-script';
    script.async = true;
    script.src = MATHJAX_SRC;
    script.onload = () => {
      const p = window.MathJax?.startup?.promise;
      if (p) p.then(() => resolve()).catch(() => resolve());
      else resolve();
    };
    script.onerror = () => reject(new Error('MathJax script failed'));
    document.head.appendChild(script);
  });

  return window.__readxivMathJaxPromise;
}

/** Rough check to skip loading MathJax for plain-text notes. */
export function notesMayContainTex(notes) {
  if (!notes || typeof notes !== 'string') return false;
  return (
    notes.includes('$') ||
    notes.includes('\\(') ||
    notes.includes('\\[') ||
    notes.includes('$$') ||
    notes.includes('$$$$')
  );
}
