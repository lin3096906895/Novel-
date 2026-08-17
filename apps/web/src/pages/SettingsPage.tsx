import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BookOpen,
  CircleCheckBig,
  CircleX,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  LogOut,
  Mail,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../api/client';
import type {
  AccountDeletionStatus,
  AuthSession,
  PaginatedLoginActivities,
  PaginatedMyComments,
  PaginatedMyParagraphComments,
  ReadingAnnotationWithContext,
  ReadingHistory,
  TwoFactorSetup,
  TwoFactorStatus,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { formatReadingDuration } from '../utils/format';

type SettingsWorkspaceView = 'account' | 'reading' | 'data' | 'local';
type AccountSettingsView = 'profile' | 'security' | 'devices' | 'activity';

const settingsWorkspaceLabels: Record<SettingsWorkspaceView, string> = {
  account: '\u8d26\u6237',
  reading: '\u9605\u8bfb',
  data: '\u6570\u636e\u4e0e\u6ce8\u9500',
  local: '\u672c\u5730\u73af\u5883',
};

const accountSettingsLabels: Record<AccountSettingsView, string> = {
  profile: '\u8d44\u6599',
  security: '\u5b89\u5168',
  devices: '\u8bbe\u5907',
  activity: '\u767b\u5f55\u8bb0\u5f55',
};

export function SettingsPage() {
  const { user, token, isReady, isAuthenticated, logout, updateProfile, changeEmail } = useAuth();
  const [nickname, setNickname] = useState('');
  const [workspaceView, setWorkspaceView] = useState<SettingsWorkspaceView>('account');
  const [accountView, setAccountView] = useState<AccountSettingsView>('profile');
  const [comments, setComments] = useState<PaginatedMyComments>();
  const [paragraphComments, setParagraphComments] = useState<PaginatedMyParagraphComments>();
  const [readingHistories, setReadingHistories] = useState<ReadingHistory[]>([]);
  const [readingAnnotations, setReadingAnnotations] = useState<ReadingAnnotationWithContext[]>([]);
  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [loginActivities, setLoginActivities] = useState<PaginatedLoginActivities>();
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus>();
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup>();
  const [twoFactorSetupPassword, setTwoFactorSetupPassword] = useState('');
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState('');
  const [twoFactorManagePassword, setTwoFactorManagePassword] = useState('');
  const [twoFactorManageCode, setTwoFactorManageCode] = useState('');
  const [twoFactorRecoveryCodes, setTwoFactorRecoveryCodes] = useState<string[]>([]);
  const [isTwoFactorBusy, setIsTwoFactorBusy] = useState(false);
  const [isTwoFactorDisablePending, setIsTwoFactorDisablePending] = useState(false);
  const [accountDeletionStatus, setAccountDeletionStatus] = useState<AccountDeletionStatus>();
  const [accountDeletionPassword, setAccountDeletionPassword] = useState('');
  const [accountDeletionCode, setAccountDeletionCode] = useState('');
  const [accountDeletionConfirmation, setAccountDeletionConfirmation] = useState('');
  const [accountDeletionReason, setAccountDeletionReason] = useState('');
  const [isAccountDeletionBusy, setIsAccountDeletionBusy] = useState(false);
  const [dataExportPassword, setDataExportPassword] = useState('');
  const [dataExportCode, setDataExportCode] = useState('');
  const [isDataExporting, setIsDataExporting] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailDevelopmentCode, setEmailDevelopmentCode] = useState('');
  const [emailCodeSeconds, setEmailCodeSeconds] = useState(0);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [page, setPage] = useState(1);
  const [paragraphPage, setParagraphPage] = useState(1);
  const [loginActivityPage, setLoginActivityPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingParagraphComments, setIsLoadingParagraphComments] = useState(false);
  const [isLoadingReadingStats, setIsLoadingReadingStats] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingLoginActivities, setIsLoadingLoginActivities] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState('');
  const [isRevokingOtherSessions, setIsRevokingOtherSessions] = useState(false);
  const [pendingHistoryDeleteId, setPendingHistoryDeleteId] = useState('');
  const [deletingHistoryId, setDeletingHistoryId] = useState('');
  const [isClearHistoryPending, setIsClearHistoryPending] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [pendingAnnotationDeleteId, setPendingAnnotationDeleteId] = useState('');
  const [deletingAnnotationId, setDeletingAnnotationId] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [pendingParagraphDeleteId, setPendingParagraphDeleteId] = useState('');
  const [deletingParagraphId, setDeletingParagraphId] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setNickname(user?.nickname ?? '');
  }, [user?.nickname]);

  useEffect(() => {
    if (emailCodeSeconds <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setEmailCodeSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [emailCodeSeconds]);

  useEffect(() => {
    if (!token) {
      setComments(undefined);
      return;
    }

    let active = true;
    setIsLoadingComments(true);
    api
      .listMyComments(token, { page, pageSize: 6 })
      .then((result) => {
        if (active) {
          setComments(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '评论加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingComments(false);
        }
      });

    return () => {
      active = false;
    };
  }, [page, token]);

  useEffect(() => {
    if (!token) {
      setParagraphComments(undefined);
      return;
    }

    let active = true;
    setIsLoadingParagraphComments(true);
    api
      .listMyParagraphComments(token, { page: paragraphPage, pageSize: 6 })
      .then((result) => {
        if (active) {
          setParagraphComments(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '段评加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingParagraphComments(false);
        }
      });

    return () => {
      active = false;
    };
  }, [paragraphPage, token]);

  useEffect(() => {
    if (!token) {
      setReadingHistories([]);
      setReadingAnnotations([]);
      return;
    }

    let active = true;
    setIsLoadingReadingStats(true);
    Promise.all([api.listReadingHistories(token), api.listAnnotations(token)])
      .then(([histories, annotations]) => {
        if (active) {
          setReadingHistories(histories);
          setReadingAnnotations(annotations);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '阅读统计加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingReadingStats(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAccountDeletionStatus(undefined);
      return;
    }
    let active = true;
    api
      .getAccountDeletionStatus(token)
      .then((status) => {
        if (active) {
          setAccountDeletionStatus(status);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '注销状态加载失败');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoginActivities(undefined);
      return;
    }

    let active = true;
    setIsLoadingLoginActivities(true);
    api
      .listLoginActivities(token, { page: loginActivityPage, pageSize: 10 })
      .then((result) => {
        if (active) {
          setLoginActivities(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '登录历史加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingLoginActivities(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loginActivityPage, token]);

  useEffect(() => {
    if (!token) {
      setAuthSessions([]);
      return;
    }

    let active = true;
    setIsLoadingSessions(true);
    api
      .listAuthSessions(token)
      .then((sessions) => {
        if (active) {
          setAuthSessions(sessions);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '设备会话加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingSessions(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setTwoFactorStatus(undefined);
      setTwoFactorSetup(undefined);
      setTwoFactorRecoveryCodes([]);
      return;
    }

    let active = true;
    api
      .getTwoFactorStatus(token)
      .then((status) => {
        if (active) {
          setTwoFactorStatus(status);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '两步验证状态加载失败');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const readingStats = useMemo(() => {
    const totalSeconds = readingHistories.reduce(
      (total, history) => total + history.readingSeconds,
      0,
    );
    const mostRead = readingHistories.reduce<ReadingHistory | undefined>(
      (current, history) =>
        !current || history.readingSeconds > current.readingSeconds ? history : current,
      undefined,
    );
    return { totalSeconds, mostRead };
  }, [readingHistories]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = nickname.trim();
    if (normalized.length < 2) {
      setError('昵称至少需要 2 个字');
      return;
    }

    setIsSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await updateProfile(normalized);
      setMessage('个人资料已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (newPassword.length < 8) {
      setError('新密码至少需要 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setIsChangingPassword(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.changePassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setAuthSessions((current) => current.filter((session) => session.isCurrent));
      setMessage(
        result.revokedSessions > 0
          ? `密码已修改，其他 ${result.revokedSessions} 个设备已退出`
          : '密码已修改',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function beginTwoFactorSetup() {
    if (!token || !twoFactorSetupPassword) {
      return;
    }
    setIsTwoFactorBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const setup = await api.beginTwoFactorSetup(token, twoFactorSetupPassword);
      setTwoFactorSetup(setup);
      setTwoFactorStatus((current) => ({
        enabled: false,
        enabledAt: null,
        pendingSetup: true,
        recoveryCodesRemaining: current?.recoveryCodesRemaining ?? 0,
      }));
      setTwoFactorSetupPassword('');
      setTwoFactorSetupCode('');
      setMessage('请扫描二维码并输入验证器生成的代码');
    } catch (err) {
      setError(err instanceof Error ? err.message : '两步验证设置失败');
    } finally {
      setIsTwoFactorBusy(false);
    }
  }

  async function cancelTwoFactorSetup() {
    if (!token) {
      return;
    }
    setIsTwoFactorBusy(true);
    setError(undefined);
    try {
      await api.cancelTwoFactorSetup(token);
      setTwoFactorSetup(undefined);
      setTwoFactorSetupCode('');
      setTwoFactorStatus({
        enabled: false,
        enabledAt: null,
        pendingSetup: false,
        recoveryCodesRemaining: 0,
      });
      setMessage('已取消两步验证设置');
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消设置失败');
    } finally {
      setIsTwoFactorBusy(false);
    }
  }

  async function enableTwoFactor() {
    if (!token || !twoFactorSetupCode) {
      return;
    }
    setIsTwoFactorBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.enableTwoFactor(token, twoFactorSetupCode);
      setTwoFactorStatus({
        enabled: true,
        enabledAt: result.enabledAt,
        pendingSetup: false,
        recoveryCodesRemaining: result.recoveryCodesRemaining,
      });
      setTwoFactorSetup(undefined);
      setTwoFactorSetupCode('');
      setTwoFactorRecoveryCodes(result.recoveryCodes);
      setAuthSessions((sessions) => sessions.filter((session) => session.isCurrent));
      setMessage(
        result.revokedSessions > 0
          ? `两步验证已启用，其他 ${result.revokedSessions} 个设备已退出`
          : '两步验证已启用，请妥善保存恢复码',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '启用两步验证失败');
    } finally {
      setIsTwoFactorBusy(false);
    }
  }

  async function regenerateTwoFactorRecoveryCodes() {
    if (!token || !twoFactorManagePassword || !twoFactorManageCode) {
      return;
    }
    setIsTwoFactorBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.regenerateTwoFactorRecoveryCodes(token, {
        currentPassword: twoFactorManagePassword,
        code: twoFactorManageCode,
      });
      setTwoFactorRecoveryCodes(result.recoveryCodes);
      setTwoFactorStatus((current) =>
        current ? { ...current, recoveryCodesRemaining: result.recoveryCodesRemaining } : current,
      );
      setTwoFactorManagePassword('');
      setTwoFactorManageCode('');
      setIsTwoFactorDisablePending(false);
      setMessage('旧恢复码已失效，请保存新恢复码');
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复码生成失败');
    } finally {
      setIsTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor() {
    if (!token || !twoFactorManagePassword || !twoFactorManageCode) {
      return;
    }
    if (!isTwoFactorDisablePending) {
      setIsTwoFactorDisablePending(true);
      return;
    }

    setIsTwoFactorBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.disableTwoFactor(token, {
        currentPassword: twoFactorManagePassword,
        code: twoFactorManageCode,
      });
      setTwoFactorStatus({
        enabled: false,
        enabledAt: null,
        pendingSetup: false,
        recoveryCodesRemaining: 0,
      });
      setTwoFactorRecoveryCodes([]);
      setTwoFactorManagePassword('');
      setTwoFactorManageCode('');
      setIsTwoFactorDisablePending(false);
      setAuthSessions((sessions) => sessions.filter((session) => session.isCurrent));
      setMessage(
        result.revokedSessions > 0
          ? `两步验证已关闭，其他 ${result.revokedSessions} 个设备已退出`
          : '两步验证已关闭',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '关闭两步验证失败');
    } finally {
      setIsTwoFactorBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(twoFactorRecoveryCodes.join('\n'));
      setMessage('恢复码已复制');
    } catch {
      setError('无法访问剪贴板，请手动记录恢复码');
    }
  }

  async function requestAccountDeletion() {
    if (!token || !accountDeletionPassword) {
      return;
    }
    if (accountDeletionConfirmation !== '注销账号') {
      setError('请输入“注销账号”确认操作');
      return;
    }
    setIsAccountDeletionBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.requestAccountDeletion(token, {
        currentPassword: accountDeletionPassword,
        ...(accountDeletionCode ? { code: accountDeletionCode } : {}),
        confirmation: accountDeletionConfirmation,
        ...(accountDeletionReason.trim() ? { reason: accountDeletionReason.trim() } : {}),
      });
      setAccountDeletionStatus(result);
      setAccountDeletionPassword('');
      setAccountDeletionCode('');
      setAccountDeletionConfirmation('');
      setAccountDeletionReason('');
      setAuthSessions((sessions) => sessions.filter((session) => session.isCurrent));
      setMessage(
        result.revokedSessions > 0
          ? `注销申请已提交，其他 ${result.revokedSessions} 个设备已退出`
          : '注销申请已提交，冷静期内可以随时取消',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '注销申请提交失败');
    } finally {
      setIsAccountDeletionBusy(false);
    }
  }

  async function cancelAccountDeletion() {
    if (!token || !accountDeletionPassword) {
      return;
    }
    setIsAccountDeletionBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const status = await api.cancelAccountDeletion(token, {
        currentPassword: accountDeletionPassword,
        ...(accountDeletionCode ? { code: accountDeletionCode } : {}),
      });
      setAccountDeletionStatus(status);
      setAccountDeletionPassword('');
      setAccountDeletionCode('');
      setMessage('账号注销申请已取消');
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消注销失败');
    } finally {
      setIsAccountDeletionBusy(false);
    }
  }

  async function exportPersonalData() {
    if (!token || !dataExportPassword) {
      return;
    }
    setIsDataExporting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.exportPersonalData(token, {
        currentPassword: dataExportPassword,
        ...(dataExportCode ? { code: dataExportCode } : {}),
      });
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `novel-platform-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setDataExportPassword('');
      setDataExportCode('');
      setMessage('个人数据文件已生成');
    } catch (err) {
      setError(err instanceof Error ? err.message : '个人数据导出失败');
    } finally {
      setIsDataExporting(false);
    }
  }

  async function sendEmailChangeCode() {
    if (!token || isSendingEmailCode || emailCodeSeconds > 0) {
      return;
    }
    const email = newEmail.trim();
    if (!email) {
      setError('请输入新邮箱');
      return;
    }
    setIsSendingEmailCode(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.requestEmailChangeCode(token, email);
      setEmailCodeSeconds(result.retryAfterSeconds);
      setEmailDevelopmentCode(result.developmentCode ?? '');
      setMessage('验证码已发送到新邮箱');
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setIsSendingEmailCode(false);
    }
  }

  async function submitEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email || !emailVerificationCode || !emailCurrentPassword) {
      return;
    }
    setIsChangingEmail(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await changeEmail(email, emailVerificationCode, emailCurrentPassword);
      setNewEmail('');
      setEmailVerificationCode('');
      setEmailCurrentPassword('');
      setEmailDevelopmentCode('');
      setEmailCodeSeconds(0);
      setAuthSessions((sessions) => sessions.filter((session) => session.isCurrent));
      setMessage(
        result.revokedSessions > 0
          ? `登录邮箱已修改，其他 ${result.revokedSessions} 个设备已退出`
          : '登录邮箱已修改',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改邮箱失败');
    } finally {
      setIsChangingEmail(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!token) {
      return;
    }
    setRevokingSessionId(sessionId);
    setError(undefined);
    try {
      await api.revokeAuthSession(token, sessionId);
      setAuthSessions((current) => current.filter((session) => session.id !== sessionId));
      setMessage('设备会话已退出');
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出设备失败');
    } finally {
      setRevokingSessionId('');
    }
  }

  async function revokeOtherSessions() {
    if (!token) {
      return;
    }
    setIsRevokingOtherSessions(true);
    setError(undefined);
    try {
      const result = await api.revokeOtherAuthSessions(token);
      setAuthSessions((current) => current.filter((session) => session.isCurrent));
      setMessage(
        result.revokedCount > 0 ? `其他 ${result.revokedCount} 个设备已退出` : '没有其他设备会话',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出其他设备失败');
    } finally {
      setIsRevokingOtherSessions(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!token) {
      return;
    }
    if (pendingDeleteId !== commentId) {
      setPendingDeleteId(commentId);
      return;
    }

    setDeletingId(commentId);
    setError(undefined);
    try {
      await api.deleteMyComment(token, commentId);
      const nextItems = comments?.items.filter((comment) => comment.id !== commentId) ?? [];
      if (nextItems.length === 0 && page > 1) {
        setPage((current) => current - 1);
      } else {
        const refreshed = await api.listMyComments(token, { page, pageSize: 6 });
        setComments(refreshed);
      }
      setPendingDeleteId('');
      setMessage('评论已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId('');
    }
  }

  async function deleteParagraphComment(commentId: string) {
    if (!token) {
      return;
    }
    if (pendingParagraphDeleteId !== commentId) {
      setPendingParagraphDeleteId(commentId);
      return;
    }

    setDeletingParagraphId(commentId);
    setError(undefined);
    try {
      await api.removeParagraphComment(token, commentId);
      const nextItems =
        paragraphComments?.items.filter((comment) => comment.id !== commentId) ?? [];
      if (nextItems.length === 0 && paragraphPage > 1) {
        setParagraphPage((current) => current - 1);
      } else {
        const refreshed = await api.listMyParagraphComments(token, {
          page: paragraphPage,
          pageSize: 6,
        });
        setParagraphComments(refreshed);
      }
      setPendingParagraphDeleteId('');
      setMessage('段评已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除段评失败');
    } finally {
      setDeletingParagraphId('');
    }
  }

  async function deleteReadingHistory(history: ReadingHistory) {
    if (!token) {
      return;
    }
    if (pendingHistoryDeleteId !== history.novelId) {
      setPendingHistoryDeleteId(history.novelId);
      setIsClearHistoryPending(false);
      return;
    }

    setDeletingHistoryId(history.novelId);
    setError(undefined);
    try {
      await api.removeReadingHistory(token, history.novelId);
      setReadingHistories((current) => current.filter((item) => item.novelId !== history.novelId));
      setPendingHistoryDeleteId('');
      setMessage('阅读历史已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除阅读历史失败');
    } finally {
      setDeletingHistoryId('');
    }
  }

  async function clearReadingHistories() {
    if (!token) {
      return;
    }
    if (!isClearHistoryPending) {
      setIsClearHistoryPending(true);
      setPendingHistoryDeleteId('');
      return;
    }

    setIsClearingHistory(true);
    setError(undefined);
    try {
      await api.clearReadingHistories(token);
      setReadingHistories([]);
      setIsClearHistoryPending(false);
      setMessage('阅读历史已清空');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空阅读历史失败');
    } finally {
      setIsClearingHistory(false);
    }
  }

  async function deleteAnnotation(annotation: ReadingAnnotationWithContext) {
    if (!token) {
      return;
    }
    if (pendingAnnotationDeleteId !== annotation.id) {
      setPendingAnnotationDeleteId(annotation.id);
      return;
    }

    setDeletingAnnotationId(annotation.id);
    setError(undefined);
    try {
      await api.removeAnnotation(token, annotation.id);
      setReadingAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      setPendingAnnotationDeleteId('');
      setMessage('批注已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除批注失败');
    } finally {
      setDeletingAnnotationId('');
    }
  }

  if (!isReady) {
    return <p className="state-line">正在恢复登录状态...</p>;
  }

  return (
    <section className="settings-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">偏好与账户</p>
          <h1>设置</h1>
        </div>
      </header>

      {(error || message) && (
        <p className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}

      <nav className="settings-workspace-tabs" aria-label="\u8bbe\u7f6e\u5de5\u4f5c\u533a">
        {(isAuthenticated
          ? (Object.keys(settingsWorkspaceLabels) as SettingsWorkspaceView[])
          : (['account', 'local'] as SettingsWorkspaceView[])
        ).map((view) => (
          <button
            aria-current={workspaceView === view ? 'page' : undefined}
            className={workspaceView === view ? 'active' : ''}
            key={view}
            type="button"
            onClick={() => setWorkspaceView(view)}
          >
            {settingsWorkspaceLabels[view]}
          </button>
        ))}
      </nav>

      {isAuthenticated && workspaceView === 'account' && <nav className="settings-account-tabs" aria-label="\u8d26\u6237\u8bbe\u7f6e">
        {(Object.keys(accountSettingsLabels) as AccountSettingsView[]).map((view) => (
          <button
            aria-current={accountView === view ? 'page' : undefined}
            className={accountView === view ? 'active' : ''}
            key={view}
            type="button"
            onClick={() => setAccountView(view)}
          >
            {accountSettingsLabels[view]}
          </button>
        ))}
      </nav>}

      {workspaceView === 'account' && accountView === 'profile' && <section className="panel settings-panel">
        <h2>个人资料</h2>
        {isAuthenticated && user ? (
          <form className="profile-settings-form" onSubmit={saveProfile}>
            <label>
              昵称
              <input
                required
                minLength={2}
                maxLength={30}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
            <dl className="settings-list">
              <div>
                <dt>邮箱</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{roleText(user.role)}</dd>
              </div>
            </dl>
            <div className="settings-actions">
              <button
                className="primary-link"
                type="submit"
                disabled={isSaving || nickname.trim() === user.nickname}
              >
                <Save size={16} aria-hidden />
                保存资料
              </button>
              <button className="ghost-button" type="button" onClick={logout}>
                <LogOut size={16} aria-hidden />
                退出登录
              </button>
            </div>
          </form>
        ) : (
          <div className="settings-empty">
            <p>登录后可管理个人资料、评论和阅读数据。</p>
            <NavLink className="primary-link" to="/login">
              <UserRound size={16} aria-hidden />
              登录
            </NavLink>
          </div>
        )}
      </section>}

      {isAuthenticated &&
        (workspaceView === 'data' ||
          (workspaceView === 'account' && (accountView === 'security' || accountView === 'devices'))) && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>
              {workspaceView === 'data'
                ? '\u4e2a\u4eba\u6570\u636e\u4e0e\u8d26\u6237\u6ce8\u9500'
                : accountView === 'devices'
                  ? '\u767b\u5f55\u8bbe\u5907'
                  : '\u8d26\u53f7\u5b89\u5168'}
            </h2>
            <span className="muted">
              {workspaceView === 'data'
                ? '\u9ad8\u98ce\u9669\u64cd\u4f5c\u9700\u8981\u5f53\u524d\u5bc6\u7801\u9a8c\u8bc1'
                : '\u8bbf\u95ee\u4ee4\u724c\u81ea\u52a8\u7eed\u671f'}
            </span>
          </div>
          {workspaceView === 'account' && <div className={`account-security-grid account-security-grid-${accountView}`}>
            {accountView === 'security' && <div className="security-forms-column">
              <section className="security-settings-form two-factor-settings">
                <div className="security-section-heading">
                  <ShieldCheck size={18} aria-hidden />
                  <h3>两步验证</h3>
                  {twoFactorStatus && (
                    <span
                      className={
                        twoFactorStatus.enabled ? 'security-status active' : 'security-status'
                      }
                    >
                      {twoFactorStatus.enabled ? '已启用' : '未启用'}
                    </span>
                  )}
                </div>

                {!twoFactorStatus ? (
                  <p className="state-line">安全状态加载中...</p>
                ) : twoFactorSetup ? (
                  <div className="two-factor-setup-flow">
                    <div className="two-factor-qr">
                      <img src={twoFactorSetup.qrCodeDataUrl} alt="两步验证绑定二维码" />
                      <span>
                        <QrCode size={15} aria-hidden />
                        使用验证器应用扫描
                      </span>
                    </div>
                    <div className="two-factor-setup-fields">
                      <label>
                        无法扫码时输入密钥
                        <code>{twoFactorSetup.secret}</code>
                      </label>
                      <label>
                        6 位动态代码
                        <input
                          autoFocus
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          value={twoFactorSetupCode}
                          onChange={(event) =>
                            setTwoFactorSetupCode(event.target.value.replace(/\D/g, ''))
                          }
                        />
                      </label>
                      <div className="two-factor-action-row">
                        <button
                          className="primary-link"
                          type="button"
                          disabled={isTwoFactorBusy || twoFactorSetupCode.length !== 6}
                          onClick={() => void enableTwoFactor()}
                        >
                          <ShieldCheck size={16} aria-hidden />
                          {isTwoFactorBusy ? '验证中...' : '确认启用'}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={isTwoFactorBusy}
                          onClick={() => void cancelTwoFactorSetup()}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                ) : twoFactorStatus.enabled ? (
                  <>
                    <p className="security-description">
                      登录时需要验证器代码或恢复码。当前还有{' '}
                      <strong>{twoFactorStatus.recoveryCodesRemaining}</strong> 条恢复码可用。
                    </p>
                    <label>
                      当前密码
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={twoFactorManagePassword}
                        onChange={(event) => {
                          setTwoFactorManagePassword(event.target.value);
                          setIsTwoFactorDisablePending(false);
                        }}
                      />
                    </label>
                    <label>
                      验证器代码或恢复码
                      <input
                        autoComplete="one-time-code"
                        maxLength={20}
                        value={twoFactorManageCode}
                        onChange={(event) => {
                          setTwoFactorManageCode(
                            event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                          );
                          setIsTwoFactorDisablePending(false);
                        }}
                        placeholder="123456 或 XXXX-XXXX"
                      />
                    </label>
                    <div className="two-factor-action-row">
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={
                          isTwoFactorBusy || !twoFactorManagePassword || !twoFactorManageCode
                        }
                        onClick={() => void regenerateTwoFactorRecoveryCodes()}
                      >
                        <RefreshCw size={15} aria-hidden />
                        重新生成恢复码
                      </button>
                      <button
                        className={
                          isTwoFactorDisablePending ? 'danger-button pending' : 'danger-button'
                        }
                        type="button"
                        disabled={
                          isTwoFactorBusy || !twoFactorManagePassword || !twoFactorManageCode
                        }
                        onClick={() => void disableTwoFactor()}
                      >
                        <ShieldOff size={15} aria-hidden />
                        {isTwoFactorDisablePending ? '再次点击确认关闭' : '关闭两步验证'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="security-description">
                      使用验证器应用生成动态代码，避免密码泄露后账号被直接登录。
                    </p>
                    <label>
                      当前密码
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={twoFactorSetupPassword}
                        onChange={(event) => setTwoFactorSetupPassword(event.target.value)}
                      />
                    </label>
                    <button
                      className="primary-link"
                      type="button"
                      disabled={isTwoFactorBusy || !twoFactorSetupPassword}
                      onClick={() => void beginTwoFactorSetup()}
                    >
                      <QrCode size={16} aria-hidden />
                      {isTwoFactorBusy ? '准备中...' : '绑定验证器'}
                    </button>
                  </>
                )}

                {twoFactorRecoveryCodes.length > 0 && (
                  <div className="two-factor-recovery-box">
                    <div>
                      <strong>恢复码只显示这一次</strong>
                      <button
                        type="button"
                        onClick={() => void copyRecoveryCodes()}
                        aria-label="复制恢复码"
                        title="复制恢复码"
                      >
                        <Copy size={16} aria-hidden />
                      </button>
                    </div>
                    <div className="two-factor-recovery-grid">
                      {twoFactorRecoveryCodes.map((code) => (
                        <code key={code}>{code}</code>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <form className="security-settings-form" onSubmit={submitEmailChange}>
                <div className="security-section-heading">
                  <Mail size={18} aria-hidden />
                  <h3>修改邮箱</h3>
                </div>
                <label>
                  新邮箱
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                  />
                </label>
                <label>
                  邮箱验证码
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={emailVerificationCode}
                    onChange={(event) =>
                      setEmailVerificationCode(event.target.value.replace(/\D/g, ''))
                    }
                  />
                </label>
                <div className="auth-code-actions">
                  <button
                    className="auth-text-button"
                    type="button"
                    disabled={isSendingEmailCode || emailCodeSeconds > 0 || !newEmail.trim()}
                    onClick={() => void sendEmailChangeCode()}
                  >
                    {isSendingEmailCode
                      ? '发送中...'
                      : emailCodeSeconds > 0
                        ? `${emailCodeSeconds} 秒后可重发`
                        : '发送邮箱验证码'}
                  </button>
                  {emailDevelopmentCode && <span>本地验证码：{emailDevelopmentCode}</span>}
                </div>
                <label>
                  当前密码
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={emailCurrentPassword}
                    onChange={(event) => setEmailCurrentPassword(event.target.value)}
                  />
                </label>
                <button
                  className="primary-link"
                  type="submit"
                  disabled={
                    isChangingEmail ||
                    !newEmail.trim() ||
                    !emailVerificationCode ||
                    !emailCurrentPassword
                  }
                >
                  <ShieldCheck size={16} aria-hidden />
                  {isChangingEmail ? '修改中...' : '修改邮箱'}
                </button>
              </form>

              <form className="security-settings-form" onSubmit={changePassword}>
                <div className="security-section-heading">
                  <KeyRound size={18} aria-hidden />
                  <h3>修改密码</h3>
                </div>
                <label>
                  当前密码
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </label>
                <label>
                  新密码
                  <input
                    required
                    minLength={8}
                    maxLength={64}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                <label>
                  确认新密码
                  <input
                    required
                    minLength={8}
                    maxLength={64}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
                <button
                  className="primary-link"
                  type="submit"
                  disabled={
                    isChangingPassword || !currentPassword || !newPassword || !confirmPassword
                  }
                >
                  <ShieldCheck size={16} aria-hidden />
                  {isChangingPassword ? '修改中...' : '修改密码'}
                </button>
              </form>
            </div>}

            {accountView === 'devices' && <section className="security-session-section" aria-label="登录设备">
              <div className="security-section-heading">
                <MonitorSmartphone size={18} aria-hidden />
                <h3>登录设备</h3>
              </div>
              {isLoadingSessions ? (
                <p className="state-line">设备加载中...</p>
              ) : (
                <div className="auth-session-list">
                  {authSessions.map((session) => (
                    <article className="auth-session-row" key={session.id}>
                      <div className="auth-session-icon">
                        <MonitorSmartphone size={17} aria-hidden />
                      </div>
                      <div>
                        <strong>{session.deviceName}</strong>
                        {session.isCurrent && (
                          <span className="current-session-badge">当前设备</span>
                        )}
                        <p>
                          {session.ipAddress || '未知网络'} ·{' '}
                          {formatSessionTime(session.lastUsedAt)}
                        </p>
                      </div>
                      {!session.isCurrent && (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={revokingSessionId === session.id}
                          onClick={() => void revokeSession(session.id)}
                        >
                          <LogOut size={15} aria-hidden />
                          退出
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {authSessions.some((session) => !session.isCurrent) && (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={isRevokingOtherSessions}
                  onClick={() => void revokeOtherSessions()}
                >
                  <LogOut size={16} aria-hidden />
                  {isRevokingOtherSessions ? '处理中...' : '退出其他设备'}
                </button>
              )}
            </section>}
          </div>}

          {workspaceView === 'data' && <section className="data-export-section" aria-label="个人数据导出">
            <div className="security-section-heading">
              <Download size={18} aria-hidden />
              <h3>个人数据导出</h3>
            </div>
            <div className="data-export-layout">
              <p>
                生成包含账户、创作、阅读、互动和安全活动的 JSON
                文件。认证密钥和会话令牌不会写入文件。
              </p>
              <div className="data-export-fields">
                <label>
                  当前密码
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={dataExportPassword}
                    onChange={(event) => setDataExportPassword(event.target.value)}
                  />
                </label>
                {twoFactorStatus?.enabled && (
                  <label>
                    验证器代码或恢复码
                    <input
                      autoComplete="one-time-code"
                      maxLength={20}
                      value={dataExportCode}
                      onChange={(event) =>
                        setDataExportCode(
                          event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                        )
                      }
                    />
                  </label>
                )}
                <button
                  className="ghost-button"
                  type="button"
                  disabled={
                    isDataExporting ||
                    !dataExportPassword ||
                    Boolean(twoFactorStatus?.enabled && !dataExportCode)
                  }
                  onClick={() => void exportPersonalData()}
                >
                  <Download size={16} aria-hidden />
                  {isDataExporting ? '生成中...' : '下载个人数据'}
                </button>
              </div>
            </div>
          </section>}

          {workspaceView === 'data' && <section className="account-deletion-section" aria-label="账号注销">
            <div className="security-section-heading">
              <Trash2 size={18} aria-hidden />
              <h3>账号注销</h3>
            </div>

            {user?.role === 'ADMIN' ? (
              <p className="state-line">管理员账号不能通过用户端自助注销。</p>
            ) : !accountDeletionStatus ? (
              <p className="state-line">注销状态加载中...</p>
            ) : accountDeletionStatus.pending ? (
              <div className="account-deletion-pending">
                <div className="account-deletion-notice">
                  <ShieldAlert size={18} aria-hidden />
                  <div>
                    <strong>账号将在 {accountDeletionStatus.daysRemaining} 天内注销</strong>
                    <p>
                      计划执行时间：
                      {accountDeletionStatus.scheduledAt
                        ? new Date(accountDeletionStatus.scheduledAt).toLocaleString('zh-CN')
                        : '--'}
                    </p>
                    {accountDeletionStatus.reason && (
                      <p>提交原因：{accountDeletionStatus.reason}</p>
                    )}
                  </div>
                </div>
                <div className="account-deletion-fields">
                  <label>
                    当前密码
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={accountDeletionPassword}
                      onChange={(event) => setAccountDeletionPassword(event.target.value)}
                    />
                  </label>
                  {twoFactorStatus?.enabled && (
                    <label>
                      验证器代码或恢复码
                      <input
                        autoComplete="one-time-code"
                        maxLength={20}
                        value={accountDeletionCode}
                        onChange={(event) =>
                          setAccountDeletionCode(
                            event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                          )
                        }
                      />
                    </label>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={
                      isAccountDeletionBusy ||
                      !accountDeletionPassword ||
                      Boolean(twoFactorStatus?.enabled && !accountDeletionCode)
                    }
                    onClick={() => void cancelAccountDeletion()}
                  >
                    <CircleX size={16} aria-hidden />
                    {isAccountDeletionBusy ? '处理中...' : '取消注销申请'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="account-deletion-form">
                <div className="account-deletion-policy">
                  <p>提交后有 7 天冷静期。到期将清理个人阅读数据和未公开作品。</p>
                  <p>已公开作品与评论会保留，但账号、作者名称和联系信息会被匿名化。</p>
                </div>
                <div className="account-deletion-fields">
                  <label>
                    注销原因（可选）
                    <textarea
                      maxLength={500}
                      value={accountDeletionReason}
                      onChange={(event) => setAccountDeletionReason(event.target.value)}
                    />
                  </label>
                  <label>
                    当前密码
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={accountDeletionPassword}
                      onChange={(event) => setAccountDeletionPassword(event.target.value)}
                    />
                  </label>
                  {twoFactorStatus?.enabled && (
                    <label>
                      验证器代码或恢复码
                      <input
                        autoComplete="one-time-code"
                        maxLength={20}
                        value={accountDeletionCode}
                        onChange={(event) =>
                          setAccountDeletionCode(
                            event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                          )
                        }
                      />
                    </label>
                  )}
                  <label>
                    输入“注销账号”确认
                    <input
                      value={accountDeletionConfirmation}
                      onChange={(event) => setAccountDeletionConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={
                      isAccountDeletionBusy ||
                      !accountDeletionPassword ||
                      accountDeletionConfirmation !== '注销账号' ||
                      Boolean(twoFactorStatus?.enabled && !accountDeletionCode)
                    }
                    onClick={() => void requestAccountDeletion()}
                  >
                    <Trash2 size={16} aria-hidden />
                    {isAccountDeletionBusy ? '提交中...' : '申请注销账号'}
                  </button>
                </div>
              </div>
            )}
          </section>}
        </section>
      )}

      {isAuthenticated && workspaceView === 'account' && accountView === 'activity' && (
        <section className="panel settings-panel login-activity-panel">
          <div className="section-title">
            <div>
              <h2>登录历史</h2>
              <span className="muted">{loginActivities?.pagination.total ?? 0} 条</span>
            </div>
            <ShieldAlert size={18} aria-hidden />
          </div>
          {isLoadingLoginActivities && <p className="state-line">登录历史加载中...</p>}
          {!isLoadingLoginActivities && loginActivities?.items.length === 0 && (
            <p className="state-line">暂无登录记录</p>
          )}
          <div className="login-activity-list">
            {loginActivities?.items.map((activity) => (
              <article className="login-activity-row" key={activity.id}>
                <div
                  className={
                    activity.status === 'SUCCESS'
                      ? 'login-activity-icon success'
                      : 'login-activity-icon failure'
                  }
                >
                  {activity.status === 'SUCCESS' ? (
                    <CircleCheckBig size={18} aria-hidden />
                  ) : (
                    <CircleX size={18} aria-hidden />
                  )}
                </div>
                <div className="login-activity-content">
                  <div>
                    <strong>{activity.status === 'SUCCESS' ? '登录成功' : '登录失败'}</strong>
                    <span>{activity.deviceName}</span>
                    {activity.riskLevel !== 'NORMAL' && (
                      <span className={`login-risk-badge ${activity.riskLevel.toLowerCase()}`}>
                        {activity.riskLevel === 'HIGH' ? '高风险' : '需留意'}
                      </span>
                    )}
                  </div>
                  <p>
                    {activity.ipAddress || '未知网络'} · {formatSessionTime(activity.occurredAt)}
                  </p>
                  {activity.failureReason && (
                    <small>{loginFailureText(activity.failureReason)}</small>
                  )}
                </div>
              </article>
            ))}
          </div>
          {(loginActivities?.pagination.totalPages ?? 0) > 1 && (
            <div className="pagination-row">
              <button
                className="ghost-button"
                disabled={loginActivityPage <= 1}
                type="button"
                onClick={() => setLoginActivityPage((current) => current - 1)}
              >
                <ChevronLeft size={16} aria-hidden />
                上一页
              </button>
              <span>
                {loginActivityPage} / {loginActivities?.pagination.totalPages}
              </span>
              <button
                className="ghost-button"
                disabled={loginActivityPage >= (loginActivities?.pagination.totalPages ?? 1)}
                type="button"
                onClick={() => setLoginActivityPage((current) => current + 1)}
              >
                下一页
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          )}
        </section>
      )}

      {isAuthenticated && workspaceView === 'reading' && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>阅读统计</h2>
            <span className="muted">{readingHistories.length} 本</span>
          </div>
          {isLoadingReadingStats ? (
            <p className="state-line">统计加载中...</p>
          ) : (
            <div className="reading-stats-grid">
              <article>
                <Clock3 size={20} aria-hidden />
                <span>
                  <strong>{formatReadingDuration(readingStats.totalSeconds)}</strong>
                  <small>累计阅读</small>
                </span>
              </article>
              <article>
                <BookOpen size={20} aria-hidden />
                <span>
                  <strong>{readingHistories.length}</strong>
                  <small>读过作品</small>
                </span>
              </article>
              <article className="most-read-stat">
                <BookOpen size={20} aria-hidden />
                <span>
                  {readingStats.mostRead ? (
                    <Link to={`/chapters/${readingStats.mostRead.chapter.id}`}>
                      {readingStats.mostRead.novel.title}
                    </Link>
                  ) : (
                    <strong>暂无</strong>
                  )}
                  <small>
                    最常阅读
                    {readingStats.mostRead
                      ? ` · ${formatReadingDuration(readingStats.mostRead.readingSeconds)}`
                      : ''}
                  </small>
                </span>
              </article>
            </div>
          )}
        </section>
      )}

      {isAuthenticated && workspaceView === 'reading' && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>阅读历史</h2>
            <button
              className="danger-button"
              type="button"
              disabled={readingHistories.length === 0 || isClearingHistory}
              onClick={() => void clearReadingHistories()}
            >
              <Trash2 size={16} aria-hidden />
              {isClearHistoryPending ? '确认清空' : '清空历史'}
            </button>
          </div>
          {readingHistories.length === 0 && <p className="state-line">暂无阅读历史</p>}
          <div className="reading-history-management">
            {readingHistories.map((history) => (
              <article key={history.id}>
                <Link to={`/chapters/${history.chapter.id}`}>
                  <BookOpen size={18} aria-hidden />
                  <span>
                    <strong>{history.novel.title}</strong>
                    <small>
                      {history.chapter.title} · {history.progress}% ·{' '}
                      {formatReadingDuration(history.readingSeconds)}
                    </small>
                  </span>
                </Link>
                <button
                  className={`icon-button remove-button${pendingHistoryDeleteId === history.novelId ? ' pending' : ''}`}
                  type="button"
                  disabled={deletingHistoryId === history.novelId}
                  onClick={() => void deleteReadingHistory(history)}
                  aria-label={
                    pendingHistoryDeleteId === history.novelId
                      ? `确认删除《${history.novel.title}》的阅读历史`
                      : `删除《${history.novel.title}》的阅读历史`
                  }
                  title={pendingHistoryDeleteId === history.novelId ? '确认删除' : '删除历史'}
                >
                  <Trash2 size={16} aria-hidden />
                  {pendingHistoryDeleteId === history.novelId && <span>确认</span>}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && workspaceView === 'reading' && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>我的批注</h2>
            <span className="muted">{readingAnnotations.length} 条</span>
          </div>
          {readingAnnotations.length === 0 && <p className="state-line">暂无划线或批注</p>}
          <div className="annotation-management-list">
            {readingAnnotations.map((annotation) => (
              <article key={annotation.id}>
                <i
                  className={`annotation-color-dot annotation-${annotation.color.toLowerCase()}`}
                />
                <Link to={`/chapters/${annotation.chapter.id}`}>
                  <strong>{annotation.selectedText}</strong>
                  <small>
                    {annotation.chapter.novel.title} · {annotation.chapter.title}
                  </small>
                  {annotation.note && <p>{annotation.note}</p>}
                </Link>
                <button
                  className={`icon-button remove-button${pendingAnnotationDeleteId === annotation.id ? ' pending' : ''}`}
                  type="button"
                  disabled={deletingAnnotationId === annotation.id}
                  onClick={() => void deleteAnnotation(annotation)}
                  aria-label={
                    pendingAnnotationDeleteId === annotation.id ? '确认删除批注' : '删除批注'
                  }
                  title={pendingAnnotationDeleteId === annotation.id ? '确认删除' : '删除批注'}
                >
                  <Trash2 size={16} aria-hidden />
                  {pendingAnnotationDeleteId === annotation.id && <span>确认</span>}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && workspaceView === 'reading' && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>我的段评</h2>
            <span className="muted">{paragraphComments?.pagination.total ?? 0} 条</span>
          </div>
          {isLoadingParagraphComments && <p className="state-line">段评加载中...</p>}
          {!isLoadingParagraphComments && paragraphComments?.items.length === 0 && (
            <p className="state-line">还没有发表过段评</p>
          )}
          <div className="my-comment-list">
            {paragraphComments?.items.map((comment) => (
              <article key={comment.id}>
                <div>
                  <Link to={`/chapters/${comment.chapter.id}?paragraph=${comment.paragraphIndex}`}>
                    {comment.chapter.novel.title} · {comment.chapter.title} · 第{' '}
                    {comment.paragraphIndex + 1} 段
                  </Link>
                  <small>
                    {comment.parent ? `回复 ${comment.parent.user.nickname} · ` : ''}
                    {new Date(comment.createdAt).toLocaleString('zh-CN')}
                  </small>
                  <p>{comment.content}</p>
                </div>
                <button
                  className={`icon-button remove-button${pendingParagraphDeleteId === comment.id ? ' pending' : ''}`}
                  type="button"
                  disabled={deletingParagraphId === comment.id}
                  aria-label={pendingParagraphDeleteId === comment.id ? '确认删除段评' : '删除段评'}
                  title={pendingParagraphDeleteId === comment.id ? '确认删除' : '删除段评'}
                  onClick={() => void deleteParagraphComment(comment.id)}
                >
                  <Trash2 size={16} aria-hidden />
                  {pendingParagraphDeleteId === comment.id && <span>确认</span>}
                </button>
              </article>
            ))}
          </div>
          {(paragraphComments?.pagination.totalPages ?? 0) > 1 && (
            <div className="pagination-row">
              <button
                className="ghost-button"
                type="button"
                disabled={paragraphPage <= 1}
                onClick={() => setParagraphPage((current) => current - 1)}
              >
                <ChevronLeft size={16} aria-hidden />
                上一页
              </button>
              <span>
                {paragraphPage} / {paragraphComments?.pagination.totalPages}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={paragraphPage >= (paragraphComments?.pagination.totalPages ?? 1)}
                onClick={() => setParagraphPage((current) => current + 1)}
              >
                下一页
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          )}
        </section>
      )}

      {isAuthenticated && workspaceView === 'reading' && (
        <section className="panel settings-panel">
          <div className="section-title">
            <h2>我的评论</h2>
            <span className="muted">{comments?.pagination.total ?? 0} 条</span>
          </div>
          {isLoadingComments && <p className="state-line">评论加载中...</p>}
          {!isLoadingComments && comments?.items.length === 0 && (
            <p className="state-line">还没有发表过评论</p>
          )}
          <div className="my-comment-list">
            {comments?.items.map((comment) => (
              <article key={comment.id}>
                <div>
                  <Link
                    to={
                      comment.chapter
                        ? `/chapters/${comment.chapter.id}`
                        : `/novels/${comment.novel.id}`
                    }
                  >
                    {comment.novel.title}
                    {comment.chapter ? ` · ${comment.chapter.title}` : ''}
                  </Link>
                  <small>{new Date(comment.createdAt).toLocaleString('zh-CN')}</small>
                  <p>{comment.content}</p>
                </div>
                <button
                  className={`icon-button remove-button${pendingDeleteId === comment.id ? ' pending' : ''}`}
                  type="button"
                  disabled={deletingId === comment.id}
                  aria-label={pendingDeleteId === comment.id ? '确认删除评论' : '删除评论'}
                  title={pendingDeleteId === comment.id ? '确认删除' : '删除评论'}
                  onClick={() => void deleteComment(comment.id)}
                >
                  <Trash2 size={16} aria-hidden />
                  {pendingDeleteId === comment.id && <span>确认</span>}
                </button>
              </article>
            ))}
          </div>
          {(comments?.pagination.totalPages ?? 0) > 1 && (
            <div className="pagination-row">
              <button
                className="ghost-button"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft size={16} aria-hidden />
                上一页
              </button>
              <span>
                {page} / {comments?.pagination.totalPages}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={page >= (comments?.pagination.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          )}
        </section>
      )}

      {workspaceView === 'local' && <section className="panel settings-panel">
        <h2>本地环境</h2>
        <dl className="settings-list">
          <div>
            <dt>API</dt>
            <dd>{import.meta.env.VITE_API_BASE_URL ?? '/api'}</dd>
          </div>
          <div>
            <dt>用户端</dt>
            <dd>http://localhost:5300</dd>
          </div>
          <div>
            <dt>管理端</dt>
            <dd>http://localhost:5301</dd>
          </div>
        </dl>
      </section>}
    </section>
  );
}

function roleText(role: string) {
  const roles: Record<string, string> = { READER: '读者', AUTHOR: '作者', ADMIN: '管理员' };
  return roles[role] ?? role;
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loginFailureText(reason: string) {
  const reasons: Record<string, string> = {
    INVALID_PASSWORD: '密码验证未通过',
    SUSPENDED_ACCOUNT: '账号当前不可登录',
    UNKNOWN_ACCOUNT: '账号验证未通过',
  };
  return reasons[reason] ?? '登录验证未通过';
}
