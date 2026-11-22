import { For } from 'solid-js';
import { PROFILE_DETAIL_LIMITS, profileLineIsValid, profileTextLength, publicWebsite } from '../utils/profileDetails';

const fields = [
  { key: 'display_name', label: 'Nume afișat', hint: 'Numele din antetul profilului. Numele de utilizator rămâne identificatorul contului.' },
  { key: 'pronouns', label: 'Pronume', hint: 'De exemplu: ea/ei, el/lui.' },
  { key: 'location', label: 'Localitate', hint: 'Alege cât de precis vrei să indici locul.' },
];
export default function ProfileDetailsFields(props) {
  return <fieldset class="profile-details-fields" disabled={props.disabled}>
    <legend>Mai multe despre tine</legend>
    <p class="profile-details-notice">Opționale și publice, inclusiv pentru un cont privat. Poți șterge oricând aceste detalii.</p>
    <For each={fields}>{(field) => <div>
      <label class="field-label" for={`profile-${field.key}`}>{field.label}</label>
      <input id={`profile-${field.key}`} class="input" value={props.value[field.key]} aria-describedby={`profile-${field.key}-hint`} aria-invalid={!profileLineIsValid(props.value[field.key], PROFILE_DETAIL_LIMITS[field.key])} onInput={(event) => props.onChange(field.key, event.currentTarget.value)} />
      <div class="profile-details-hint" id={`profile-${field.key}-hint`}><span>{field.hint}</span><span>{profileTextLength(props.value[field.key])}/{PROFILE_DETAIL_LIMITS[field.key]}</span></div>
    </div>}</For>
    <div>
      <label class="field-label" for="profile-website_url">Website</label>
      <input id="profile-website_url" class="input" type="text" inputmode="url" spellcheck={false} placeholder="https://exemplu.ro" value={props.value.website_url} aria-describedby="profile-website-hint" aria-invalid={Boolean(props.value.website_url.trim()) && !publicWebsite(props.value.website_url)} onInput={(event) => props.onChange('website_url', event.currentTarget.value)} />
      <p class="profile-details-hint" id="profile-website-hint">Adresă HTTPS publică, fără date de autentificare și pe portul standard.</p>
    </div>
  </fieldset>;
}
