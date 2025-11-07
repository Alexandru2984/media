import { createSignal, onMount } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { api } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = createSignal('');
  const [confirmPassword, setConfirmPassword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password() !== confirmPassword()) {
      setError('Parolele nu se potrivesc');
      return;
    }

    if (password().length < 6) {
      setError('Parola trebuie să aibă minimum 6 caractere');
      return;
    }

    const token = searchParams.token;
    if (!token) {
      setError('Token invalid');
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(token, password());
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError('Token invalid sau expirat');
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
      textAlign: 'center',
    },
    icon: {
      fontSize: '48px',
      textAlign: 'center',
      marginBottom: '16px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {success() ? (
          <>
            <div style={styles.icon}>✅</div>
            <div style={styles.success}>
              Parola a fost resetată cu succes!<br />
              Te redirecționăm la autentificare...
            </div>
          </>
        ) : (
          <>
            <h1 style={styles.title}>Setează Parola Nouă</h1>
            <p style={styles.subtitle}>
              Introdu noua ta parolă mai jos
            </p>

            <form onSubmit={handleSubmit} style={styles.form}>
              {error() && <div style={styles.error}>{error()}</div>}
              
              <input
                type="password"
                placeholder="Parola nouă"
                value={password()}
                onInput={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
              />

              <input
                type="password"
                placeholder="Confirmă parola"
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.target.value)}
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
                {loading() ? 'Se salvează...' : 'Resetează Parola'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
