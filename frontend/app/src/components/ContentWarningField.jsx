import { createEffect } from 'solid-js';
import { countPostCharacters, postWarningIsValid } from '../utils/postContent';

export default function ContentWarningField(props) {
  let panel;
  createEffect(() => { if (props.value && panel) panel.open = true; });
  return <details class="warning-field" ref={panel}>
    <summary>Avertisment de conținut (opțional)</summary>
    <label class="field-label" for={props.id}>Eticheta avertismentului</label>
    <input class="input" id={props.id} value={props.value} disabled={props.disabled} aria-invalid={!postWarningIsValid(props.value)} aria-describedby={`${props.id}-help ${props.id}-count`} onInput={(event) => props.onInput(event.currentTarget.value)} placeholder="De exemplu: violență, spoilere" />
    <div class="character-count" id={`${props.id}-count`}>{countPostCharacters(props.value.trim())}/100</div>
    <p class="composer-preview-notice" id={`${props.id}-help`}>Cititorii aleg dacă deschid postarea. Audiența rămâne aceeași.</p>
  </details>;
}
