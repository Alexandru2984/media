import { createSignal } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { api } from '../api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.forgotPassword(email());
      setSent(true);
    } catch (err) {
      setError('Email-ul nu a fost găsit');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f7fafc',
      padding: '20px',
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      padding: '40px',
      maxWidth: '500px',
      width: '100%',
    },
    title: {
      fontSize: '28px',
      fontWeight: '700',
      marginBottom: '8px',
      color: '#2d3748',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: '14px',
      color: '#718096',
      marginBottom: '32px',
      textAlign: 'center',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    input: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      fontSize: '14px',
      width: '100%',
    },
    button: {
      padding: '12px',
      borderRadius: '8px',
      border: 'none',
      background: '#667eea',
      color: 'white',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      marginTop: '8px',
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    error: {
      background: '#fff5f5',
      color: '#c53030',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '14px',
      border: '1px solid #feb2b2',
    },
    success: {
      background: '#f0fff4',
      color: '#22543d',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '14px',
      border: '1px solid #9ae6b4',
      marginBottom: '16px',
    },
    backLink: {
      textAlign: 'center',
      marginTop: '16px',
      color: '#667eea',
      textDecoration: 'none',
      fontSize: '14px',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Resetare Parolă</h1>
        <p style={styles.subtitle}>
          Introdu adresa de email și îți vom trimite un link de resetare
        </p>

        {sent() ? (
          <>
            <div style={styles.success}>
              ✅ Email trimis! Verifică inbox-ul pentru instrucțiuni.
            </div>
            <div style={styles.backLink} onClick={() => navigate('/login')}>
              ← Înapoi la autentificare
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {error() && <div style={styles.error}>{error()}</div>}
            
            <input
              type="email"
              placeholder="Email"
              value={email()}
              onInput={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />

            <button
              type="submit"
              disabled={loading()}
              style={{
                ...styles.button,
                ...(loading() ? styles.buttonDisabled : {}),
              }}
            >
              {loading() ? 'Se trimite...' : 'Trimite Link de Resetare'}
            </button>

            <div style={styles.backLink} onClick={() => navigate('/login')}>
              ← Înapoi la autentificare
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
