/**
 * 跨门户链接（阅读端 / 作者端 / 管理端）的地址推导。
 *
 * 部署拓扑：
 * - 线上：阅读端直接暴露在默认端口（http 80 / https 443），作者端 5302、管理端 5301；
 * - 本地开发：三个前端分别跑在 5300 / 5301 / 5302。
 *
 * 因此阅读端地址不能简单地在当前 host 后面拼 `:5300`，否则线上会指向一个没有服务的端口。
 * 每个地址都支持用 Vite 环境变量覆盖（VITE_READER_APP_URL / VITE_AUTHOR_APP_URL /
 * VITE_ADMIN_APP_URL），用于自定义域名等场景。
 */

const READER_DEV_PORT = 5300;
const AUTHOR_PORT = 5302;
const ADMIN_PORT = 5301;

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function currentLocation() {
  const { protocol, hostname } = window.location;
  return { protocol, hostname };
}

export function resolveReaderAppUrl(): string {
  const configured = import.meta.env.VITE_READER_APP_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }

  const { protocol, hostname } = currentLocation();
  // 本地开发时阅读端独立占用 5300；线上则位于默认端口，不能带端口号。
  return isLocalHostname(hostname)
    ? `${protocol}//${hostname}:${READER_DEV_PORT}`
    : `${protocol}//${hostname}`;
}

export function resolveAuthorAppUrl(): string {
  const configured = import.meta.env.VITE_AUTHOR_APP_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }

  const { protocol, hostname } = currentLocation();
  return `${protocol}//${hostname}:${AUTHOR_PORT}`;
}

export function resolveAdminAppUrl(): string {
  const configured = import.meta.env.VITE_ADMIN_APP_URL;
  if (configured) {
    return trimTrailingSlash(configured);
  }

  const { protocol, hostname } = currentLocation();
  return `${protocol}//${hostname}:${ADMIN_PORT}`;
}
