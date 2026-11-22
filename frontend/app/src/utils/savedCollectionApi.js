import { api } from '../api';
import { encodePathSegment } from './urls';

const path = (id) => `/saved-collections/${encodePathSegment(id)}`;
export const savedCollectionApi = {
  list: () => api.request('/saved-collections'),
  create: (name) => api.request('/saved-collections', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id, name) => api.request(path(id), { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id) => api.request(path(id), { method: 'DELETE' }),
  assign: (postId, collectionId) => api.request(`/saved-posts/${encodePathSegment(postId)}/collection`, {
    method: 'PUT', body: JSON.stringify({ collection_id: collectionId || null }),
  }),
};
