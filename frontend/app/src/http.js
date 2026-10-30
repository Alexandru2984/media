export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const UPLOAD_REQUEST_TIMEOUT_MS = 45_000;

async function responseError(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const requestId = payload?.request_id || response.headers.get('x-request-id');
  const error = new Error(payload?.title || `HTTP error! status: ${response.status}`);
  error.status = response.status;
  error.requestId = requestId;
  return error;
}

function transportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function requestJson(url, options = {}) {
  const {
    headers: headerValues,
    signal: externalSignal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;
  const headers = new Headers(headerValues);
  const controller = new AbortController();
  let timedOut = false;

  if (fetchOptions.body != null && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromCaller();
  } else {
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      credentials: 'same-origin',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await responseError(response);
    }
    if (response.status === 204 || response.status === 205) return null;
    try {
      return await response.json();
    } catch {
      throw transportError('INVALID_RESPONSE', 'Serverul a trimis un răspuns invalid. Încearcă din nou.');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw transportError('REQUEST_TIMEOUT', 'Cererea a durat prea mult. Încearcă din nou.');
      }
      throw transportError('REQUEST_ABORTED', 'Cererea a fost anulată.');
    }
    if (error instanceof TypeError) {
      throw transportError('NETWORK_ERROR', 'Conexiunea cu serverul nu a putut fi realizată.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
