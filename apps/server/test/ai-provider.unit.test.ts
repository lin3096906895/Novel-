import { BadRequestException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AI_API_KEY_HEADER,
  AI_BASE_URL_HEADER,
  AI_MODEL_HEADER,
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  parseAllowedHosts,
  resolveAiProviderCredentials,
} from '../src/modules/ai/ai-provider';

describe('resolveAiProviderCredentials', () => {
  it('returns empty apiKey when the reader has not provided one', () => {
    const credentials = resolveAiProviderCredentials({});
    assert.equal(credentials.apiKey, '');
    assert.equal(credentials.baseUrl, DEFAULT_AI_BASE_URL);
    assert.equal(credentials.model, DEFAULT_AI_MODEL);
  });

  it('reads the reader-provided key, base url and model from headers', () => {
    const credentials = resolveAiProviderCredentials({
      [AI_API_KEY_HEADER]: 'sk-user-key',
      [AI_BASE_URL_HEADER]: 'https://api.siliconflow.cn/v1/',
      [AI_MODEL_HEADER]: 'deepseek-ai/DeepSeek-V3',
    });
    assert.equal(credentials.apiKey, 'sk-user-key');
    assert.equal(credentials.baseUrl, 'https://api.siliconflow.cn/v1');
    assert.equal(credentials.model, 'deepseek-ai/DeepSeek-V3');
  });

  it('falls back to the configured defaults when only a key is provided', () => {
    const credentials = resolveAiProviderCredentials(
      { [AI_API_KEY_HEADER]: 'sk-user-key' },
      { baseUrl: 'https://api.deepseek.com/', model: 'deepseek-reasoner' },
    );
    assert.equal(credentials.baseUrl, 'https://api.deepseek.com');
    assert.equal(credentials.model, 'deepseek-reasoner');
  });

  it('trims surrounding whitespace from the provided key', () => {
    const credentials = resolveAiProviderCredentials({ [AI_API_KEY_HEADER]: '  sk-user-key  ' });
    assert.equal(credentials.apiKey, 'sk-user-key');
  });

  it('takes the first value when a header arrives multiple times', () => {
    const credentials = resolveAiProviderCredentials({ [AI_API_KEY_HEADER]: ['first', 'second'] });
    assert.equal(credentials.apiKey, 'first');
  });
});

describe('normalizeAiBaseUrl (SSRF guard)', () => {
  const allowed = parseAllowedHosts();

  it('accepts an allowlisted provider over https and strips trailing slashes', () => {
    assert.equal(
      normalizeAiBaseUrl('https://api.deepseek.com/', allowed),
      'https://api.deepseek.com',
    );
    assert.equal(
      normalizeAiBaseUrl('https://api.moonshot.cn/v1', allowed),
      'https://api.moonshot.cn/v1',
    );
  });

  it('rejects loopback and private network targets', () => {
    for (const target of [
      'http://127.0.0.1:3000',
      'https://127.0.0.1',
      'https://localhost',
      'https://10.0.0.5',
      'https://192.168.1.10',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      assert.throws(() => normalizeAiBaseUrl(target, allowed), BadRequestException, target);
    }
  });

  it('requires https even for an allowlisted host', () => {
    assert.throws(
      () => normalizeAiBaseUrl('http://api.deepseek.com', allowed),
      BadRequestException,
    );
  });

  it('rejects a malformed url', () => {
    assert.throws(() => normalizeAiBaseUrl('not-a-url', allowed), BadRequestException);
  });

  it('honours extra hosts supplied by the operator', () => {
    const extended = parseAllowedHosts('ai.example.com, ai.internal.example.org');
    assert.equal(
      normalizeAiBaseUrl('https://ai.example.com/v1', extended),
      'https://ai.example.com/v1',
    );
    assert.throws(() => normalizeAiBaseUrl('https://ai.example.com', allowed), BadRequestException);
  });
});
