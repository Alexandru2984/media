import { createSignal, onMount, Show, For, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import Navbar from '../components/Navbar';
import CreatePost from '../components/CreatePost';
import PostCard from '../components/PostCard';

export default function Home() {
  const [posts, setPosts] = createSignal([]);
  const [loading, setLoading] = createSignal(true);
  const auth = useAuth();
  const navigate = useNavigate();

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await api.getPosts(20, 0);
      setPosts(data);
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Wait for auth to load, then check authentication
  createEffect(() => {
    if (!auth.loading() && !auth.isAuthenticated()) {
      navigate('/login');
    } else if (!auth.loading() && auth.isAuthenticated()) {
      loadPosts();
    }
  });

  const styles = {
    container: {
      minHeight: '100vh',
      paddingBottom: '40px',
    },
    content: {
      maxWidth: '680px',
      margin: '0 auto',
      padding: '24px 16px',
    },
    loading: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '60px 0',
    },
    loadingContent: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
    },
    spinner: {
      width: '48px',
      height: '48px',
      animation: 'spin 1s linear infinite',
    },
    loadingText: {
      fontSize: '16px',
      fontWeight: '500',
      color: '#718096',
    },
    emptyState: {
      background: '#ffffff',
      borderRadius: '20px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      padding: '80px 40px',
      textAlign: 'center',
      border: '2px dashed #e2e8f0',
    },
    emptyIcon: {
      fontSize: '80px',
      marginBottom: '24px',
      opacity: 0.8,
    },
    emptyTitle: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#2d3748',
      marginBottom: '12px',
    },
    emptyText: {
      fontSize: '16px',
      color: '#718096',
      lineHeight: '1.6',
    },
    postsContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
  };

  return (
    <div style={styles.container} class="home-page">
      <Navbar />
      <div style={styles.content}>
        <CreatePost onPostCreated={loadPosts} />

        <Show when={loading()}>
          <div style={styles.loading}>
            <div style={styles.loadingContent}>
              <svg style={styles.spinner} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle style={{opacity: 0.15}} cx="12" cy="12" r="10" stroke="#667eea" stroke-width="4"></circle>
                <path style={{opacity: 0.75}} fill="#667eea" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p style={styles.loadingText} class="loading-text">✨ Se încarcă postările...</p>
            </div>
          </div>
        </Show>

        <Show when={!loading() && posts().length === 0}>
          <div style={styles.emptyState} class="empty-state">
            <div style={styles.emptyIcon}>📝</div>
            <h3 style={styles.emptyTitle} class="empty-title">
              Nu există încă postări
            </h3>
            <p style={styles.emptyText} class="empty-text">
              Fii primul care postează ceva interesant!<br/>
              Distribuie gândurile tale cu comunitatea.
            </p>
          </div>
        </Show>

        <div style={{
          display: 'block',
          width: '100%',
        }}>
          <For each={posts()}>
            {(post) => <PostCard post={post} />}
          </For>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        body.dark .home-page {
          background: linear-gradient(180deg, #1a202c 0%, #2d3748 100%);
        }
        
        body.dark .loading-text {
          color: #a0aec0;
        }
        
        body.dark .empty-state {
          background: #2d3748 !important;
          border-color: #4a5568 !important;
        }
        
        body.dark .empty-title {
          color: #e2e8f0 !important;
        }
        
        body.dark .empty-text {
          color: #a0aec0 !important;
        }
      `}</style>
    </div>
  );
}