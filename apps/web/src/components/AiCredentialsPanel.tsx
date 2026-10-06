import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_CREDENTIALS,
  clearAiCredentials,
  loadAiCredentials,
  maskAiApiKey,
  saveAiCredentials,
} from '../ai/aiCredentials';
import type { AiCredentials } from '../ai/aiCredentials';

type AiCredentialsPanelProps = {
  /** panel 用于设置页，inline 用于阅读端 / 作者端的内嵌场景。 */
  variant?: 'panel' | 'inline';
  onSaved?: () => void;
  onCleared?: () => void;
};

export function AiCredentialsPanel({
  variant = 'panel',
  onSaved,
  onCleared,
}: AiCredentialsPanelProps) {
  const [draft, setDraft] = useState<AiCredentials>(() => loadAiCredentials());
  const [savedKey, setSavedKey] = useState(() => loadAiCredentials().apiKey);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const hasSaved = savedKey.trim().length > 0;
  const matchedPreset = AI_PROVIDER_PRESETS.find((item) => item.baseUrl === draft.baseUrl);

  function applyPreset(baseUrl: string) {
    const preset = AI_PROVIDER_PRESETS.find((item) => item.baseUrl === baseUrl);
    if (!preset) {
      return;
    }
    setDraft((current) => ({ ...current, baseUrl: preset.baseUrl, model: preset.model }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    setError(undefined);

    const apiKey = draft.apiKey.trim();
    if (!apiKey) {
      setError('请填写你的 API Key。');
      return;
    }
    if (!draft.baseUrl.trim()) {
      setError('请填写 AI 接口地址。');
      return;
    }

    saveAiCredentials(draft);
    setSavedKey(apiKey);
    setDraft((current) => ({ ...current, apiKey }));
    setMessage('已保存到本机浏览器，仅用于你本人的 AI 请求。');
    onSaved?.();
  }

  function handleClear() {
    clearAiCredentials();
    setDraft({ ...DEFAULT_AI_CREDENTIALS });
    setSavedKey('');
    setError(undefined);
    setMessage('已清除本机保存的 AI 凭据。');
    onCleared?.();
  }

  return (
    <form
      className={`ai-credentials ai-credentials-${variant}`}
      onSubmit={handleSubmit}
      aria-label="AI API Key 设置"
    >
      {variant === 'panel' && (
        <header className="ai-credentials-header">
          <h2>
            <KeyRound size={18} aria-hidden />
            AI 助手 API Key
          </h2>
          <p>
            阅界 AI 与创作助手由你自己提供 API Key 驱动。Key 只保存在当前浏览器，不会写入服务器数据库。
          </p>
        </header>
      )}

      <p className={hasSaved ? 'ai-credentials-status ai-credentials-status-on' : 'ai-credentials-status'}>
        <ShieldCheck size={14} aria-hidden />
        {hasSaved ? `已配置：${maskAiApiKey(savedKey)}` : '尚未配置，AI 功能暂不可用'}
      </p>

      {(error || message) && (
        <p className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}

      <label className="ai-credentials-field">
        <span>服务商</span>
        <select
          value={matchedPreset ? matchedPreset.baseUrl : 'custom'}
          onChange={(event) => applyPreset(event.target.value)}
        >
          {AI_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.baseUrl} value={preset.baseUrl}>
              {preset.label}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </label>

      <label className="ai-credentials-field">
        <span>API Key</span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="ai-credentials-field">
        <span>接口地址</span>
        <input
          type="url"
          value={draft.baseUrl}
          onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
          placeholder="https://api.deepseek.com"
          spellCheck={false}
        />
      </label>

      <label className="ai-credentials-field">
        <span>模型</span>
        <input
          type="text"
          value={draft.model}
          onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
          placeholder="deepseek-v4-flash"
          spellCheck={false}
        />
      </label>

      <div className="ai-credentials-actions">
        <button className="primary-link" type="submit">
          保存
        </button>
        <button
          className="ai-credentials-clear"
          type="button"
          onClick={handleClear}
          disabled={!hasSaved && !draft.apiKey.trim()}
        >
          <Trash2 size={14} aria-hidden />
          清除
        </button>
      </div>

      <small className="ai-credentials-note">
        接口地址需为 https 且属于服务端允许的服务商域名。填错时 AI 请求会被拒绝。
      </small>
    </form>
  );
}
