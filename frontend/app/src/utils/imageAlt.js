import { countPostCharacters } from './postContent.js';

export const IMAGE_ALT_CHARACTER_LIMIT = 300;
export const imageAltLength = (value) => countPostCharacters(typeof value === 'string' ? value.trim() : '');
export const imageAltIsValid = (value) => typeof value === 'string'
  && imageAltLength(value) <= IMAGE_ALT_CHARACTER_LIMIT
  && !/[\u0000-\u001f\u007f-\u009f]/u.test(value.trim());
