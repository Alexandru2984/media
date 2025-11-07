import { createSignal, onMount, Show, For, createEffect } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import { api } from '../api';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import ProfileSettings from '../components/ProfileSettings';

export default function Profile() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = createSignal(null);
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const [editing, setEditing] = createSignal(false);
  const [username, setUsername] = createSignal('');
  const [bio, setBio] = createSignal('');
  const [activeTab, setActiveTab] = createSignal('posts');

  const loadProfile = async () => {
    try {
      setLoading(true);
      const userId = params.id;
      const profileData = await api.getProfile(userId);
      setProfile(profileData);
      setUsername(profileData.username);
      setBio(profileData.bio || '');

      const userPosts = await api.getUserPosts(userId);
      setPosts(userPosts);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.updateProfile(username(), bio(), null);
      await loadProfile();
      setEditing(false);
      
      // Refresh user data in AuthContext if it's own profile
      if (isOwnProfile()) {
        const userData = await api.getCurrentUser();
        auth.setUser(userData);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('Nu s-a putut actualiza profilul');
    }
  };

  const isOwnProfile = () => {
    return auth.user()?.id === params.id;
  };

  // Wait for auth to load, then check authentication
  createEffect(() => {
    if (!auth.loading() && !auth.isAuthenticated()) {
      navigate('/login');
    } else if (!auth.loading() && auth.isAuthenticated()) {
      loadProfile();
    }
  });

  return (
    <>
      <Navbar />
      <div style={{
        'max-width': '800px',
        margin: '0 auto',
        padding: '0 1rem',
      }}>
        <Show when={!loading()} fallback={<div style={{ 'text-align': 'center', padding: '2rem', color: theme() === 'dark' ? '#f1f5f9' : '#1e293b' }}>Se încarcă...</div>}>
          {/* Profile Header */}
          <div style={{
            background: theme() === 'dark' ? '#1e293b' : 'white',
            'border-radius': '12px',
            padding: '2rem',
            'margin-bottom': '2rem',
            'box-shadow': theme() === 'dark' 
              ? '0 1px 3px rgba(0,0,0,0.3)' 
              : '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{
              display: 'flex',
              'align-items': 'center',
              gap: '2rem',
              'margin-bottom': '1.5rem',
            }}>
              {/* Avatar */}
              <Show 
                when={profile()?.avatar_url}
                fallback={
                  <div style={{
                    width: '100px',
                    height: '100px',
                    'border-radius': '50%',
                    background: '#1da1f2',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    color: 'white',
                    'font-size': '2.5rem',
                    'font-weight': 'bold',
                  }}>
                    {profile()?.username.charAt(0).toUpperCase()}
                  </div>
                }
              >
                <img 
                  src={`http://localhost:8082${profile()?.avatar_url}`}
                  alt="Avatar"
                  style={{
                    width: '100px',
                    height: '100px',
                    'border-radius': '50%',
                    'object-fit': 'cover',
                    border: '3px solid #667eea',
                  }}
                />
              </Show>

              {/* Profile Info */}
              <div style={{ flex: 1 }}>
                <Show when={!editing()}>
                  <h1 style={{ 
                    'font-size': '1.75rem', 
                    'margin-bottom': '0.5rem',
                    color: theme() === 'dark' ? '#f1f5f9' : '#1e293b',
                  }}>
                    {profile()?.username}
                  </h1>
                  <p style={{ 
                    color: theme() === 'dark' ? '#94a3b8' : '#666', 
                    'margin-bottom': '0.5rem' 
                  }}>
                    {profile()?.bio || 'Fără descriere'}
                  </p>
                  <p style={{ 
                    color: theme() === 'dark' ? '#64748b' : '#999', 
                    'font-size': '0.875rem' 
                  }}>
                    {profile()?.posts_count} postări
                  </p>
                </Show>

                <Show when={editing()}>
                  <input
                    type="text"
                    value={username()}
                    onInput={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      'margin-bottom': '0.75rem',
                      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #ddd',
                      'border-radius': '8px',
                      'font-size': '1rem',
                      background: theme() === 'dark' ? '#0f172a' : '#ffffff',
                      color: theme() === 'dark' ? '#f1f5f9' : '#1e293b',
                    }}
                  />
                  <textarea
                    value={bio()}
                    onInput={(e) => setBio(e.target.value)}
                    placeholder="Bio"
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #ddd',
                      'border-radius': '8px',
                      'font-size': '1rem',
                      'font-family': 'inherit',
                      resize: 'vertical',
                      background: theme() === 'dark' ? '#0f172a' : '#ffffff',
                      color: theme() === 'dark' ? '#f1f5f9' : '#1e293b',
                    }}
                  />
                </Show>
              </div>

              {/* Edit Button */}
              <Show when={isOwnProfile()}>
                <Show when={!editing()}>
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#1da1f2',
                      color: 'white',
                      border: 'none',
                      'border-radius': '24px',
                      cursor: 'pointer',
                      'font-weight': 'bold',
                    }}
                  >
                    ✏️ Editează
                  </button>
                </Show>
                <Show when={editing()}>
                  <div style={{ display: 'flex', gap: '0.5rem', 'flex-direction': 'column' }}>
                    <button
                      onClick={handleSave}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#1da1f2',
                        color: 'white',
                        border: 'none',
                        'border-radius': '20px',
                        cursor: 'pointer',
                      }}
                    >
                      Salvează
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setUsername(profile()?.username);
                        setBio(profile()?.bio || '');
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#ccc',
                        color: '#333',
                        border: 'none',
                        'border-radius': '20px',
                        cursor: 'pointer',
                      }}
                    >
                      Anulează
                    </button>
                  </div>
                </Show>
              </Show>
            </div>
          </div>

          {/* Tab Navigation - Only show on own profile */}
          <Show when={isOwnProfile()}>
            <div style={{
              display: 'flex',
              gap: '1rem',
              'margin-bottom': '2rem',
              'border-bottom': theme() === 'dark' ? '2px solid #334155' : '2px solid #e1e8ed',
            }}>
              <button
                onClick={() => setActiveTab('posts')}
                style={{
                  padding: '1rem 2rem',
                  background: 'transparent',
                  border: 'none',
                  'border-bottom': activeTab() === 'posts' ? '3px solid #667eea' : '3px solid transparent',
                  color: activeTab() === 'posts' ? '#667eea' : (theme() === 'dark' ? '#94a3b8' : '#657786'),
                  'font-weight': activeTab() === 'posts' ? '700' : '500',
                  'font-size': '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                📝 Postări
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                style={{
                  padding: '1rem 2rem',
                  background: 'transparent',
                  border: 'none',
                  'border-bottom': activeTab() === 'settings' ? '3px solid #667eea' : '3px solid transparent',
                  color: activeTab() === 'settings' ? '#667eea' : (theme() === 'dark' ? '#94a3b8' : '#657786'),
                  'font-weight': activeTab() === 'settings' ? '700' : '500',
                  'font-size': '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                ⚙️ Setări
              </button>
            </div>
          </Show>

          {/* Posts Tab */}
          <Show when={activeTab() === 'posts' || !isOwnProfile()}>
            <h2 style={{ 
              'margin-bottom': '1rem', 
              color: theme() === 'dark' ? '#f1f5f9' : '#333' 
            }}>Postări</h2>
            <Show when={posts().length === 0}>
              <div style={{
                'text-align': 'center',
                padding: '3rem',
                background: theme() === 'dark' ? '#1e293b' : 'white',
                'border-radius': '12px',
                color: theme() === 'dark' ? '#94a3b8' : '#666',
              }}>
                Nu există postări încă
              </div>
            </Show>

            <For each={posts()}>
              {(post) => <PostCard post={post} onDelete={loadProfile} />}
            </For>
          </Show>

          {/* Settings Tab */}
          <Show when={activeTab() === 'settings' && isOwnProfile()}>
            <ProfileSettings onUpdate={loadProfile} />
          </Show>
        </Show>
      </div>
    </>
  );
}