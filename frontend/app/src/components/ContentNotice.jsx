import { createEffect, lazy, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
export const WarningField = lazy(() => import('./ContentWarningField'));

export default function ContentNotice(props) {
  let element;
  createEffect(() => {
    props.resetKey;
    props.label;
    if (element?.tagName === 'DETAILS') element.open = false;
  });
  createEffect(() => { if (props.forceOpen && element?.tagName === 'DETAILS') element.open = true; });
  return <Dynamic component={props.label ? 'details' : 'div'} ref={element} class={props.label ? 'post-warning' : undefined}>
    <Show when={props.label}><summary>Avertisment: {props.label}</summary></Show>
    {props.children}
  </Dynamic>;
}
