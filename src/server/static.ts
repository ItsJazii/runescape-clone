import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export type StaticResolution =
  | { status: 200; filePath: string; contentType: string }
  | { status: 400 | 403 | 404; message: string };

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function isRegularFileWithin(rootReal: string, filePath: string): boolean {
  try {
    if (!statSync(filePath).isFile()) return false;
    return isWithinRoot(rootReal, realpathSync(filePath));
  } catch {
    return false;
  }
}

export function resolveStaticFile(clientDir: string, rawUrl: string | undefined): StaticResolution {
  const root = resolve(clientDir);
  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return { status: 404, message: 'Not found' };
  }

  const rawPath = (rawUrl ?? '/').split('?')[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { status: 400, message: 'Bad request' };
  }
  if (decoded.includes('\0')) {
    return { status: 400, message: 'Bad request' };
  }

  const normalised = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const candidate = resolve(root, normalised || 'index.html');
  if (!isWithinRoot(root, candidate)) {
    return { status: 403, message: 'Forbidden' };
  }

  let filePath = candidate;
  if (!isRegularFileWithin(rootReal, filePath)) {
    const fallback = join(root, 'index.html');
    if (!isRegularFileWithin(rootReal, fallback)) {
      return { status: 404, message: 'Not found' };
    }
    filePath = fallback;
  }

  return {
    status: 200,
    filePath,
    contentType: MIME[extname(filePath)] ?? 'application/octet-stream',
  };
}

export function createStaticHandler(clientDir: string) {
  return function serveStatic(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    if (!existsSync(clientDir)) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Old School RuneScape clone server is running.\nStart the client with: npm run dev');
      return;
    }

    const result = resolveStaticFile(clientDir, req.url);
    if (result.status !== 200) {
      res.writeHead(result.status, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : result.message);
      return;
    }

    try {
      const body = readFileSync(result.filePath);
      res.writeHead(200, { 'content-type': result.contentType });
      res.end(method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(method === 'HEAD' ? undefined : 'Internal server error');
    }
  };
}
