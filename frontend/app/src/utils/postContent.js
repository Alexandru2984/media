export const POST_CHARACTER_LIMIT = 500;

// Rust validates Unicode scalar values, rather than JavaScript UTF-16 units.
export const countPostCharacters = (value) => typeof value === 'string' ? [...value].length : 0;

export function postContentIsValid(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && countPostCharacters(value) <= POST_CHARACTER_LIMIT
    && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value);
}
