import { useCallback, useEffect, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Header, type AccountTab, type AppRoute } from './components/Header';
import { AuthProvider } from './context/AuthContext';
import { AccountPage } from './pages/AccountPage';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SupportPage } from './pages/SupportPage';

const ACCOUNT_TABS: ReadonlySet<string> = new Set<AccountTab>([
  'profile',
  'wallet',
  'custom-prices',
  'favorites',
  'orders',
  'seller',
  'notifications',
  'security',
  'admin-pricing',
]);

function parseRouteFromLocation(): AppRoute {
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);

  if (path === '/' || path === '') {
    return { name: 'home' };
  }

  if (path.startsWith('/ban-ve/')) {
    const slug = decodeURIComponent(path.replace('/ban-ve/', '').replace(/\/$/, ''));
    if (slug) return { name: 'product', slug };
  }

  if (path === '/danh-muc' || path === '/tim-kiem') {
    const tagParam = search.get('tag');
    const tag =
      tagParam === 'featured' || tagParam === 'new' || tagParam === 'free'
        ? tagParam
        : undefined;
    return {
      name: 'catalog',
      category: search.get('category') || undefined,
      tag,
      q: search.get('q') || undefined,
    };
  }

  if (path === '/tai-khoan') {
    const tabParam = search.get('tab') || 'profile';
    const tab: AccountTab = ACCOUNT_TABS.has(tabParam)
      ? (tabParam as AccountTab)
      : 'profile';
    return { name: 'account', tab };
  }

  if (path === '/ho-tro') {
    return { name: 'support' };
  }

  return { name: 'not-found', path };
}

function buildUrlFromRoute(route: AppRoute): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'catalog': {
      const params = new URLSearchParams();
      if (route.category) params.set('category', route.category);
      if (route.tag) params.set('tag', route.tag);
      if (route.q) params.set('q', route.q);
      const qs = params.toString();
      return qs ? `/danh-muc?${qs}` : '/danh-muc';
    }
    case 'product':
      return `/ban-ve/${encodeURIComponent(route.slug)}`;
    case 'account':
      return route.tab && route.tab !== 'profile'
        ? `/tai-khoan?tab=${route.tab}`
        : '/tai-khoan';
    case 'support':
      return '/ho-tro';
    case 'not-found':
      return route.path;
  }
}

function SisRouterShell() {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromLocation());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRouteFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    const nextUrl = buildUrlFromRoute(nextRoute);
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openAuth = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#142C48]">
      <Header currentRoute={route} onNavigate={navigate} onOpenAuth={openAuth} />

      <main className="flex-1">
        {route.name === 'home' && <HomePage onNavigate={navigate} />}
        {route.name === 'catalog' && (
          <CatalogPage
            initialCategory={route.category}
            initialTag={route.tag}
            initialQuery={route.q}
            onNavigate={navigate}
          />
        )}
        {route.name === 'product' && (
          <ProductDetailPage
            slug={route.slug}
            onNavigate={navigate}
            onRequireAuth={() => openAuth('login')}
          />
        )}
        {route.name === 'account' && (
          <AccountPage
            initialTab={route.tab}
            onNavigate={navigate}
            onRequireAuth={() => openAuth('login')}
          />
        )}
        {route.name === 'support' && <SupportPage />}
        {route.name === 'not-found' && (
          <NotFoundPage path={route.path} onNavigate={navigate} />
        )}
      </main>

      <Footer onNavigate={navigate} />

      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onOpenChange={setAuthModalOpen}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SisRouterShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
