import { createSignal } from 'solid-js';
import { api } from '../api';

export default function PostCard(props) {
  const [liked, setLiked] = createSignal(props.post.is_liked);
  const [likesCount, setLikesCount] = createSignal(props.post.likes_count);
  const [showComments, setShowComments] = createSignal(false);
  const [comments, setComments] = createSignal([]);
  const [commentText, setCommentText] = createSignal('');

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
    <div style={{
      background: 'white',
      'border-radius': '12px',
      padding: '1.5rem',
      'margin-bottom': '1rem',
      'box-shadow': '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {/* User info */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: '0.75rem',
        'margin-bottom': '1rem',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          'border-radius': '50%',
          background: '#1da1f2',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'white',
          'font-weight': 'bold',
        }}>
          {props.post.user.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ 'font-weight': 'bold', color: '#333' }}>
            {props.post.user.username}
          </div>
          <div style={{ 'font-size': '0.875rem', color: '#666' }}>
            {formatDate(props.post.created_at)}
          </div>
        </div>
      </div>

      {/* Content */}
      <p style={{
        'margin-bottom': '1rem',
        color: '#333',
        'line-height': '1.6',
      }}>
        {props.post.content}
      </p>

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
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        'padding-top': '1rem',
        'border-top': '1px solid #eee',
      }}>
        <button
          onClick={handleLike}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
            color: liked() ? '#e0245e' : '#666',
            'font-size': '1rem',
            transition: 'color 0.2s',
          }}
        >
          {liked() ? '❤️' : '🤍'} {likesCount()}
        </button>
        
        <button
          onClick={loadComments}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            'align-items': 'center',
            gap: '0.5rem',
            color: '#666',
            'font-size': '1rem',
          }}
        >
          💬 {props.post.comments_count}
        </button>
      </div>

      {/* Comments section */}
      {showComments() && (
        <div style={{
          'margin-top': '1rem',
          'padding-top': '1rem',
          'border-top': '1px solid #eee',
        }}>
          {/* Comment form */}
          <form onSubmit={handleComment} style={{ 'margin-bottom': '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={commentText()}
                onInput={(e) => setCommentText(e.target.value)}
                placeholder="Adaugă un comentariu..."
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  'border-radius': '20px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.5rem 1rem',
                  background: '#1da1f2',
                  color: 'white',
                  border: 'none',
                  'border-radius': '20px',
                  cursor: 'pointer',
                }}
              >
                Trimite
              </button>
            </div>
          </form>

          {/* Comments list */}
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem' }}>
            {comments().map((comment) => (
              <div style={{
                background: '#f7f9fa',
                padding: '0.75rem',
                'border-radius': '8px',
              }}>
                <div style={{
                  'font-weight': 'bold',
                  color: '#333',
                  'margin-bottom': '0.25rem',
                  'font-size': '0.875rem',
                }}>
                  {comment.user.username}
                </div>
                <div style={{ color: '#333' }}>{comment.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}