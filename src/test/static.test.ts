import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { resolveStaticFile } from '../server/static.ts';

describe('resolveStaticFile', () => {
  let baseDir: string;
  let clientDir: string;
  let siblingDir: string;

  before(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'osrs-static-'));
    clientDir = join(baseDir, 'client');
    siblingDir = join(baseDir, 'client-secrets');
    mkdirSync(join(clientDir, 'assets'), { recursive: true });
    mkdirSync(siblingDir, { recursive: true });
    writeFileSync(join(clientDir, 'index.html'), '<html>ok</html>');
    writeFileSync(join(clientDir, 'assets', 'app.js'), 'console.log(1);');
    writeFileSync(join(siblingDir, 'secret.txt'), 'top-secret');
    symlinkSync(join(siblingDir, 'secret.txt'), join(clientDir, 'leak.txt'));
  });

  after(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('serves index.html for the root path', () => {
    const res = resolveStaticFile(clientDir, '/');
    assert.equal(res.status, 200);
    assert.equal(res.filePath, join(clientDir, 'index.html'));
    assert.equal(res.contentType, 'text/html; charset=utf-8');
  });

  it('serves built assets with the expected content type', () => {
    const res = resolveStaticFile(clientDir, '/assets/app.js?v=1');
    assert.equal(res.status, 200);
    assert.equal(res.filePath, join(clientDir, 'assets', 'app.js'));
    assert.equal(res.contentType, 'text/javascript; charset=utf-8');
  });

  it('falls back to index.html for directories instead of returning a directory path', () => {
    const res = resolveStaticFile(clientDir, '/assets');
    assert.equal(res.status, 200);
    assert.equal(res.filePath, join(clientDir, 'index.html'));
  });

  it('rejects parent and sibling-prefix path traversal', () => {
    assert.equal(resolveStaticFile(clientDir, '/../client-secrets/secret.txt').status, 403);
    assert.equal(resolveStaticFile(clientDir, '/%2e%2e/client-secrets/secret.txt').status, 403);
    assert.equal(resolveStaticFile(clientDir, '/..\\client-secrets\\secret.txt').status, 403);
  });

  it('does not follow symlinks that escape the client directory', () => {
    const res = resolveStaticFile(clientDir, '/leak.txt');
    assert.equal(res.status, 200);
    assert.equal(res.filePath, join(clientDir, 'index.html'));
  });

  it('rejects malformed percent-encoding and null bytes', () => {
    assert.equal(resolveStaticFile(clientDir, '/%E0%A4%A').status, 400);
    assert.equal(resolveStaticFile(clientDir, '/index.html%00.js').status, 400);
  });
});
