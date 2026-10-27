import { createSignal, Show } from 'solid-js';
import { api } from '../api';

export default function CreatePost(props) {
  const [content, setContent] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [imageFile, setImageFile] = createSignal(null);
  const [imagePreview, setImagePreview] = createSignal(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Imaginea este prea mare! Max 10MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content().trim()) return;

    setLoading(true);
    try {
      let imageUrl = null;

      // Upload image first if exists
      if (imageFile()) {
        const result = await api.uploadPostImage(imageFile());
        imageUrl = result.image_url;
      }

      await api.createPost(content(), imageUrl);
      setContent('');
      setImageFile(null);
      setImagePreview(null);
      if (props.onPostCreated) {
        props.onPostCreated();
      }
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('Nu s-a putut crea postarea. Te rog să încerci din nou.');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      background: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      padding: '24px',
      marginBottom: '24px',
      border: '1px solid #f0f0f0',
    },
    textarea: {
      width: '100%',
      padding: '16px',
      borderRadius: '12px',
      border: '2px solid #e2e8f0',
      fontSize: '15px',
      fontFamily: 'inherit',
      resize: 'vertical',
      minHeight: '120px',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxSizing: 'border-box',
      lineHeight: '1.6',
      color: '#2d3748',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '16px',
    },
    charCount: {
      fontSize: '13px',
      color: '#718096',
    },
    charCountOver: {
      fontSize: '13px',
      color: '#e53e3e',
      fontWeight: '600',
    },
    button: {
      padding: '12px 28px',
      borderRadius: '10px',
      border: 'none',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    buttonDisabled: {
      padding: '12px 28px',
      borderRadius: '10px',
      border: 'none',
      background: '#cbd5e0',
      color: '#a0aec0',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'not-allowed',
      opacity: 0.6,
    },
    spinner: {
      animation: 'spin 1s linear infinite',
      width: '16px',
      height: '16px',
    },
    imagePreview: {
      position: 'relative',
      marginTop: '16px',
      borderRadius: '12px',
      overflow: 'hidden',
      width: '300px',
      height: '250px',
    },
    previewImg: {
      width: '300px',
      height: '250px',
      objectFit: 'cover',
      display: 'block',
      borderRadius: '12px',
    },
    removeBtn: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      border: 'none',
      borderRadius: '50%',
      width: '32px',
      height: '32px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      fontWeight: 'bold',
      transition: 'background 0.2s',
    },
    imageBtn: {
      padding: '8px 16px',
      borderRadius: '8px',
      border: '2px solid #667eea',
      background: 'transparent',
      color: '#667eea',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    fileInput: {
      display: 'none',
    },
  };

  return (
    <div style={styles.container} class="create-post-card">
      <form onSubmit={handleSubmit}>
        <textarea
          value={content()}
          onInput={(e) => setContent(e.target.value)}
          placeholder="Ce gândești? Distribuie cu comunitatea..."
          style={styles.textarea}
          class="create-post-textarea"
          onFocus={(e) => {
            e.target.style.borderColor = '#667eea';
            e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e2e8f0';
            e.target.style.boxShadow = 'none';
          }}
        />

        <Show when={imagePreview()}>
          <div style={styles.imagePreview}>
            <img src={imagePreview()} alt="Preview" style={styles.previewImg} />
            <button
              type="button"
              style={styles.removeBtn}
              onClick={removeImage}
              onMouseOver={(e) => e.target.style.background = 'rgba(0,0,0,0.9)'}
              onMouseOut={(e) => e.target.style.background = 'rgba(0,0,0,0.7)'}
            >
              ✕
            </button>
          </div>
        </Show>

        <div style={styles.footer}>
          <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            <input
              type="file"
              id="post-image"
              accept="image/*"
              style={styles.fileInput}
              onChange={handleImageChange}
            />
            <label
              for="post-image"
              style={styles.imageBtn}
              onMouseOver={(e) => {
                e.target.style.background = '#667eea';
                e.target.style.color = 'white';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#667eea';
              }}
            >
              🖼️ {imageFile() ? 'Schimbă' : 'Adaugă'} Imagine
            </label>
            <div style={content().length > 500 ? styles.charCountOver : styles.charCount}>
              {content().length > 0 && `${content().length} caractere`}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading() || !content().trim() || content().length > 500}
            style={loading() || !content().trim() || content().length > 500 ? styles.buttonDisabled : styles.button}
            onMouseOver={(e) => {
              if (!loading() && content().trim() && content().length <= 500) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading() && content().trim() && content().length <= 500) {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            {loading() ? (
              <>
                <svg style={styles.spinner} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle style={{opacity: 0.25}} cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path style={{opacity: 0.75}} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Postează...
              </>
            ) : (
              <>📝 Postează</>
            )}
          </button>
        </div>
      </form>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        body.dark .create-post-card {
          background: #2d3748 !important;
          border-color: #4a5568 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }

        body.dark .create-post-textarea {
          background: #1a202c !important;
          border-color: #4a5568 !important;
          color: #e2e8f0 !important;
        }

        body.dark .create-post-textarea::placeholder {
          color: #718096;
        }

        body.dark .create-post-textarea:focus {
          border-color: #667eea !important;
        }
      `}</style>
    </div>
  );
}