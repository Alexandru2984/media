import { createEffect, onCleanup, Show } from 'solid-js';

export default function Modal(props) {
  let dialog;
  let previousFocus;
  const focusable = () => [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const requestClose = () => { if (!props.busy) props.onClose?.(); };
  const restoreFocus = () => {
    if (previousFocus?.isConnected) {
      const target = previousFocus.disabled
        ? previousFocus.closest('article, main')?.querySelector('button:not(:disabled), a[href]')
        : previousFocus;
      target?.focus({ preventScroll: true });
    }
  };
  createEffect(() => {
    if (props.open && !dialog.open) {
      previousFocus = document.activeElement;
      dialog.showModal();
      (dialog.querySelector('[autofocus]') || focusable()[0] || dialog).focus();
    } else if (!props.open && dialog.open) {
      dialog.close();
    }
    if (props.open && props.busy) dialog.focus();
  });
  onCleanup(() => { if (dialog.open) { dialog.close(); restoreFocus(); } });

  return <dialog ref={dialog} class={props.class || 'surface report-dialog'} aria-label={props.label} aria-labelledby={props.labelledBy} aria-busy={props.busy || undefined}
    onCancel={(event) => { event.preventDefault(); requestClose(); }}
    onClose={() => { if (!dialog.open) { props.onClose?.(); restoreFocus(); } }}
    onClick={(event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) requestClose();
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }}>
    <Show when={props.open}>{props.children}</Show>
  </dialog>;
}
