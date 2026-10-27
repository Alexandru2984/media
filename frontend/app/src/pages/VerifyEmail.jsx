import { createSignal, onMount } from 'solid-js';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { api } from '../api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = createSignal('verifying'); // verifying, success, error
  const [message, setMessage] = createSignal('');

  onMount(async () => {
    const token = searchParams.token;
    if (!token) {
      setStatus('error');
      setMessage('Token invalid');
      return;
    }

    try {
      await api.verifyEmail(token);
      setStatus('success');
      setMessage('Email verificat cu succes! Te redirecționăm...');
      setTimeout(() => navigate('/'), 2000);
    } catch (error) {
      setStatus('error');
      setMessage('Token invalid sau expirat');
    }
  });

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
      textAlign: 'center',
    },
    icon: {
      fontSize: '64px',
      marginBottom: '20px',
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      marginBottom: '16px',
      color: '#2d3748',
    },
    message: {
      fontSize: '16px',
      color: '#718096',
      marginBottom: '24px',
    },
    button: {
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      background: '#667eea',
      color: 'white',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      textDecoration: 'none',
      display: 'inline-block',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status() === 'verifying' && (
          <>
            <div style={styles.icon}>⏳</div>
            <h1 style={styles.title}>Se verifică...</h1>
            <p style={styles.message}>Te rugăm să aștepți</p>
          </>
        )}

        {status() === 'success' && (
          <>
            <div style={styles.icon}>✅</div>
            <h1 style={styles.title}>Verificare Reușită!</h1>
            <p style={styles.message}>{message()}</p>
          </>
        )}

        {status() === 'error' && (
          <>
            <div style={styles.icon}>❌</div>
            <h1 style={styles.title}>Eroare</h1>
            <p style={styles.message}>{message()}</p>
            <a href="/" style={styles.button}>
              Înapoi la pagina principală
            </a>
          </>
        )}
      </div>
    </div>
  );
}
