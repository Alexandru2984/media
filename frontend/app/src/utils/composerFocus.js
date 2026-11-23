let pendingUser;
export function requestComposerFocus(userId) {
  if (location.pathname !== '/') return;
  const editor = document.getElementById('new-post-content');
  const target = editor && !editor.disabled ? editor : document.getElementById('restore-post-draft');
  if (target && !target.disabled) { pendingUser = undefined; target.focus(); }
  else pendingUser = userId;
}
export function fulfillComposerFocus(userId, editor) {
  if (pendingUser && pendingUser === userId && editor?.isConnected) {
    pendingUser = undefined;
    editor.focus();
  }
}
