import { createSignal, Show, createMemo } from 'solid-js';
import { api } from '../api';
import { useTheme } from '../ThemeContext';

export default function ProfileSettings(props) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = createSignal('avatar');
  
  // Avatar upload state
  const [avatarFile, setAvatarFile] = createSignal(null);
  const [avatarPreview, setAvatarPreview] = createSignal(null);
  const [uploadingAvatar, setUploadingAvatar] = createSignal(false);
  
  // Change password state
  const [oldPassword, setOldPassword] = createSignal('');
  const [newPassword, setNewPassword] = createSignal('');
  const [confirmPassword, setConfirmPassword] = createSignal('');
  const [changingPassword, setChangingPassword] = createSignal(false);
  
  // Change email state
  const [newEmail, setNewEmail] = createSignal('');
  const [emailPassword, setEmailPassword] = createSignal('');
  const [changingEmail, setChangingEmail] = createSignal(false);
  
  // Messages
  const [message, setMessage] = createSignal({ type: '', text: '' });

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  // Reactive styles using createMemo
  const styles = createMemo(() => ({
    container: {
      'border-radius': '16px',
      overflow: 'hidden',
      'margin-bottom': '2rem',
    },
    tabs: {
      display: 'flex',
      gap: '8px',
      'margin-bottom': '16px',
      padding: '8px',
      background: theme() === 'dark' ? 'rgba(15, 23, 42, 0.5)' : 'rgba(241, 245, 249, 0.5)',
      'border-radius': '12px',
    },
    tab: (isActive) => ({
      flex: 1,
      padding: '12px 20px',
      background: isActive 
        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        : 'transparent',
      border: 'none',
      'border-radius': '8px',
      color: isActive ? '#ffffff' : (theme() === 'dark' ? '#cbd5e1' : '#64748b'),
      'font-weight': isActive ? '700' : '500',
      'font-size': '15px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      'box-shadow': isActive ? '0 4px 12px rgba(102, 126, 234, 0.4)' : 'none',
    }),
    contentWrapper: {
      background: theme() === 'dark' ? '#1e293b' : '#ffffff',
      'border-radius': '12px',
      padding: '32px',
      'box-shadow': theme() === 'dark' 
        ? '0 4px 12px rgba(0,0,0,0.4)' 
        : '0 4px 12px rgba(0,0,0,0.08)',
    },
    content: {
      'max-width': '600px',
    },
    section: {
      'margin-bottom': '24px',
    },
    sectionTitle: {
      'font-size': '18px',
      'font-weight': '700',
      color: theme() === 'dark' ? '#f1f5f9' : '#1e293b',
      'margin-bottom': '20px',
      'padding-bottom': '12px',
      'border-bottom': theme() === 'dark' ? '2px solid #334155' : '2px solid #e2e8f0',
    },
    form: {
      display: 'flex',
      'flex-direction': 'column',
      gap: '20px',
    },
    inputGroup: {
      display: 'flex',
      'flex-direction': 'column',
      gap: '8px',
    },
    label: {
      'font-size': '14px',
      'font-weight': '600',
      color: theme() === 'dark' ? '#cbd5e1' : '#475569',
    },
    input: {
      width: '100%',
      padding: '12px 16px',
      border: theme() === 'dark' ? '2px solid #334155' : '2px solid #e2e8f0',
      'border-radius': '8px',
      'font-size': '15px',
      'font-family': 'inherit',
      transition: 'all 0.2s ease',
      'box-sizing': 'border-box',
      background: theme() === 'dark' ? '#0f172a' : '#ffffff',
      color: theme() === 'dark' ? '#f1f5f9' : '#1e293b',
    },
    fileInput: {
      display: 'none',
    },
    fileLabel: {
      display: 'inline-block',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      'border-radius': '10px',
      'font-size': '15px',
      'font-weight': '600',
      cursor: 'pointer',
      'text-align': 'center',
      transition: 'all 0.2s ease',
      'user-select': 'none',
      'box-shadow': '0 4px 12px rgba(102, 126, 234, 0.3)',
    },
    preview: {
      width: '150px',
      height: '150px',
      'border-radius': '50%',
      'object-fit': 'cover',
      border: '4px solid #667eea',
      margin: '16px 0',
      'box-shadow': '0 4px 12px rgba(102, 126, 234, 0.3)',
    },
    button: {
      width: '100%',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      border: 'none',
      'border-radius': '10px',
      'font-size': '15px',
      'font-weight': '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      'box-shadow': '0 4px 12px rgba(102, 126, 234, 0.3)',
    },
    buttonDisabled: {
      width: '100%',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      border: 'none',
      'border-radius': '10px',
      'font-size': '15px',
      'font-weight': '600',
      cursor: 'not-allowed',
      transition: 'all 0.2s ease',
      'box-shadow': '0 4px 12px rgba(102, 126, 234, 0.3)',
      opacity: 0.6,
    },
    message: (type) => ({
      padding: '14px 18px',
      'border-radius': '12px',
      'font-size': '14px',
      'font-weight': '500',
      'margin-bottom': '24px',
      background: type === 'success' ? '#d1fae5' : '#fed7d7',
      color: type === 'success' ? '#047857' : '#c53030',
      border: `2px solid ${type === 'success' ? '#34d399' : '#f87171'}`,
    }),
    hint: {
      'font-size': '13px',
      color: theme() === 'dark' ? '#64748b' : '#94a3b8',
      'margin-top': '6px',
    },
  }));

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = async (e) => {
    e.preventDefault();
    if (!avatarFile()) {
      showMessage('error', 'Te rog selectează o imagine');
      return;
    }

    try {
      setUploadingAvatar(true);
      const result = await api.uploadAvatar(avatarFile());
      showMessage('success', 'Avatar actualizat cu succes!');
      setAvatarFile(null);
      setAvatarPreview(null);
      if (props.onUpdate) props.onUpdate();
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      showMessage('error', 'Nu s-a putut încărca imaginea');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword() !== confirmPassword()) {
      showMessage('error', 'Parolele nu se potrivesc');
      return;
    }

    if (newPassword().length < 6) {
      showMessage('error', 'Parola trebuie să aibă minim 6 caractere');
      return;
    }

    try {
      setChangingPassword(true);
      await api.changePassword(oldPassword(), newPassword());
      showMessage('success', 'Parola a fost schimbată cu succes!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Failed to change password:', error);
      showMessage('error', 'Parola veche este incorectă');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    
    if (!newEmail() || !emailPassword()) {
      showMessage('error', 'Completează toate câmpurile');
      return;
    }

    try {
      setChangingEmail(true);
      await api.changeEmail(newEmail(), emailPassword());
      showMessage('success', 'Email de verificare trimis! Verifică inbox-ul.');
      setNewEmail('');
      setEmailPassword('');
    } catch (error) {
      console.error('Failed to change email:', error);
      showMessage('error', 'Email-ul există deja sau parola este incorectă');
    } finally {
      setChangingEmail(false);
    }
  };

  return (
    <div style={styles().container}>
      <div style={styles().tabs}>
        <button 
          style={styles().tab(activeTab() === 'avatar')}
          onClick={() => setActiveTab('avatar')}
        >
          🖼️ Avatar
        </button>
        <button 
          style={styles().tab(activeTab() === 'password')}
          onClick={() => setActiveTab('password')}
        >
          🔒 Parolă
        </button>
        <button 
          style={styles().tab(activeTab() === 'email')}
          onClick={() => setActiveTab('email')}
        >
          📧 Email
        </button>
      </div>

      <div style={styles().contentWrapper}>
        <div style={styles().content}>
          <Show when={message().text}>
            <div style={styles().message(message().type)}>
              {message().text}
            </div>
          </Show>

          {/* Avatar Upload Tab */}
          <Show when={activeTab() === 'avatar'}>
            <div style={styles().section}>
              <h3 style={styles().sectionTitle}>
                Schimbă Poza de Profil
              </h3>
              <form style={styles().form} onSubmit={handleAvatarUpload}>
                <Show when={avatarPreview()}>
                  <img src={avatarPreview()} alt="Preview" style={styles().preview} />
                </Show>
                
                <div style={styles().inputGroup}>
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/*"
                    style={styles().fileInput}
                    onChange={handleAvatarChange}
                  />
                  <label for="avatar-upload" style={styles().fileLabel}>
                    {avatarFile() ? '✅ Imagine selectată' : '📁 Selectează Imagine'}
                  </label>
                  <div style={styles().hint}>
                    Format acceptat: JPG, PNG, GIF, WEBP (max 5MB)
                  </div>
                </div>

                <Show when={avatarFile()}>
                  <button 
                    type="submit" 
                    style={uploadingAvatar() ? styles().buttonDisabled : styles().button}
                    disabled={uploadingAvatar()}
                  >
                    {uploadingAvatar() ? '⏳ Se încarcă...' : '✨ Actualizează Avatar'}
                  </button>
                </Show>
              </form>
            </div>
          </Show>

          {/* Change Password Tab */}
          <Show when={activeTab() === 'password'}>
            <div style={styles().section}>
              <h3 style={styles().sectionTitle}>
                Schimbă Parola
              </h3>
              <form style={styles().form} onSubmit={handlePasswordChange}>
                <div style={styles().inputGroup}>
                  <label style={styles().label}>Parola Veche</label>
                  <input
                    type="password"
                    style={styles().input}
                    value={oldPassword()}
                    onInput={(e) => setOldPassword(e.target.value)}
                    required
                    placeholder="Introdu parola veche"
                  />
                </div>

                <div style={styles().inputGroup}>
                  <label style={styles().label}>Parola Nouă</label>
                  <input
                    type="password"
                    style={styles().input}
                    value={newPassword()}
                    onInput={(e) => setNewPassword(e.target.value)}
                    required
                    minLength="6"
                    placeholder="Minim 6 caractere"
                  />
                  <div style={styles().hint}>
                    Minim 6 caractere
                  </div>
                </div>

                <div style={styles().inputGroup}>
                  <label style={styles().label}>Confirmă Parola Nouă</label>
                  <input
                    type="password"
                    style={styles().input}
                    value={confirmPassword()}
                    onInput={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repetă parola nouă"
                  />
                </div>

                <button 
                  type="submit" 
                  style={changingPassword() ? styles().buttonDisabled : styles().button}
                  disabled={changingPassword()}
                >
                  {changingPassword() ? '⏳ Se actualizează...' : '✅ Schimbă Parola'}
                </button>
              </form>
            </div>
          </Show>

          {/* Change Email Tab */}
          <Show when={activeTab() === 'email'}>
            <div style={styles().section}>
              <h3 style={styles().sectionTitle}>
                Schimbă Email-ul
              </h3>
              <form style={styles().form} onSubmit={handleEmailChange}>
                <div style={styles().inputGroup}>
                  <label style={styles().label}>Email Nou</label>
                  <input
                    type="email"
                    style={styles().input}
                    value={newEmail()}
                    onInput={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="exemplu@email.com"
                  />
                  <div style={styles().hint}>
                    Vei primi un email de confirmare la noua adresă
                  </div>
                </div>

                <div style={styles().inputGroup}>
                  <label style={styles().label}>Parola Ta</label>
                  <input
                    type="password"
                    style={styles().input}
                    value={emailPassword()}
                    onInput={(e) => setEmailPassword(e.target.value)}
                    required
                    placeholder="Parola pentru confirmare"
                  />
                  <div style={styles().hint}>
                    Pentru confirmare
                  </div>
                </div>

                <button 
                  type="submit" 
                  style={changingEmail() ? styles().buttonDisabled : styles().button}
                  disabled={changingEmail()}
                >
                  {changingEmail() ? '⏳ Se trimite...' : '📨 Trimite Email de Verificare'}
                </button>
              </form>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
