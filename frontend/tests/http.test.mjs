import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestJson,
  DEFAULT_REQUEST_TIMEOUT_MS,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from '../app/src/http.js';

const originalFetch = globalThis.fetch;

async function withFetch(mock, callback) {
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('uses same-origin credentials and omits a JSON content type from bodyless requests', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, '/api/posts');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.has('Content-Type'), false);
    return Response.json({ ok: true });
  }, async () => {
    assert.deepEqual(await requestJson('/api/posts'), { ok: true });
  });
});

test('adds JSON content type for request bodies but leaves FormData boundaries to the browser', async () => {
  const observedContentTypes = [];
  await withFetch(async (_url, options) => {
    observedContentTypes.push(options.headers.get('Content-Type'));
    return Response.json({ ok: true });
  }, async () => {
    await requestJson('/api/posts', { method: 'POST', body: '{}' });
    await requestJson('/api/posts/upload-image', { method: 'POST', body: new FormData() });
  });
  assert.deepEqual(observedContentTypes, ['application/json', null]);
});

test('turns a hung transport into a bounded generic timeout error', async () => {
  await withFetch((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }), async () => {
    await assert.rejects(
      requestJson('/api/slow', { timeoutMs: 5 }),
      (error) => error.code === 'REQUEST_TIMEOUT' && !error.message.includes('/api/slow'),
    );
  });
});

test('keeps caller cancellation distinct from timeouts', async () => {
  const controller = new AbortController();
  controller.abort();
  await withFetch(async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    throw new DOMException('aborted', 'AbortError');
  }, async () => {
    await assert.rejects(
      requestJson('/api/posts', { signal: controller.signal }),
      (error) => error.code === 'REQUEST_ABORTED',
    );
  });
});

test('preserves safe problem details and request IDs from HTTP errors', async () => {
  await withFetch(async () => Response.json({
    title: 'Bad Request',
    request_id: '0123456789abcdef0123456789abcdef',
  }, { status: 400 }), async () => {
    await assert.rejects(
      requestJson('/api/posts?limit=0'),
      (error) => error.status === 400
        && error.message === 'Bad Request'
        && error.requestId === '0123456789abcdef0123456789abcdef',
    );
  });
});

test('returns null for successful empty responses and hides network internals', async () => {
  await withFetch(async () => new Response(null, { status: 204 }), async () => {
    assert.equal(await requestJson('/api/empty'), null);
  });
  await withFetch(async () => {
    throw new TypeError('private network detail');
  }, async () => {
    await assert.rejects(
      requestJson('/api/posts'),
      (error) => error.code === 'NETWORK_ERROR' && !error.message.includes('private network detail'),
    );
  });
});

test('replaces malformed successful responses with a generic protocol error', async () => {
  await withFetch(async () => new Response('<private upstream detail>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  }), async () => {
    await assert.rejects(
      requestJson('/api/posts'),
      (error) => error.code === 'INVALID_RESPONSE'
        && !error.message.includes('private upstream detail'),
    );
  });
});

test('keeps normal and upload time budgets explicit', () => {
  assert.equal(DEFAULT_REQUEST_TIMEOUT_MS, 15_000);
  assert.equal(UPLOAD_REQUEST_TIMEOUT_MS, 45_000);
});
