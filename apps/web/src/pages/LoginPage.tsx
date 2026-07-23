import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, LogIn, Mail, Send, ShieldCheck, UserPlus } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { TwoFactorLoginChallenge } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type AuthMode = 'login' | 'register' | 'forgot';
type ResetStep = 'request' | 'verify';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login, completeTwoFactorLogin, register, logout } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [resetStep, setResetStep] = useState<ResetStep>('request');
  const [email, setEmail] = useState('author@novel.local');
  const [password, setPassword] = useState('Admin123456');
  const [nickname, setNickname] = useState('新读者');
  const [registrationCode, setRegistrationCode] = useState('');
  const [registrationDevelopmentCode, setRegistrationDevelopmentCode] = useState('');
  const [registrationResendSeconds, setRegistrationResendSeconds] = useState(0);
  const [isSendingRegistrationCode, setIsSendingRegistrationCode] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorLoginChallenge>();
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setResendSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (registrationResendSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setRegistrationResendSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [registrationResendSeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    setMessage(undefined);

    try {
      if (twoFactorChallenge) {
        const result = await completeTwoFactorLogin(
          twoFactorChallenge.challengeToken,
          twoFactorCode.trim(),
        );
        setMessage(result.usedRecoveryCode ? '恢复码验证成功' : '登录成功');
        navigate('/');
      } else if (mode === 'login') {
        const result = await login(email.trim(), password);
        if ('requiresTwoFactor' in result) {
          setTwoFactorChallenge(result);
          setTwoFactorCode('');
          setPassword('');
          setMessage('密码已验证，请输入验证器代码或恢复码');
        } else {
          setMessage('登录成功');
          navigate('/');
        }
      } else if (mode === 'register') {
        await register({
          email: email.trim(),
          password,
          verificationCode: registrationCode.trim(),
          nickname: nickname.trim() || undefined,
        });
        setMessage('注册成功');
        navigate('/');
      } else if (resetStep === 'request') {
        await requestResetCode();
      } else {
        await resetAccountPassword();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestResetCode() {
    const result = await api.requestPasswordReset(email.trim());
    setResetStep('verify');
    setResendSeconds(result.retryAfterSeconds);
    setDevelopmentCode(result.developmentCode ?? '');
    setMessage('如果该邮箱已注册，验证码将发送到邮箱');
  }

  async function requestRegistrationCode() {
    if (isSendingRegistrationCode || registrationResendSeconds > 0) {
      return;
    }
    setIsSendingRegistrationCode(true);
    setError(undefined);
    setMessage(undefined);
    setTwoFactorChallenge(undefined);
    setTwoFactorCode('');
    try {
      const result = await api.requestRegistrationCode(email.trim());
      setRegistrationResendSeconds(result.retryAfterSeconds);
      setRegistrationDevelopmentCode(result.developmentCode ?? '');
      setMessage('验证码已发送到注册邮箱');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSendingRegistrationCode(false);
    }
  }

  async function resendResetCode() {
    if (resendSeconds > 0 || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(undefined);
    setMessage(undefined);
    setTwoFactorChallenge(undefined);
    setTwoFactorCode('');
    try {
      await requestResetCode();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetAccountPassword() {
    if (newPassword !== confirmPassword) {
      throw new Error('两次输入的新密码不一致');
    }
    await api.resetPassword({
      email: email.trim(),
      code: resetCode.trim(),
      newPassword,
    });
    setMode('login');
    setResetStep('request');
    setPassword('');
    setResetCode('');
    setRegistrationCode('');
    setRegistrationDevelopmentCode('');
    setRegistrationResendSeconds(0);
    setNewPassword('');
    setConfirmPassword('');
    setDevelopmentCode('');
    setResendSeconds(0);
    setMessage('密码已重置，请使用新密码登录');
  }

  function switchMode(nextMode: Exclude<AuthMode, 'forgot'>) {
    setMode(nextMode);
    setResetStep('request');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setDevelopmentCode('');
    setResendSeconds(0);
    setError(undefined);
    setMessage(undefined);
  }

  function openPasswordRecovery() {
    setMode('forgot');
    setResetStep('request');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setDevelopmentCode('');
    setResendSeconds(0);
    setError(undefined);
    setMessage(undefined);
  }

  if (isAuthenticated && user) {
    return (
      <section className="login-page">
        <div className="login-panel">
          <div>
            <p className="eyebrow">已登录</p>
            <h1>{user.nickname}</h1>
          </div>
          <p className="auth-message">
            {user.email} · {roleText(user.role)}
          </p>
          <div className="action-row">
            <Link className="primary-link" to="/">
              返回书城
            </Link>
            <button className="ghost-button" type="button" onClick={logout}>
              退出登录
            </button>
          </div>
        </div>
      </section>
    );
  }

  const title = twoFactorChallenge
    ? '两步验证'
    : mode === 'login'
      ? '登录阅界'
      : mode === 'register'
        ? '创建账户'
        : '找回密码';

  return (
    <section className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="auth-title-row">
          {(mode === 'forgot' || twoFactorChallenge) && (
            <button
              className="auth-back-button"
              type="button"
              aria-label="返回登录"
              title="返回登录"
              onClick={() => switchMode('login')}
            >
              <ArrowLeft size={18} aria-hidden />
            </button>
          )}
          <div>
            <p className="eyebrow">账户</p>
            <h1>{title}</h1>
          </div>
        </div>

        {!twoFactorChallenge && mode !== 'forgot' && (
          <div className="segment-control" role="group" aria-label="账户模式">
            <button
              className={mode === 'login' ? 'active' : ''}
              type="button"
              aria-pressed={mode === 'login'}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              type="button"
              aria-pressed={mode === 'register'}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>
        )}

        {!twoFactorChallenge && mode === 'register' && (
          <label>
            昵称
            <input
              value={nickname}
              autoComplete="nickname"
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
        )}

        {!twoFactorChallenge && (
          <label>
            邮箱
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}

        {!twoFactorChallenge && mode === 'register' && (
          <>
            <label>
              邮箱验证码
              <input
                value={registrationCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                onChange={(event) => setRegistrationCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className="auth-code-actions">
              <button
                className="auth-text-button"
                type="button"
                disabled={isSendingRegistrationCode || registrationResendSeconds > 0}
                onClick={() => void requestRegistrationCode()}
              >
                {isSendingRegistrationCode
                  ? '发送中...'
                  : registrationResendSeconds > 0
                    ? `${registrationResendSeconds} 秒后可重发`
                    : '发送邮箱验证码'}
              </button>
              {registrationDevelopmentCode && (
                <span>本地验证码：{registrationDevelopmentCode}</span>
              )}
            </div>
          </>
        )}

        {!twoFactorChallenge && mode !== 'forgot' && (
          <label>
            密码
            <input
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}

        {!twoFactorChallenge && mode === 'login' && (
          <button className="auth-text-button" type="button" onClick={openPasswordRecovery}>
            忘记密码
          </button>
        )}

        {!twoFactorChallenge && mode === 'forgot' && resetStep === 'verify' && (
          <>
            <label>
              验证码
              <input
                value={resetCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <div className="auth-code-actions">
              <button
                className="auth-text-button"
                type="button"
                disabled={resendSeconds > 0 || isSubmitting}
                onClick={() => void resendResetCode()}
              >
                {resendSeconds > 0 ? `${resendSeconds} 秒后可重发` : '重新发送验证码'}
              </button>
              {developmentCode && <span>本地验证码：{developmentCode}</span>}
            </div>
            <label>
              新密码
              <input
                type="password"
                value={newPassword}
                autoComplete="new-password"
                minLength={8}
                required
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                minLength={8}
                required
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </>
        )}

        {twoFactorChallenge && (
          <div className="two-factor-login-step">
            <ShieldCheck size={28} aria-hidden />
            <p>打开验证器应用输入 6 位动态代码，也可以使用一条未使用的恢复码。</p>
            <label>
              验证代码
              <input
                autoFocus
                required
                value={twoFactorCode}
                autoComplete="one-time-code"
                maxLength={20}
                onChange={(event) =>
                  setTwoFactorCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
                }
                placeholder="123456 或 XXXX-XXXX"
              />
            </label>
            <small>
              挑战将在 {Math.ceil(twoFactorChallenge.expiresIn / 60)} 分钟后失效
              {twoFactorChallenge.recoveryCodesAvailable > 0
                ? `，还有 ${twoFactorChallenge.recoveryCodesAvailable} 条恢复码可用`
                : ''}
            </small>
          </div>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}

        <button className="primary-link" type="submit" disabled={isSubmitting}>
          {twoFactorChallenge ? (
            <ShieldCheck size={18} aria-hidden />
          ) : mode === 'login' ? (
            <LogIn size={18} aria-hidden />
          ) : mode === 'register' ? (
            <UserPlus size={18} aria-hidden />
          ) : resetStep === 'request' ? (
            <Mail size={18} aria-hidden />
          ) : (
            <KeyRound size={18} aria-hidden />
          )}
          {isSubmitting
            ? '处理中...'
            : twoFactorChallenge
              ? '验证并登录'
              : mode === 'login'
                ? '登录'
                : mode === 'register'
                  ? '注册'
                  : resetStep === 'request'
                    ? '发送验证码'
                    : '重置密码'}
        </button>

        {!twoFactorChallenge && mode === 'forgot' && resetStep === 'verify' && (
          <span className="auth-mail-status">
            <Send size={14} aria-hidden />
            验证码 10 分钟内有效
          </span>
        )}
      </form>
    </section>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return '操作失败';
}

function roleText(role: string) {
  const roles: Record<string, string> = {
    READER: '读者',
    AUTHOR: '作者',
    ADMIN: '管理员',
  };
  return roles[role] ?? role;
}
