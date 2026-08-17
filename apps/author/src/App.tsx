import { BookOpen, LogOut, UserRound } from 'lucide-react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../web/src/auth/AuthContext';
import { AuthorPage } from '../../web/src/pages/AuthorPage';
import { LoginPage } from '../../web/src/pages/LoginPage';

const readerPortalUrl = import.meta.env.VITE_READER_APP_URL ?? 'http://localhost:5300';

function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  return (
    <div className="author-portal-shell">
      <header className="author-portal-header">
        <a className="author-portal-brand" href={readerPortalUrl}>
          <BookOpen size={22} aria-hidden />
          <span>阅界创作中心</span>
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
      <main className="author-portal-main">
        <Routes>
          <Route path="/" element={<AuthorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
