let pendingUser;
export function requestComposerFocus(userId) {
  if (location.pathname !== '/') return;
  const editor = document.getElementById('new-post-content');
  if (editor && !editor.disabled) { pendingUser = undefined; editor.focus({ preventScroll: true }); }
  else pendingUser = userId;
}
export function fulfillComposerFocus(userId, editor) {
  if (pendingUser && pendingUser === userId && editor) {
    pendingUser = undefined;
    editor.focus({ preventScroll: true });
  }
}
