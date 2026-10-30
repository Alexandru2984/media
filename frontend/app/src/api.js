const API_URL = import.meta.env.VITE_API_URL || '/api';

async function apiError(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const requestId = payload?.request_id || response.headers.get('x-request-id');
  const error = new Error(payload?.title || `HTTP error! status: ${response.status}`);
  error.status = response.status;
  error.requestId = requestId;
  return error;
}

class ApiService {
  constructor() {
    // Remove browser-readable credentials left by releases predating HttpOnly sessions.
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw await apiError(response);
    }

    return response.json();
  }

  // Auth
  async register(username, email, password, bio = '') {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, bio }),
    });
  }

  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async getSessions() {
    return this.request('/auth/sessions');
  }

  async getSecurityEvents() {
    return this.request('/auth/security-events');
  }

  async revokeSession(sessionId) {
    return this.request(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  async revokeOtherSessions() {
    return this.request('/auth/sessions', {
      method: 'DELETE',
    });
  }

  // Users
  async getProfile(userId) {
    return this.request(`/users/${userId}`);
  }

  async followUser(userId) {
    return this.request(`/users/${userId}/follow`, { method: 'PUT' });
  }

  async unfollowUser(userId) {
    return this.request(`/users/${userId}/follow`, { method: 'DELETE' });
  }

  async blockUser(userId) {
    return this.request(`/users/${userId}/block`, { method: 'PUT' });
  }

  async unblockUser(userId) {
    return this.request(`/users/${userId}/block`, { method: 'DELETE' });
  }

  async muteUser(userId) {
    return this.request(`/users/${encodeURIComponent(userId)}/mute`, { method: 'PUT' });
  }

  async unmuteUser(userId) {
    return this.request(`/users/${encodeURIComponent(userId)}/mute`, { method: 'DELETE' });
  }

  async getMutedUsers(limit = 20, offset = 0) {
    return this.request(`/users/me/mutes?limit=${limit}&offset=${offset}`);
  }

  async getFollowers(userId, limit = 20, offset = 0) {
    return this.request(`/users/${userId}/followers?limit=${limit}&offset=${offset}`);
  }

  async getFollowing(userId, limit = 20, offset = 0) {
    return this.request(`/users/${userId}/following?limit=${limit}&offset=${offset}`);
  }

  async updatePrivacy(isPrivate) {
    return this.request('/users/me/privacy', {
      method: 'PUT',
      body: JSON.stringify({ is_private: isPrivate }),
    });
  }

  async getFollowRequests(limit = 20, offset = 0) {
    return this.request(`/users/me/follow-requests?limit=${limit}&offset=${offset}`);
  }

  async acceptFollowRequest(userId) {
    return this.request(`/users/me/follow-requests/${userId}`, { method: 'PUT' });
  }

  async rejectFollowRequest(userId) {
    return this.request(`/users/me/follow-requests/${userId}`, { method: 'DELETE' });
  }

  // Posts
  async getPosts(limit = 10, offset = 0) {
    return this.request(`/posts?limit=${limit}&offset=${offset}`);
  }

  async getFollowingFeed(limit = 10, offset = 0) {
    return this.request(`/feed/following?limit=${limit}&offset=${offset}`);
  }

  async createPost(content, imageUrl = null) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, image_url: imageUrl }),
    });
  }

  async likePost(postId) {
    return this.request(`/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  async savePost(postId) {
    return this.request(`/posts/${postId}/save`, {
      method: 'POST',
    });
  }

  async getSavedPosts(limit = 10, offset = 0) {
    return this.request(`/saved-posts?limit=${limit}&offset=${offset}`);
  }

  async hidePost(postId) {
    return this.request(`/posts/${encodeURIComponent(postId)}/hide`, { method: 'PUT' });
  }

  async unhidePost(postId) {
    return this.request(`/posts/${encodeURIComponent(postId)}/hide`, { method: 'DELETE' });
  }

  async getHiddenPosts(limit = 20, offset = 0) {
    return this.request(`/hidden-posts?limit=${limit}&offset=${offset}`);
  }

  // Reporter-private trust and safety records
  async createReport(targetType, targetId, reason, details = '') {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        reason,
        details,
      }),
    });
  }

  async getReports(limit = 20, offset = 0) {
    return this.request(`/reports?limit=${limit}&offset=${offset}`);
  }

  async withdrawReport(reportId) {
    return this.request(`/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
  }

  // Least-privilege moderation
  async getModerationReports(status = 'open', limit = 20, offset = 0) {
    return this.request(`/moderation/reports?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`);
  }

  async getModerationAudit(limit = 20, offset = 0) {
    return this.request(`/moderation/audit?limit=${limit}&offset=${offset}`);
  }

  async getModerationRoleAudit(limit = 20, offset = 0) {
    return this.request(`/moderation/role-audit?limit=${limit}&offset=${offset}`);
  }

  async claimModerationReport(reportId, password) {
    return this.request(`/moderation/reports/${encodeURIComponent(reportId)}/claim`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  async releaseModerationReport(reportId, password) {
    return this.request(`/moderation/reports/${encodeURIComponent(reportId)}/release`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  async decideModerationReport(reportId, password, decision, note) {
    return this.request(`/moderation/reports/${encodeURIComponent(reportId)}/decision`, {
      method: 'PUT',
      body: JSON.stringify({ password, decision, note }),
    });
  }

  // Notifications
  async getNotifications(limit = 20, offset = 0) {
    return this.request(`/notifications?limit=${limit}&offset=${offset}`);
  }

  async getUnreadNotificationCount() {
    return this.request('/notifications/unread-count');
  }

  async markNotificationRead(notificationId) {
    return this.request(`/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PUT' });
  }

  async deleteNotification(notificationId) {
    return this.request(`/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
    });
  }

  // Comments
  async getComments(postId) {
    return this.request(`/posts/${postId}/comments`);
  }

  async createComment(postId, content) {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async updateComment(commentId, content) {
    return this.request(`/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteComment(commentId) {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // Update Profile
  async updateProfile(username, bio, avatarUrl) {
    return this.request('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ username, bio, avatar_url: avatarUrl }),
    });
  }

  // Post Management
  async updatePost(postId, content, imageUrl) {
    return this.request(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify({ content, image_url: imageUrl }),
    });
  }

  async deletePost(postId) {
    return this.request(`/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  async getUserPosts(userId) {
    return this.request(`/users/${userId}/posts`);
  }

  async search(query) {
    return this.request(`/search?q=${encodeURIComponent(query)}`);
  }

  // Messages
  async sendMessage(receiverId, content) {
    return this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: receiverId, content }),
    });
  }

  async getMessages(userId) {
    return this.request(`/messages?user_id=${userId}`);
  }

  // Email verification and password reset
  async sendVerificationEmail() {
    return this.request('/auth/send-verification', {
      method: 'POST',
    });
  }

  async verifyEmail(token) {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token, password) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  // Change password
  async changePassword(oldPassword, newPassword) {
    return this.request('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  }

  // Change email
  async changeEmail(newEmail, password) {
    return this.request('/users/me/change-email', {
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail, password }),
    });
  }

  async verifyEmailChange(token) {
    return this.request('/users/verify-email-change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async exportAccountData(password) {
    return this.request('/users/me/export', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  async deleteAccount(password, confirmation) {
    return this.request('/users/me', {
      method: 'DELETE',
      body: JSON.stringify({ password, confirmation }),
    });
  }

  // Upload avatar
  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${API_URL}/users/me/avatar`, {
      method: 'POST',
      body: formData, // Don't set Content-Type, browser will set it with boundary
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw await apiError(response);
    }

    return response.json();
  }

  // Upload post image
  async uploadPostImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_URL}/posts/upload-image`, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw await apiError(response);
    }

    return response.json();
  }
}

export const api = new ApiService();
