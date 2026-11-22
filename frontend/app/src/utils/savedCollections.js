export const COLLECTION_LIMIT = 30;
export const COLLECTION_NAME_LIMIT = 60;
export const collectionNameLength = (value) => [...String(value)].length;
export function collectionNameIsValid(value) {
  return typeof value === 'string' && value.trim().length > 0
    && collectionNameLength(value.trim()) <= COLLECTION_NAME_LIMIT
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
