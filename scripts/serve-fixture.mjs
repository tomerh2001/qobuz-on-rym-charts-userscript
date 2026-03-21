import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(rootDir, 'tests', 'fixtures');
const distRoot = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || '4173');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

function safeResolve(baseDir, relativePath) {
  const resolvedPath = path.resolve(baseDir, `.${relativePath}`);
  if (!resolvedPath.startsWith(baseDir)) {
    return null;
  }

  return resolvedPath;
}

async function readStaticAsset(requestPath) {
  if (requestPath.startsWith('/dist/')) {
    const assetPath = safeResolve(distRoot, requestPath.slice('/dist'.length));
    if (!assetPath) {
      return null;
    }

    return assetPath;
  }

  const normalizedPath = requestPath.endsWith('/') ? `${requestPath}index.html` : requestPath;
  return safeResolve(fixtureRoot, normalizedPath);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }

    const assetPath = await readStaticAsset(url.pathname);
    if (!assetPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const body = await readFile(assetPath);
    const extension = path.extname(assetPath).toLowerCase();

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extension) || 'application/octet-stream',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Unexpected fixture server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fixture server running at:
  http://127.0.0.1:${port}/charts/top/album/all-time/`);
});

