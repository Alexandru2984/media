import { requestJson, UPLOAD_REQUEST_TIMEOUT_MS } from './http';
import { removeLegacyToken } from './storage';
import { encodePathSegment, withQuery } from './utils/urls';

const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  constructor() {
    // Remove browser-readable credentials left by releases predating HttpOnly sessions.
    removeLegacyToken();
  }

  async request(endpoint, options = {}) {
    return requestJson(`${API_URL}${endpoint}`, options);
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
    return this.request(`/auth/sessions/${encodePathSegment(sessionId)}`, {
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
    return this.request(`/users/${encodePathSegment(userId)}`);
  }

  async followUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/follow`, { method: 'PUT' });
  }

  async unfollowUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/follow`, { method: 'DELETE' });
  }

  async blockUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/block`, { method: 'PUT' });
  }

  async unblockUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/block`, { method: 'DELETE' });
  }

  async muteUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/mute`, { method: 'PUT' });
  }

  async unmuteUser(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/mute`, { method: 'DELETE' });
  }

  async getMutedUsers(limit = 20, offset = 0) {
    return this.request(withQuery('/users/me/mutes', { limit, offset }));
  }

  async getFollowers(userId, limit = 20, offset = 0) {
    return this.request(withQuery(`/users/${encodePathSegment(userId)}/followers`, { limit, offset }));
  }

  async getFollowing(userId, limit = 20, offset = 0) {
    return this.request(withQuery(`/users/${encodePathSegment(userId)}/following`, { limit, offset }));
  }

  async updatePrivacy(isPrivate) {
    return this.request('/users/me/privacy', {
      method: 'PUT',
      body: JSON.stringify({ is_private: isPrivate }),
    });
  }

  async getFollowRequests(limit = 20, offset = 0) {
    return this.request(withQuery('/users/me/follow-requests', { limit, offset }));
  }

  async acceptFollowRequest(userId) {
    return this.request(`/users/me/follow-requests/${encodePathSegment(userId)}`, { method: 'PUT' });
  }

  async rejectFollowRequest(userId) {
    return this.request(`/users/me/follow-requests/${encodePathSegment(userId)}`, { method: 'DELETE' });
  }

  // Posts
  async getPosts(limit = 10, offset = 0) {
    return this.request(withQuery('/posts', { limit, offset }));
  }

  async getPost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}`);
  }

  async getFollowingFeed(limit = 10, offset = 0) {
    return this.request(withQuery('/feed/following', { limit, offset }));
  }

  async createPost(content, imageUrl = null) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ content, image_url: imageUrl }),
    });
  }

  async likePost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}/like`, {
      method: 'POST',
    });
  }

  async savePost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}/save`, {
      method: 'POST',
    });
  }

  async getSavedPosts(limit = 10, offset = 0) {
    return this.request(withQuery('/saved-posts', { limit, offset }));
  }

  async hidePost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}/hide`, { method: 'PUT' });
  }

  async unhidePost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}/hide`, { method: 'DELETE' });
  }

  async getHiddenPosts(limit = 20, offset = 0) {
    return this.request(withQuery('/hidden-posts', { limit, offset }));
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
    return this.request(withQuery('/reports', { limit, offset }));
  }

  async withdrawReport(reportId) {
    return this.request(`/reports/${encodePathSegment(reportId)}`, { method: 'DELETE' });
  }

  // Least-privilege moderation
  async getModerationReports(status = 'open', limit = 20, offset = 0) {
    return this.request(withQuery('/moderation/reports', { status, limit, offset }));
  }

  async getModerationAudit(limit = 20, offset = 0) {
    return this.request(withQuery('/moderation/audit', { limit, offset }));
  }

  async getModerationRoleAudit(limit = 20, offset = 0) {
    return this.request(withQuery('/moderation/role-audit', { limit, offset }));
  }

  async claimModerationReport(reportId, password) {
    return this.request(`/moderation/reports/${encodePathSegment(reportId)}/claim`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  async releaseModerationReport(reportId, password) {
    return this.request(`/moderation/reports/${encodePathSegment(reportId)}/release`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  }

  async decideModerationReport(reportId, password, decision, note) {
    return this.request(`/moderation/reports/${encodePathSegment(reportId)}/decision`, {
      method: 'PUT',
      body: JSON.stringify({ password, decision, note }),
    });
  }

  // Notifications
  async getNotifications(limit = 20, offset = 0) {
    return this.request(withQuery('/notifications', { limit, offset }));
  }

  async getUnreadNotificationCount() {
    return this.request('/notifications/unread-count');
  }

  async markNotificationRead(notificationId) {
    return this.request(`/notifications/${encodePathSegment(notificationId)}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PUT' });
  }

  async deleteNotification(notificationId) {
    return this.request(`/notifications/${encodePathSegment(notificationId)}`, {
      method: 'DELETE',
    });
  }

  async getNotificationPreferences() {
    return this.request('/users/me/notification-preferences');
  }

  async updateNotificationPreferences(preferences) {
    return this.request('/users/me/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  }

  // Comments
  async getComments(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}/comments`);
  }

  async createComment(postId, content) {
    return this.request(`/posts/${encodePathSegment(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async updateComment(commentId, content) {
    return this.request(`/comments/${encodePathSegment(commentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteComment(commentId) {
    return this.request(`/comments/${encodePathSegment(commentId)}`, {
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
    return this.request(`/posts/${encodePathSegment(postId)}`, {
      method: 'PUT',
      body: JSON.stringify({ content, image_url: imageUrl }),
    });
  }

  async deletePost(postId) {
    return this.request(`/posts/${encodePathSegment(postId)}`, {
      method: 'DELETE',
    });
  }

  async getUserPosts(userId) {
    return this.request(`/users/${encodePathSegment(userId)}/posts`);
  }

  async search(query) {
    return this.request(withQuery('/search', { q: query }));
  }

  // Messages
  async sendMessage(receiverId, content) {
    return this.request('/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: receiverId, content }),
    });
  }

  async getMessages(userId) {
    return this.request(withQuery('/messages', { user_id: userId }));
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

    return requestJson(`${API_URL}/users/me/avatar`, {
      method: 'POST',
      body: formData, // Don't set Content-Type, browser will set it with boundary
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
    });
  }

  // Upload post image
  async uploadPostImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    return requestJson(`${API_URL}/posts/upload-image`, {
      method: 'POST',
      body: formData,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
    });
  }
}

export const api = new ApiService();
