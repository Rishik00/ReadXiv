import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, resolve, sep } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 8765)
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' }

createServer(async (request, response) => {
  let pathname
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname) }
  catch { response.writeHead(400).end('Bad request'); return }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  try {
    const info = await stat(target)
    if (!info.isFile()) throw new Error('Not a file')
    const body = await readFile(target)
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Content-Length': body.length })
    response.end(body)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(port, '0.0.0.0', () => console.log(`ReadXiv issue #29 studies: http://localhost:${port}/`))
