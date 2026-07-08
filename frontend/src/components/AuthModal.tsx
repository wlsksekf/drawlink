import { useState } from 'react';
import { supabase } from '../supabase';
import { Sparkles, Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
}

type AuthView = 'login' | 'signup' | 'verify_email' | 'reset_password' | 'reset_sent';

export function AuthModal({ onClose }: AuthModalProps) {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const clearError = () => setError('');

  // ────────────────────────────────────────────────────────────────
  // Google OAuth
  // ────────────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || '구글 로그인 중 오류가 발생했습니다.');
      setIsGoogleLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Email Sign In
  // ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setError('이메일 인증이 완료되지 않았습니다. 받은편지함을 확인해 주세요.');
        } else if (error.message.toLowerCase().includes('invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          throw error;
        }
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Email Sign Up (with email verification)
  // ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}`,
        },
      });
      if (error) throw error;
      setView('verify_email');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('already registered')) {
        setError('이미 등록된 이메일입니다. 로그인을 시도해 주세요.');
      } else {
        setError(err.message || '회원가입 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Password Reset
  // ────────────────────────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
      setView('reset_sent');
    } catch (err: any) {
      setError(err.message || '비밀번호 재설정 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────────────────────────────

  const GoogleButton = () => (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={isGoogleLoading}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        width: '100%',
        padding: '0.7rem 1rem',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.07)',
        color: '#f1f5f9',
        fontSize: '0.9rem',
        fontWeight: 500,
        cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        fontFamily: 'inherit',
        opacity: isGoogleLoading ? 0.7 : 1,
      }}
      onMouseEnter={e => !isGoogleLoading && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.13)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)')}
    >
      {isGoogleLoading ? (
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      )}
      {isGoogleLoading ? '연결 중...' : 'Google로 계속하기'}
    </button>
  );

  const Divider = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.25rem 0' }}>
      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
      <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 500 }}>또는</span>
      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
    </div>
  );

  const InputField = ({
    id,
    label,
    type,
    value,
    onChange,
    placeholder,
    rightEl,
  }: {
    id: string;
    label: string;
    type: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    rightEl?: React.ReactNode;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label htmlFor={id} style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          onChange={e => { onChange(e.target.value); clearError(); }}
          placeholder={placeholder}
          required
          className="input-field"
          style={{ width: '100%', boxSizing: 'border-box', paddingRight: rightEl ? '2.5rem' : undefined }}
        />
        {rightEl && (
          <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
            {rightEl}
          </div>
        )}
      </div>
    </div>
  );

  const SubmitButton = ({ label, loading }: { label: string; loading: boolean }) => (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary"
      style={{
        padding: '0.75rem',
        borderRadius: '10px',
        cursor: loading ? 'not-allowed' : 'pointer',
        border: 'none',
        width: '100%',
        fontSize: '0.95rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.4rem',
        opacity: loading ? 0.75 : 1,
      }}
    >
      {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
      {loading ? '처리 중...' : label}
    </button>
  );

  // ────────────────────────────────────────────────────────────────
  // View: 이메일 인증 대기
  // ────────────────────────────────────────────────────────────────
  if (view === 'verify_email') {
    return (
      <ModalWrapper onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.25rem',
            background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(59,130,246,0.2)'
          }}>
            <Mail size={28} color="#3b82f6" />
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 600 }}>이메일을 확인해 주세요</h2>
          <p style={{ margin: '0 0 0.5rem', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
            <strong style={{ color: '#e2e8f0' }}>{email}</strong>로<br />
            인증 링크를 발송했습니다.<br />
            메일의 링크를 클릭하면 자동으로 로그인됩니다.
          </p>
          <p style={{ margin: '0.75rem 0 0', color: '#64748b', fontSize: '0.78rem' }}>
            메일이 오지 않으면 스팸함을 확인해 주세요.
          </p>
        </div>
        <button
          onClick={() => setView('login')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
            background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8',
            borderRadius: '8px', padding: '0.6rem', cursor: 'pointer', width: '100%',
            fontSize: '0.85rem', transition: 'all 0.15s', fontFamily: 'inherit'
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f1f5f9')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
        >
          <ArrowLeft size={14} /> 로그인으로 돌아가기
        </button>
      </ModalWrapper>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // View: 비밀번호 재설정 메일 발송 완료
  // ────────────────────────────────────────────────────────────────
  if (view === 'reset_sent') {
    return (
      <ModalWrapper onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.25rem',
            background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(34,197,94,0.2)'
          }}>
            <Mail size={28} color="#22c55e" />
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 600 }}>재설정 메일 발송 완료</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
            <strong style={{ color: '#e2e8f0' }}>{email}</strong>로<br />
            비밀번호 재설정 링크를 발송했습니다.
          </p>
        </div>
        <button
          onClick={() => setView('login')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
            background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8',
            borderRadius: '8px', padding: '0.6rem', cursor: 'pointer', width: '100%',
            fontSize: '0.85rem', transition: 'all 0.15s', fontFamily: 'inherit'
          }}
        >
          <ArrowLeft size={14} /> 로그인으로 돌아가기
        </button>
      </ModalWrapper>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // View: 비밀번호 재설정 요청
  // ────────────────────────────────────────────────────────────────
  if (view === 'reset_password') {
    return (
      <ModalWrapper onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => { setView('login'); clearError(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
              fontSize: '0.8rem', padding: 0, fontFamily: 'inherit'
            }}
          >
            <ArrowLeft size={13} /> 돌아가기
          </button>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>비밀번호 재설정</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.83rem' }}>
            가입한 이메일을 입력하면 재설정 링크를 보내드립니다.
          </p>
        </div>

        <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <InputField
            id="reset-email"
            label="이메일 주소"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@domain.com"
            rightEl={<Mail size={15} color="#64748b" />}
          />

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0, padding: '0.4rem 0.6rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
              {error}
            </p>
          )}

          <SubmitButton label="재설정 메일 보내기" loading={isLoading} />
        </form>
      </ModalWrapper>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // View: 로그인 / 회원가입 (메인)
  // ────────────────────────────────────────────────────────────────
  return (
    <ModalWrapper onClose={onClose}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.35rem' }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%', marginBottom: '0.25rem',
          background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(59,130,246,0.2)'
        }}>
          <Sparkles size={24} color="#3b82f6" />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
          {view === 'login' ? '다시 오셨군요!' : 'DrawLink 시작하기'}
        </h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.82rem' }}>
          {view === 'login' ? '로그인하여 보드를 저장하세요' : '계정을 만들고 함께 그려요'}
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', background: 'rgba(0,0,0,0.25)',
        borderRadius: '10px', padding: '4px', gap: '4px'
      }}>
        {(['login', 'signup'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setView(tab); clearError(); }}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: '7px', border: 'none',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit',
              transition: 'all 0.2s',
              background: view === tab ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: view === tab ? '#f1f5f9' : '#64748b',
              boxShadow: view === tab ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
            }}
          >
            {tab === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>

      {/* Google Button */}
      <GoogleButton />

      <Divider />

      {/* Email form */}
      <form
        onSubmit={view === 'login' ? handleSignIn : handleSignUp}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
      >
        <InputField
          id="auth-email"
          label="이메일 주소"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@domain.com"
          rightEl={<Mail size={15} color="#64748b" />}
        />

        <InputField
          id="auth-password"
          label="비밀번호"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          rightEl={
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#64748b' }}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />

        {view === 'login' && (
          <div style={{ textAlign: 'right', marginTop: '-0.35rem' }}>
            <button
              type="button"
              onClick={() => { setView('reset_password'); clearError(); }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem', padding: 0, fontFamily: 'inherit' }}
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>
        )}

        {error && (
          <p style={{
            color: '#fca5a5', fontSize: '0.82rem', margin: 0,
            padding: '0.45rem 0.7rem', background: 'rgba(239,68,68,0.1)',
            borderRadius: '7px', border: '1px solid rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', gap: '0.4rem'
          }}>
            ⚠️ {error}
          </p>
        )}

        <SubmitButton
          label={view === 'login' ? '로그인' : '회원가입'}
          loading={isLoading}
        />
      </form>

      {/* Bottom toggle */}
      <p style={{ margin: 0, textAlign: 'center', fontSize: '0.82rem', color: '#64748b' }}>
        {view === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
        <button
          onClick={() => { setView(view === 'login' ? 'signup' : 'login'); clearError(); }}
          style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit', fontSize: '0.82rem' }}
        >
          {view === 'login' ? '회원가입' : '로그인'}
        </button>
      </p>
    </ModalWrapper>
  );
}

// ────────────────────────────────────────────────────────────────
// Shared modal wrapper
// ────────────────────────────────────────────────────────────────
function ModalWrapper({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div
        className="glass-panel auth-card"
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '16px',
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '1.4rem', fontWeight: 300, lineHeight: 1,
            transition: 'color 0.15s', padding: '2px 6px', borderRadius: '4px'
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f1f5f9')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
        >
          &times;
        </button>

        {children}
      </div>
    </div>
  );
}
