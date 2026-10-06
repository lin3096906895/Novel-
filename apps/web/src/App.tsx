import {
  Bell,
  BookOpen,
  Library,
  LogOut,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AuthorProfilePage } from './pages/AuthorProfilePage';
import { BookshelfPage } from './pages/BookshelfPage';
import { CatalogPage } from './pages/CatalogPage';
import { LoginPage } from './pages/LoginPage';
import { FollowingPage } from './pages/FollowingPage';
import { NovelDetailPage } from './pages/NovelDetailPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { RankingPage } from './pages/RankingPage';
import { ReaderPage } from './pages/ReaderPage';
import { SettingsPage } from './pages/SettingsPage';
import { resolveAdminAppUrl, resolveAuthorAppUrl } from './utils/portalUrls';

function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const authorPortalUrl = resolveAuthorAppUrl();
  const adminPortalUrl = resolveAdminAppUrl();
  const isReaderRoute = location.pathname.startsWith('/chapters/');
  const contentRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    document.title = `${pageTitle(location.pathname)} - 阅界小说`;
    if (previousPathRef.current === location.pathname) {
      return;
    }

    previousPathRef.current = location.pathname;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const focusFrame = window.requestAnimationFrame(() => {
      contentRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [location.pathname]);

  return (
    <div className={`app-shell${isReaderRoute ? ' reader-shell' : ''}`}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {!isReaderRoute && (
        <aside className="sidebar">
          <NavLink className="brand" to="/">
            <span className="brand-symbol">
              <BookOpen size={22} aria-hidden />
            </span>
            <span className="brand-copy">
              <strong>阅界</strong>
              <small>READING UNIVERSE</small>
            </span>
          </NavLink>
          <nav className="nav-list" aria-label="主导航">
            <div className="nav-section">
              <span className="nav-section-label">发现</span>
              <NavLink className="nav-item" to="/">
                <Library size={18} aria-hidden />
                书城
              </NavLink>
              <NavLink className="nav-item" to="/rankings">
                <Search size={18} aria-hidden />
                榜单
              </NavLink>
            </div>

            <div className="nav-section">
              <span className="nav-section-label">我的阅读</span>
              <NavLink className="nav-item" to="/bookshelf">
                <BookOpen size={18} aria-hidden />
                书架
              </NavLink>
              <NavLink className="nav-item" to="/following">
                <UsersRound size={18} aria-hidden />
                关注
              </NavLink>
              <NavLink className="nav-item" to="/notifications">
                <Bell size={18} aria-hidden />
                通知
              </NavLink>
            </div>

            <div className="nav-section">
              <span className="nav-section-label">创作与管理</span>
              <a className="nav-item" href={authorPortalUrl}>
                <PenLine size={18} aria-hidden />
                写作
              </a>
              {user?.role === 'ADMIN' && (
                <a className="nav-item" href={adminPortalUrl}>
                  <ShieldCheck size={18} aria-hidden />
                  管理后台
                </a>
              )}
              <NavLink className="nav-item" to="/settings">
                <Settings size={18} aria-hidden />
                设置
              </NavLink>
            </div>
          </nav>

          {isAuthenticated && user ? (
            <div className="profile-card">
              <div>
                <strong>{user.nickname}</strong>
                <span>{roleText(user.role)}</span>
              </div>
              <button type="button" onClick={logout} aria-label="退出登录">
                <LogOut size={17} aria-hidden />
              </button>
            </div>
          ) : (
            <NavLink className="profile-button" to="/login" aria-label="打开登录页">
              <UserRound size={18} aria-hidden />
              登录
            </NavLink>
          )}
        </aside>
      )}

      <main className="content" id="main-content" ref={contentRef} tabIndex={-1}>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/rankings" element={<RankingPage />} />
          <Route path="/novels/:id" element={<NovelDetailPage />} />
          <Route path="/authors/:id" element={<AuthorProfilePage />} />
          <Route path="/chapters/:id" element={<ReaderPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/author" element={<Navigate replace to="/" />} />
          <Route path="/bookshelf" element={<BookshelfPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname === '/') return '书城';
  if (pathname === '/rankings') return '榜单';
  if (pathname === '/bookshelf') return '书架';
  if (pathname === '/following') return '我的关注';
  if (pathname === '/author') return '作者工作台';
  if (pathname === '/notifications') return '通知';
  if (pathname === '/settings') return '设置';
  if (pathname === '/login') return '账户';
  if (pathname.startsWith('/novels/')) return '作品详情';
  if (pathname.startsWith('/authors/')) return '作者主页';
  if (pathname.startsWith('/chapters/')) return '阅读器';
  return '阅界小说';
}

function roleText(role: string) {
  const roles: Record<string, string> = {
    READER: '读者',
    AUTHOR: '作者',
    ADMIN: '管理员',
  };
  return roles[role] ?? role;
}

export default App;
