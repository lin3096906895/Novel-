import { BookOpen, LogOut, UserRound } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../web/src/auth/AuthContext';
import { AuthorPage } from '../../web/src/pages/AuthorPage';
import { LoginPage } from '../../web/src/pages/LoginPage';
import { resolveReaderAppUrl } from '../../web/src/utils/portalUrls';

const readerPortalUrl = resolveReaderAppUrl();

function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const isLogin = location.pathname === '/login';
  const isWriting = location.pathname.startsWith('/write/');

  return (
    <div className={`author-portal-shell${isWriting ? ' writing-mode' : ''}`}>
      <header className="author-portal-header">
        <a className="author-portal-brand" href={readerPortalUrl}>
          <span className="author-portal-brand-symbol">
            <BookOpen size={20} aria-hidden />
          </span>
          <span className="author-portal-brand-copy">
            <strong>阅界创作</strong>
            <small>AUTHOR STUDIO</small>
          </span>
        </a>
        <div className="author-portal-actions">
          <a className="ghost-button" href={readerPortalUrl}>
            返回阅读端
          </a>
          {!isLogin && isAuthenticated && user && (
            <>
              <span className="author-portal-user">
                <UserRound size={16} aria-hidden />
                {user.nickname}
              </span>
              <button className="ghost-button" type="button" onClick={logout}>
                <LogOut size={16} aria-hidden />
                退出登录
              </button>
            </>
          )}
        </div>
      </header>
      <main className={`author-portal-main${isWriting ? ' writing-mode' : ''}`}>
        <Routes>
          <Route path="/" element={<AuthorPage />} />
          <Route path="/write/:novelId/:chapterId" element={<AuthorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
