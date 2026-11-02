const DRAFT_VERSION = 1;
const MAX_DRAFT_LENGTH = 500;
const MAX_STORED_BYTES = 2048;
export const POST_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function draftKey(userId) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId || normalizedUserId.length > 128) return null;
  return `media:post-draft:v${DRAFT_VERSION}:${encodeURIComponent(normalizedUserId)}`;
}

function removeStoredDraft(storage, key) {
  try {
    storage.removeItem(key);
  } catch {}
}

export function readPostDraft(userId, environment = globalThis, now = Date.now()) {
  const key = draftKey(userId);
  if (!key || !Number.isFinite(now)) return null;

  try {
    const storage = environment.sessionStorage;
    if (!storage) return null;
    const rawDraft = storage.getItem(key);
    if (!rawDraft) return null;
    if (rawDraft.length > MAX_STORED_BYTES) {
      removeStoredDraft(storage, key);
      return null;
    }

    let draft;
    try {
      draft = JSON.parse(rawDraft);
    } catch {
      removeStoredDraft(storage, key);
      return null;
    }
    const valid = draft
      && draft.version === DRAFT_VERSION
      && typeof draft.content === 'string'
      && draft.content.trim().length > 0
      && draft.content.length <= MAX_DRAFT_LENGTH
      && Number.isFinite(draft.savedAt)
      && draft.savedAt <= now + MAX_CLOCK_SKEW_MS
      && now - draft.savedAt <= POST_DRAFT_MAX_AGE_MS;

    if (!valid) {
      removeStoredDraft(storage, key);
      return null;
    }

    return { content: draft.content, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

export function storePostDraft(userId, content, environment = globalThis, now = Date.now()) {
  const key = draftKey(userId);
  if (
    !key
    || typeof content !== 'string'
    || !content.trim()
    || content.length > MAX_DRAFT_LENGTH
    || !Number.isFinite(now)
  ) return false;

  try {
    const storage = environment.sessionStorage;
    if (!storage) return false;
    storage.setItem(key, JSON.stringify({ version: DRAFT_VERSION, content, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function removePostDraft(userId, environment = globalThis) {
  const key = draftKey(userId);
  if (!key) return false;

  try {
    const storage = environment.sessionStorage;
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
