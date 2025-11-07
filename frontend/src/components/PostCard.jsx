import { createSignal, Show, For, createMemo } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';

export default function PostCard(props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [liked, setLiked] = createSignal(props.post.is_liked);
  const [likesCount, setLikesCount] = createSignal(props.post.likes_count);
  const [showComments, setShowComments] = createSignal(false);
  const [comments, setComments] = createSignal([]);
  const [commentText, setCommentText] = createSignal('');
  const [editing, setEditing] = createSignal(false);
  const [editContent, setEditContent] = createSignal(props.post.content);
  const [editingCommentId, setEditingCommentId] = createSignal(null);
  const [editCommentText, setEditCommentText] = createSignal('');

  const isOwn = () => auth.user()?.id === props.post.user.id;

  // Make styles reactive using createMemo
  const styles = createMemo(() => ({
    card: {
      background: theme() === 'dark' ? '#1e293b' : '#ffffff',
      borderRadius: '12px',
      boxShadow: theme() === 'dark' 
        ? '0 2px 4px rgba(0,0,0,0.3)'
        : '0 2px 4px rgba(0,0,0,0.1)',
      padding: '20px',
      marginBottom: '16px',
      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '16px',
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      cursor: 'pointer',
      flex: 1,
    },
    avatar: {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: '600',
      fontSize: '16px',
    },
    userDetails: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    username: {
      fontWeight: '600',
      fontSize: '15px',
      color: theme() === 'dark' ? '#f1f5f9' : '#1a202c',
    },
    timestamp: {
      fontSize: '13px',
      color: theme() === 'dark' ? '#94a3b8' : '#718096',
    },
    actions: {
      display: 'flex',
      gap: '8px',
    },
    editBtn: {
      padding: '6px 12px',
      borderRadius: '8px',
      border: 'none',
      background: '#4299e1',
      color: 'white',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    deleteBtn: {
      padding: '6px 12px',
      borderRadius: '8px',
      border: 'none',
      background: '#e53e3e',
      color: 'white',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    content: {
      fontSize: '15px',
      lineHeight: '1.6',
      color: theme() === 'dark' ? '#e2e8f0' : '#2d3748',
      marginBottom: '16px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    postImage: {
      width: '300px',
      height: '250px',
      borderRadius: '8px',
      marginTop: '8px',
      marginBottom: '12px',
      objectFit: 'cover',
      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
      display: 'block',
    },
    textarea: {
      width: '100%',
      padding: '12px',
      borderRadius: '8px',
      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
      fontSize: '14px',
      fontFamily: 'inherit',
      resize: 'vertical',
      minHeight: '80px',
      background: theme() === 'dark' ? '#0f172a' : '#ffffff',
      color: theme() === 'dark' ? '#f1f5f9' : '#1a202c',
    },
    buttonGroup: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px',
    },
    saveBtn: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: '#667eea',
      color: 'white',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    cancelBtn: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: theme() === 'dark' ? '#334155' : '#e2e8f0',
      color: theme() === 'dark' ? '#f1f5f9' : '#4a5568',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    interactionBar: {
      display: 'flex',
      gap: '12px',
      paddingTop: '16px',
      marginTop: '12px',
      borderTop: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    },
    likeBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: theme() === 'dark' ? '#334155' : '#f7fafc',
      color: theme() === 'dark' ? '#cbd5e1' : '#4a5568',
      fontSize: '14px',
      cursor: 'pointer',
    },
    likeBtnActive: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: '#fc8181',
      color: 'white',
      fontSize: '14px',
      cursor: 'pointer',
    },
    commentBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: theme() === 'dark' ? '#334155' : '#f7fafc',
      color: theme() === 'dark' ? '#cbd5e1' : '#4a5568',
      fontSize: '14px',
      cursor: 'pointer',
    },
    commentsSection: {
      marginTop: '16px',
      paddingTop: '16px',
      borderTop: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
    },
    commentForm: {
      marginBottom: '16px',
    },
    commentInput: {
      width: '100%',
      padding: '10px 12px',
      borderRadius: '8px',
      border: theme() === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
      fontSize: '14px',
      fontFamily: 'inherit',
      background: theme() === 'dark' ? '#0f172a' : '#ffffff',
      color: theme() === 'dark' ? '#f1f5f9' : '#1a202c',
    },
    commentSubmit: {
      marginTop: '8px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: '#667eea',
      color: 'white',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    commentItem: {
      background: theme() === 'dark' ? '#0f172a' : '#f7fafc',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
    },
    commentHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'start',
      marginBottom: '8px',
    },
    commentUser: {
      fontWeight: '600',
      fontSize: '14px',
      color: theme() === 'dark' ? '#f1f5f9' : '#2d3748',
      cursor: 'pointer',
    },
    commentTime: {
      fontSize: '12px',
      color: theme() === 'dark' ? '#64748b' : '#a0aec0',
      marginLeft: '8px',
    },
    commentActions: {
      display: 'flex',
      gap: '8px',
    },
    commentActionBtn: {
      padding: '4px 8px',
      fontSize: '12px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: '#4299e1',
      fontWeight: '500',
      textDecoration: 'underline',
    },
    commentContent: {
      fontSize: '14px',
      color: theme() === 'dark' ? '#cbd5e1' : '#4a5568',
      lineHeight: '1.5',
      wordBreak: 'break-word',
    },
  }));

  const handleLike = async () => {
    try {
      const result = await api.likePost(props.post.id);
      setLiked(result.liked);
      setLikesCount(result.liked ? likesCount() + 1 : likesCount() - 1);
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  };

  const loadComments = async () => {
    if (!showComments()) {
      try {
        const data = await api.getComments(props.post.id);
        setComments(data);
      } catch (error) {
        console.error('Failed to load comments:', error);
      }
    }
    setShowComments(!showComments());
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText().trim()) return;

    try {
      await api.createComment(props.post.id, commentText());
      setCommentText('');
      const data = await api.getComments(props.post.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleEditPost = async () => {
    try {
      await api.updatePost(props.post.id, editContent(), props.post.image_url);
      setEditing(false);
      if (props.onUpdate) props.onUpdate();
    } catch (error) {
      console.error('Failed to update post:', error);
      alert('Nu s-a putut actualiza postarea');
    }
  };

  const handleDeletePost = async () => {
    if (!confirm('Sigur vrei să ștergi postarea?')) return;
    
    try {
      await api.deletePost(props.post.id);
      if (props.onDelete) props.onDelete();
    } catch (error) {
      console.error('Failed to delete post:', error);
      alert('Nu s-a putut șterge postarea');
    }
  };

  const handleEditComment = async (commentId) => {
    try {
      await api.updateComment(commentId, editCommentText());
      setEditingCommentId(null);
      const data = await api.getComments(props.post.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to update comment:', error);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm('Sigur vrei să ștergi comentariul?')) return;
    
    try {
      await api.deleteComment(commentId);
      const data = await api.getComments(props.post.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'acum câteva secunde';
    if (diff < 3600) return `acum ${Math.floor(diff / 60)} minute`;
    if (diff < 86400) return `acum ${Math.floor(diff / 3600)} ore`;
    return `acum ${Math.floor(diff / 86400)} zile`;
  };

  return (
    <div style={styles().card}>
      {/* User info */}
      <div style={styles().header}>
        <div style={styles().userInfo}
             onClick={() => navigate(`/profile/${props.post.user.id}`)}
        >
          <div style={styles().avatar}>
            {props.post.user.username.charAt(0).toUpperCase()}
          </div>
          <div style={styles().userDetails}>
            <div style={styles().username}>
              {props.post.user.username}
            </div>
            <div style={styles().timestamp}>
              {formatDate(props.post.created_at)}
            </div>
          </div>
        </div>

        {/* Edit/Delete buttons */}
        <Show when={isOwn()}>
          <div style={styles().actions}>
            <Show when={!editing()}>
              <button
                onClick={() => setEditing(true)}
                style={styles().editBtn}
                class="post-edit-btn"
                onMouseOver={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(49, 130, 206, 0.2)';
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 4px rgba(49, 130, 206, 0.1)';
                }}
              >
                ✏️ Editează
              </button>
              <button
                onClick={handleDeletePost}
                style={styles().deleteBtn}
              >
                🗑️ Șterge
              </button>
            </Show>
          </div>
        </Show>
      </div>

      {/* Content */}
      <Show when={!editing()}>
        <p style={styles().content}>
          {props.post.content}
        </p>
        <Show when={props.post.image_url}>
          <img 
            src={`http://localhost:8082${props.post.image_url}`} 
            alt="Post image" 
            style={styles().postImage}
          />
        </Show>
      </Show>

      <Show when={editing()}>
        <textarea
          value={editContent()}
          onInput={(e) => setEditContent(e.target.value)}
          rows="4"
          style={styles().textarea}
        />
        <div style={styles().buttonGroup}>
          <button
            onClick={handleEditPost}
            style={styles().saveBtn}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            💾 Salvează
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setEditContent(props.post.content);
            }}
            style={styles().cancelBtn}
            onMouseOver={(e) => e.target.style.background = '#cbd5e0'}
            onMouseOut={(e) => e.target.style.background = '#e2e8f0'}
          >
            ✖️ Anulează
          </button>
        </div>
      </Show>

      {/* Image */}
      {props.post.image_url && (
        <img 
          src={props.post.image_url} 
          alt="Post image" 
          style={{
            width: '100%',
            'border-radius': '8px',
            'margin-bottom': '1rem',
          }}
        />
      )}

      {/* Actions */}
      <div style={styles().interactionBar}>
        <button
          onClick={handleLike}
          style={liked() ? styles.likeBtnActive : styles.likeBtn}
        >
          {liked() ? '❤️' : '🤍'} {likesCount()}
        </button>
        
        <button
          onClick={loadComments}
          style={styles().commentBtn}
        >
          💬 {props.post.comments_count}
        </button>
      </div>

      {/* Comments section */}
      <Show when={showComments()}>
        <div style={styles().commentsSection}>
          {/* Comment form */}
          <form onSubmit={handleComment} style={styles().commentForm}>
            <input
              type="text"
              value={commentText()}
              onInput={(e) => setCommentText(e.target.value)}
              placeholder="Scrie un comentariu..."
              style={styles().commentInput}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
            <button
              type="submit"
              style={styles().commentSubmit}
              onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
            >
              📤 Trimite
            </button>
          </form>

          {/* Comments list */}
          <For each={comments()}>
            {(comment) => (
              <div style={styles().commentItem}>
                <Show when={editingCommentId() !== comment.id}>
                  <div style={styles().commentHeader}>
                    <div>
                      <span 
                        style={styles().commentUser}
                        onClick={() => navigate(`/profile/${comment.user.id}`)}
                      >
                        {comment.user.username}
                      </span>
                      <span style={styles().commentTime}>
                        · {formatDate(comment.created_at)}
                      </span>
                    </div>
                    
                    <Show when={auth.user()?.id === comment.user.id}>
                      <div style={styles().commentActions}>
                        <button
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditCommentText(comment.content);
                          }}
                          style={styles().commentActionBtn}
                        >
                          ✏️ Editează
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          style={{...styles.commentActionBtn, color: '#e53e3e'}}
                        >
                          🗑️ Șterge
                        </button>
                      </div>
                    </Show>
                  </div>
                  <div style={styles().commentContent}>
                    {comment.content}
                  </div>
                </Show>

                <Show when={editingCommentId() === comment.id}>
                  <div>
                    <input
                      type="text"
                      value={editCommentText()}
                      onInput={(e) => setEditCommentText(e.target.value)}
                      style={{...styles.commentInput, marginBottom: '8px'}}
                    />
                    <div style={styles().buttonGroup}>
                      <button
                        onClick={handleEditComment}
                        style={{...styles.saveBtn, padding: '8px 16px', fontSize: '13px'}}
                      >
                        💾 Salvează
                      </button>
                      <button
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditCommentText('');
                        }}
                        style={{...styles.cancelBtn, padding: '8px 16px', fontSize: '13px'}}
                      >
                        ✖️ Anulează
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}