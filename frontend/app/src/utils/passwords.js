export const MINIMUM_PASSWORD_CHARACTERS = 12;
export const MAXIMUM_PASSWORD_BYTES = 72;

export function getPasswordPolicyError(password) {
  if ([...password].length < MINIMUM_PASSWORD_CHARACTERS) {
    return `Parola trebuie să conțină cel puțin ${MINIMUM_PASSWORD_CHARACTERS} caractere.`;
  }

  if (new TextEncoder().encode(password).length > MAXIMUM_PASSWORD_BYTES) {
    return `Parola nu poate depăși ${MAXIMUM_PASSWORD_BYTES} de octeți.`;
  }

  return '';
}
