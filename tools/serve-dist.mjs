import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = join(process.cwd(), 'dist')
const port = Number(process.env.PORT || 5173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`)
    const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = join(root, path)
    if (!file.startsWith(root)) throw new Error('Bad path')
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch {
    const body = await readFile(join(root, 'index.html'))
    response.writeHead(200, { 'Content-Type': types['.html'] })
    response.end(body)
  }
}).listen(port, '127.0.0.1')

console.log(`AzubiCheck preview listening on http://127.0.0.1:${port}`)
