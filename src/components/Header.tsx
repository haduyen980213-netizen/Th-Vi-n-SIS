import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Shield,
  Store,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
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
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Keep header search input synced when navigating to catalog with a query
  useEffect(() => {
    if (currentRoute.name === 'catalog') {
      setSearchInput(currentRoute.q || '');
    }
  }, [currentRoute]);

  // Fetch real unread notification count when user is logged in
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setUnreadCount(0);
      return;
    }
    apiRequest<{ unreadCount: number }>('/notifications')
      .then((res) => {
        if (!cancelled) {
          setUnreadCount(res.unreadCount || 0);
        }
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, currentRoute.name]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: Array<{
    label: string;
    active: boolean;
    route: AppRoute;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      label: 'Trang chủ',
      active: currentRoute.name === 'home',
      route: { name: 'home' },
      icon: Home,
    },
    {
      label: 'Kho bản vẽ',
      active: currentRoute.name === 'catalog',
      route: { name: 'catalog' },
      icon: Store,
    },
    {
      label: 'Tài khoản',
      active: currentRoute.name === 'account',
      route: { name: 'account', tab: 'profile' },
      icon: User,
    },
    {
      label: 'Hỗ trợ',
      active: currentRoute.name === 'support',
      route: { name: 'support' },
      icon: LifeBuoy,
    },
  ];

  const handleNav = (route: AppRoute) => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    if (route.name === 'account' && !user) {
      onOpenAuth('login');
      return;
    }
    onNavigate(route);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMobileOpen(false);
    onNavigate({ name: 'catalog', q: searchInput.trim() || undefined });
  };

  const isAdmin = Boolean(user?.roles.includes('ADMIN'));
  const isSeller = Boolean(user?.roles.includes('SELLER'));
  const userInitial = (user?.fullName || 'S').trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur border-b border-slate-200/90 shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 h-[68px] flex items-center justify-between gap-4 lg:gap-6">
        {/* Zone 1: Brand Emblem & Wordmark */}
        <button
          type="button"
          onClick={() => handleNav({ name: 'home' })}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B56B8] rounded-lg cursor-pointer shrink-0"
          aria-label="Về trang chủ THƯ VIỆN SIS"
        >
          <SisLogo showSubtitle />
        </button>

        {/* Zone 2: Pill Search Bar (Desktop & Tablet) */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-md lg:max-w-lg items-center relative"
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm kiếm bản vẽ CAD, Revit, BIM, hồ sơ kỹ thuật..."
            aria-label="Tìm kiếm bản vẽ"
            className="w-full h-10 pl-4 pr-11 rounded-full bg-[#F4F7FC] border border-slate-200 text-sm text-[#142C48] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B56B8] focus:border-transparent transition-colors"
          />
          <button
            type="submit"
            aria-label="Tìm kiếm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#1B56B8] hover:bg-[#1B56B8]/10 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>

        {/* Zone 3: Navigation Links + Notifications + Account */}
        <div className="flex items-center gap-2 lg:gap-4 shrink-0">
          <nav className="hidden xl:flex items-center gap-1" aria-label="Điều hướng chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleNav(item.route)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    item.active
                      ? 'text-[#1B56B8] bg-[#1B56B8]/8'
                      : 'text-slate-600 hover:text-[#1B56B8] hover:bg-[#F4F7FC]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Real Notification Bell */}
          <button
            type="button"
            onClick={() => handleNav({ name: 'account', tab: 'notifications' })}
            aria-label="Thông báo tài khoản"
            className="relative inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold text-slate-600 hover:text-[#1B56B8] hover:bg-[#F4F7FC] transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Thông báo</span>
            {unreadCount > 0 && (
              <span className="absolute top-1 left-4 sm:static sm:ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Account Menu or Login CTA */}
          {loading ? (
            <div className="h-9 w-28 rounded-full bg-slate-100 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-[#F4F7FC] transition-colors cursor-pointer max-w-[190px]"
              >
                <span className="w-7 h-7 rounded-full bg-[#1B56B8] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {userInitial}
                </span>
                <span className="text-xs font-bold text-[#142C48] truncate hidden sm:inline">
                  {user.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-xs font-bold text-[#142C48] truncate">
                      {user.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNav({ name: 'account', tab: 'profile' })}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-[#142C48] hover:bg-[#F4F7FC] flex items-center gap-2 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-[#1B56B8]" />
                    Hồ sơ tài khoản
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNav({ name: 'account', tab: 'wallet' })}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-[#142C48] hover:bg-[#F4F7FC] flex items-center gap-2 cursor-pointer"
                  >
                    <Wallet className="w-3.5 h-3.5 text-[#1B56B8]" />
                    Ví VND &amp; Nạp QR SHB
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNav({ name: 'account', tab: 'orders' })}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-[#142C48] hover:bg-[#F4F7FC] flex items-center gap-2 cursor-pointer"
                  >
                    <Store className="w-3.5 h-3.5 text-[#1B56B8]" />
                    Đơn hàng &amp; Bản vẽ đã mua
                  </button>
                  {(isSeller || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => handleNav({ name: 'account', tab: 'seller' })}
                      className="w-full px-4 py-2 text-left text-xs font-semibold text-[#142C48] hover:bg-[#F4F7FC] flex items-center gap-2 cursor-pointer"
                    >
                      <Store className="w-3.5 h-3.5 text-[#1B56B8]" />
                      Gian hàng &amp; Đăng bản vẽ
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleNav({ name: 'account', tab: 'admin-pricing' })}
                      className="w-full px-4 py-2 text-left text-xs font-semibold text-[#1B56B8] hover:bg-[#F4F7FC] flex items-center gap-2 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#1B56B8]" />
                      Quản trị hệ thống
                    </button>
                  )}
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={async () => {
                      setUserMenuOpen(false);
                      await logout();
                      onNavigate({ name: 'home' });
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="rounded-full px-5"
              onClick={() => onOpenAuth('login')}
            >
              Đăng nhập
            </Button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="xl:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-[#142C48] hover:bg-[#F4F7FC] cursor-pointer"
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer & Search */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          <form onSubmit={handleSearchSubmit} className="md:hidden relative mb-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm bản vẽ CAD, Revit, BIM..."
              className="w-full h-10 pl-4 pr-10 rounded-full bg-[#F4F7FC] border border-slate-200 text-sm text-[#142C48]"
            />
            <button
              type="submit"
              aria-label="Tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#1B56B8]"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 ${
                  item.active
                    ? 'bg-[#1B56B8]/10 text-[#1B56B8]'
                    : 'text-slate-600 hover:bg-[#F4F7FC] hover:text-[#1B56B8]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
