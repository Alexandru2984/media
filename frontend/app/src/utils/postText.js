// Return text tokens, never HTML. A hashtag must start at a word boundary and
// fit a bounded search query; URL fragments and email-like text stay untouched.
export function tokenizePostText(value) {
  const text = typeof value === 'string' ? value : '';
  const tokens = [];
  const pattern = /(^|[\s([{,;:!?])(#\p{L}[\p{L}\p{M}\p{N}_]{1,31})(?![\p{L}\p{M}\p{N}_])/gu;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1].length;
    if (start > position) tokens.push({ text: text.slice(position, start) });
    tokens.push({ text: match[2], query: match[2].normalize('NFC') });
    position = start + match[2].length;
  }
  if (position < text.length) tokens.push({ text: text.slice(position) });
  return tokens;
}
