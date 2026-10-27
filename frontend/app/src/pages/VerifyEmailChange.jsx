import { createSignal, onMount } from 'solid-js';
import { useSearchParams, useNavigate } from '@solidjs/router';
import { api } from '../api';

export default function VerifyEmailChange() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = createSignal('loading');
  const [message, setMessage] = createSignal('');

  onMount(async () => {
    const token = searchParams.token;

    if (!token) {
      setStatus('error');
      setMessage('Token lipsă');
      return;
    }

    try {
      await api.verifyEmailChange(token);
      setStatus('success');
      setMessage('Email actualizat cu succes! Te poți loga cu noua adresă.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      setStatus('error');
      setMessage('Token invalid sau expirat');
      console.error('Verification failed:', error);
    }
  });

  return (
    <div style={{
      'min-height': '100vh',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
    }}>
      <div style={{
        background: 'white',
        padding: '3rem',
        'border-radius': '20px',
        'box-shadow': '0 20px 60px rgba(0,0,0,0.3)',
        'text-align': 'center',
        'max-width': '500px',
        width: '100%',
      }}>
        {status() === 'loading' && (
          <>
            <div style={{ 'font-size': '4rem', 'margin-bottom': '1rem' }}>⏳</div>
            <h1 style={{ 'margin-bottom': '1rem', color: '#1e293b' }}>
              Se verifică...
            </h1>
            <p style={{ color: '#64748b' }}>
              Te rugăm să aștepți
            </p>
          </>
        )}

        {status() === 'success' && (
          <>
            <div style={{ 'font-size': '4rem', 'margin-bottom': '1rem' }}>✅</div>
            <h1 style={{ 'margin-bottom': '1rem', color: '#059669' }}>
              Email actualizat!
            </h1>
            <p style={{ color: '#64748b' }}>
              {message()}
            </p>
          </>
        )}

        {status() === 'error' && (
          <>
            <div style={{ 'font-size': '4rem', 'margin-bottom': '1rem' }}>❌</div>
            <h1 style={{ 'margin-bottom': '1rem', color: '#dc2626' }}>
              Eroare
            </h1>
            <p style={{ color: '#64748b', 'margin-bottom': '2rem' }}>
              {message()}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '1rem 2rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                'border-radius': '12px',
                'font-size': '1rem',
                'font-weight': '600',
                cursor: 'pointer',
              }}
            >
              Înapoi la Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
