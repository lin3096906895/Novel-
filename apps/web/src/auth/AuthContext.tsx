import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { AuthLoginResult, AuthResponse, User } from '../api/types';

const ACCESS_TOKEN_KEY = 'novel_platform_access_token';
const REFRESH_TOKEN_KEY = 'novel_platform_refresh_token';

interface AuthContextValue {
  user?: User;
  token?: string;
  isReady: boolean;
  isAuthenticated: boolean;
  login(email: string, password: string): Promise<AuthLoginResult>;
  completeTwoFactorLogin(challengeToken: string, code: string): Promise<AuthResponse>;
  register(payload: {
    email: string;
    password: string;
    verificationCode: string;
    nickname?: string;
  }): Promise<AuthResponse>;
  updateProfile(nickname: string): Promise<User>;
  changeEmail(
    email: string,
    code: string,
    currentPassword: string,
  ): Promise<{ user: User; revokedSessions: number }>;
  reloadUser(): Promise<User>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>();
  const [refreshToken, setRefreshToken] = useState<string>();
  const [user, setUser] = useState<User>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const savedToken = localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
    const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) ?? undefined;

    async function restore() {
      try {
        if (savedToken) {
          const profile = await api.me(savedToken);
          if (isMounted) {
            setToken(savedToken);
            setRefreshToken(savedRefreshToken);
            setUser(profile);
          }
          return;
        }

        if (!savedRefreshToken) {
          return;
        }
      } catch {
        if (!savedRefreshToken) {
          clearStoredAuth();
          return;
        }
      }

      if (savedRefreshToken) {
        try {
          const response = await api.refreshAuth(savedRefreshToken);
          if (isMounted) {
            persistAuth(response);
          }
        } catch {
          clearStoredAuth();
        }
      }
    }

    void restore().finally(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !token || !refreshToken) {
      return;
    }

    const expiresAt = accessTokenExpiresAt(token);
    const refreshDelay = Math.max(1_000, expiresAt - Date.now() - 60_000);
    const timer = window.setTimeout(async () => {
      const activeRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!activeRefreshToken) {
        clearAuthState();
        return;
      }

      try {
        persistAuth(await api.refreshAuth(activeRefreshToken));
      } catch {
        clearAuthState();
      }
    }, refreshDelay);

    return () => window.clearTimeout(timer);
  }, [isReady, refreshToken, token]);

  function persistAuth(response: AuthResponse) {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    setToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setUser(response.user);
    return response;
  }

  function clearStoredAuth() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  function clearAuthState() {
    clearStoredAuth();
    setToken(undefined);
    setRefreshToken(undefined);
    setUser(undefined);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isReady,
      isAuthenticated: Boolean(user && token),
      async login(email, password) {
        const result = await api.login({ email, password });
        return 'requiresTwoFactor' in result ? result : persistAuth(result);
      },
      async completeTwoFactorLogin(challengeToken, code) {
        return persistAuth(await api.completeTwoFactorLogin({ challengeToken, code }));
      },
      async register(payload) {
        return persistAuth(await api.register(payload));
      },
      async updateProfile(nickname) {
        if (!token) {
          throw new Error('请先登录');
        }
        const updated = await api.updateProfile(token, nickname);
        setUser(updated);
        return updated;
      },
      async changeEmail(email, code, currentPassword) {
        if (!token) {
          throw new Error('请先登录');
        }
        const result = await api.changeEmail(token, { email, code, currentPassword });
        setUser(result.user);
        return result;
      },
      async reloadUser() {
        if (!token) {
          throw new Error('请先登录');
        }
        const updated = await api.me(token);
        setUser(updated);
        return updated;
      },
      logout() {
        const activeToken = token;
        clearAuthState();
        if (activeToken) {
          void api.logout(activeToken).catch(() => undefined);
        }
      },
    }),
    [isReady, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

function accessTokenExpiresAt(token: string) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return decoded.exp ? decoded.exp * 1000 : Date.now() + 5 * 60 * 1000;
  } catch {
    return Date.now() + 60_000;
  }
}
