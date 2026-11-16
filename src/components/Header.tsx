import { useState } from 'react';
import { Menu, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SisLogo } from './SisLogo';
import { Button } from './ui/button';

export type AccountTab =
  | 'profile'
  | 'wallet'
  | 'custom-prices'
  | 'favorites'
  | 'orders'
  | 'seller'
  | 'notifications'
  | 'security'
  | 'admin-pricing';

export type AppRoute =
  | { name: 'home' }
  | { name: 'catalog'; category?: string; tag?: 'featured' | 'new' | 'free'; q?: string }
  | { name: 'product'; slug: string }
  | { name: 'account'; tab?: AccountTab }
  | { name: 'support' }
  | { name: 'not-found'; path: string };

interface HeaderProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
}

export function Header({ currentRoute, onNavigate, onOpenAuth }: HeaderProps) {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ label: string; active: boolean; route: AppRoute }> = [
    {
      label: 'Trang chủ',
      active: currentRoute.name === 'home',
      route: { name: 'home' },
    },
    {
      label: 'Danh mục',
      active: currentRoute.name === 'catalog' && !currentRoute.tag,
      route: { name: 'catalog' },
    },
    {
      label: 'Nổi bật',
      active: currentRoute.name === 'catalog' && currentRoute.tag === 'featured',
      route: { name: 'catalog', tag: 'featured' },
    },
    {
      label: 'Miễn phí',
      active: currentRoute.name === 'catalog' && currentRoute.tag === 'free',
      route: { name: 'catalog', tag: 'free' },
    },
    {
      label: 'Hỗ trợ',
      active: currentRoute.name === 'support',
      route: { name: 'support' },
    },
  ];

  const handleNav = (route: AppRoute) => {
    setMobileOpen(false);
    onNavigate(route);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav({ name: 'home' })}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#142C48] rounded-md cursor-pointer"
          aria-label="Về trang chủ THƯ VIỆN SIS"
        >
          <SisLogo />
        </button>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`text-sm font-semibold whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                item.active
                  ? 'border-[#142C48] text-[#142C48]'
                  : 'border-transparent text-slate-600 hover:text-[#142C48] hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {loading ? (
            <div className="h-9 w-28 rounded-lg bg-slate-100 animate-pulse" />
          ) : user ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleNav({ name: 'account', tab: 'profile' })}
              className="max-w-[200px]"
            >
              <User className="w-4 h-4 shrink-0 text-[#F2C94C]" />
              <span className="truncate">{user.fullName}</span>
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => onOpenAuth('login')}
            >
              Đăng nhập
            </Button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-[#142C48] hover:bg-[#F5F7FA]"
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold ${
                item.active
                  ? 'bg-[#F5F7FA] text-[#142C48]'
                  : 'text-slate-600 hover:bg-[#F5F7FA] hover:text-[#142C48]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
