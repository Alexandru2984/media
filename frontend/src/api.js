const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8082/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async register(username, email, password, bio = '') {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, bio }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Users
  async getProfile(userId) {
    return this.request(`/users/${userId}`);
  }

  // Posts
  async getPosts(limit = 10, offset = 0) {
    return this.request(`/posts?limit=${limit}&offset=${offset}`);
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
    return this.request(`/auth/verify-email?token=${token}`, {
      method: 'GET',
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
    return this.request(`/users/verify-email-change?token=${token}`, {
      method: 'GET',
    });
  }

  // Upload avatar
  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}/users/me/avatar`, {
      method: 'POST',
      headers,
      body: formData, // Don't set Content-Type, browser will set it with boundary
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Upload post image
  async uploadPostImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}/posts/upload-image`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

export const api = new ApiService();