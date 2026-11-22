import { Show } from 'solid-js';
import { IMAGE_ALT_CHARACTER_LIMIT, imageAltIsValid, imageAltLength } from '../utils/imageAlt';

export default function ImageAltField(props) {
  const valid = () => imageAltIsValid(props.value);
  return <div class="image-alt-field">
    <label class="field-label" for={props.id}>Descrierea imaginii <span>(opțional)</span></label>
    <input id={props.id} class="input" type="text" value={props.value} onInput={(event) => props.onInput(event.currentTarget.value)} disabled={props.disabled}
      aria-invalid={!valid()} aria-describedby={`${props.id}-help ${props.id}-count`} placeholder="Ce este important în această imagine?" />
    <p class="field-hint" id={`${props.id}-help`}>Ajută persoanele care folosesc cititoare de ecran să înțeleagă imaginea.</p>
    <div class={`character-count ${valid() ? '' : 'is-over'}`} id={`${props.id}-count`}>{imageAltLength(props.value)}/{IMAGE_ALT_CHARACTER_LIMIT}</div>
    <Show when={!valid()}><p class="inline-error" role="alert">Folosește maximum 300 de caractere, pe un singur rând.</p></Show>
  </div>;
}
