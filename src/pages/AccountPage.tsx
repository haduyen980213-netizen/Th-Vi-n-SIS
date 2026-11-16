import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Download,
  Heart,
  Lock,
  LogOut,
  Shield,
  ShieldCheck,
  Store,
  Tag,
  User,
  Wallet,
} from 'lucide-react';
import { AdminPricingConsole } from '../components/AdminPricingConsole';
import type { AccountTab, AppRoute } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { SellerDashboardPanel } from '../components/SellerDashboardPanel';
import { WalletTopupPanel } from '../components/WalletTopupPanel';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatDateVi, formatVnd } from '../lib/format';
import type {
  CustomPriceRecord,
  NotificationRecord,
  ProductSummary,
  SignedDownloadResponse,
} from '../types/sis';

interface AccountPageProps {
  initialTab?: AccountTab;
  onNavigate: (route: AppRoute) => void;
  onRequireAuth: () => void;
}

interface OrderRecord {
  id: number;
  orderCode: string;
  totalAmountVnd: number;
  status: string;
  createdAt: string;
  items: Array<{
    id: number;
    productId: number;
    unitPriceSnapshotVnd: number;
    priceSource: string;
    productCode: string;
    productSlug: string;
    productTitle: string;
  }>;
}

interface DownloadsPayload {
  entitlements: Array<{
    id: number;
    productId: number;
    maxDownloads: number;
    downloadsUsed: number;
    grantedAt: string;
    productCode: string;
    productSlug: string;
    productTitle: string;
    fileFormat: string;
    fileSizeLabel: string;
  }>;
  logs: Array<{
    id: number;
    productId: number;
    downloadedAt: string;
    productCode: string;
    productTitle: string;
  }>;
}

export function AccountPage({
  initialTab = 'profile',
  onNavigate,
  onRequireAuth,
}: AccountPageProps) {
  const { user, profile, wallet, loading, refreshMe, logout } = useAuth();
  const [tab, setTab] = useState<AccountTab>(initialTab);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');

  // Security form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passNotice, setPassNotice] = useState('');
  const [passError, setPassError] = useState('');

  // Favorites
  const [favorites, setFavorites] = useState<ProductSummary[]>([]);
  const [favLoading, setFavLoading] = useState(false);

  // Stage 2: Custom Prices
  const [customPrices, setCustomPrices] = useState<CustomPriceRecord[]>([]);
  const [customPricesLoading, setCustomPricesLoading] = useState(false);

  // Stage 2 & 3: Orders & Downloads
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [downloads, setDownloads] = useState<DownloadsPayload>({
    entitlements: [],
    logs: [],
  });
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [downloadingProductId, setDownloadingProductId] = useState<number | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState('');
  const [downloadError, setDownloadError] = useState('');

  // Stage 2: Notifications
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
    }
    if (profile) {
      setCompanyName(profile.companyName || '');
      setJobTitle(profile.jobTitle || '');
      setTaxCode(profile.taxCode || '');
      setCity(profile.city || '');
      setAddress(profile.address || '');
      setBio(profile.bio || '');
    }
  }, [user, profile]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      const res = await apiRequest<{ items: NotificationRecord[]; unreadCount: number }>(
        '/notifications'
      );
      setNotifications(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore transient error
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  const loadOrdersAndDownloads = useCallback(async () => {
    if (!user) return;
    setOrdersLoading(true);
    try {
      const [orderRows, dlPayload] = await Promise.all([
        apiRequest<OrderRecord[]>('/users/me/orders'),
        apiRequest<DownloadsPayload>('/users/me/downloads'),
      ]);
      setOrders(orderRows);
      setDownloads(dlPayload);
    } catch {
      // Ignore transient error
    } finally {
      setOrdersLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;

    if (tab === 'favorites') {
      setFavLoading(true);
      apiRequest<any[]>('/favorites')
        .then((rows) => {
          const normalized: ProductSummary[] = rows.map((r) => ({
            id: r.id,
            code: r.code,
            slug: r.slug,
            title: r.title,
            summary: r.summary,
            fileFormat: r.fileFormat,
            softwareVersion: null,
            fileSizeLabel: r.fileSizeLabel,
            pageOrSheetCount: 1,
            thumbnailUrl: r.thumbnailUrl,
            approvalStatus: 'APPROVED',
            isFeatured: false,
            isFree: r.isFree,
            viewCount: 0,
            purchaseCount: 0,
            downloadCount: 0,
            ratingAvg: 5,
            publishedAt: r.savedAt,
            category: { id: 0, name: r.categoryName, slug: r.categorySlug },
            seller: { id: 0, displayName: 'THƯ VIỆN SIS', slug: 'sis' },
            pricing: r.pricing,
          }));
          setFavorites(normalized);
        })
        .catch(() => {})
        .finally(() => setFavLoading(false));
    } else if (tab === 'custom-prices') {
      setCustomPricesLoading(true);
      apiRequest<CustomPriceRecord[]>('/users/me/custom-prices')
        .then((rows) => setCustomPrices(rows))
        .catch(() => {})
        .finally(() => setCustomPricesLoading(false));
    } else if (tab === 'orders') {
      loadOrdersAndDownloads();
    } else if (tab === 'notifications') {
      loadNotifications();
    }
  }, [user, tab, loadNotifications]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-14">
        <div className="h-64 rounded-xl bg-[#F5F7FA] animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-5">
        <h1 className="font-display text-2xl font-bold text-[#142C48]">
          Đăng nhập để quản lý tài khoản
        </h1>
        <p className="text-sm text-slate-600">
          Vui lòng đăng nhập để xem hồ sơ cá nhân, nạp tiền nhanh VietQR SHB, chính sách giá riêng và lịch sử bản vẽ.
        </p>
        <Button onClick={onRequireAuth}>Đăng nhập / Đăng ký</Button>
      </div>
    );
  }

  const canAccessAdminPricing = user.roles.some(
    (r) =>
      r === 'ADMIN' ||
      r === 'SUPER_ADMIN' ||
      r === 'ACCOUNTANT' ||
      r === 'MODERATOR'
  );

  const selectTab = (nextTab: AccountTab) => {
    setTab(nextTab);
    onNavigate({ name: 'account', tab: nextTab });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice('');
    try {
      await apiRequest('/users/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          phone: phone.trim() || null,
          companyName: companyName.trim() || null,
          jobTitle: jobTitle.trim() || null,
          taxCode: taxCode.trim() || null,
          city: city.trim() || null,
          address: address.trim() || null,
          bio: bio.trim() || null,
        }),
      });
      await refreshMe();
      setProfileNotice('Đã lưu cập nhật hồ sơ thành công.');
    } catch (err: any) {
      setProfileNotice(err?.message || 'Không thể lưu hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPass(true);
    setPassNotice('');
    setPassError('');
    try {
      const res = await apiRequest<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword,
        }),
      });
      setPassNotice(res.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPassError(err?.message || 'Không thể đổi mật khẩu.');
    } finally {
      setSavingPass(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' });
      await loadNotifications();
    } catch {
      // Ignore error
    }
  };

  const handleMarkOneRead = async (id: number) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore error
    }
  };

  const handleDownloadFromEntitlement = async (productId: number) => {
    setDownloadingProductId(productId);
    setDownloadFeedback('');
    setDownloadError('');
    try {
      const signed = await apiRequest<SignedDownloadResponse>('/downloads/request-url', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      const link = document.createElement('a');
      link.href = signed.signedUrl;
      link.setAttribute('download', signed.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadFeedback(
        `Đã cấp liên kết tải bảo mật "${signed.filename}" (hiệu lực ${signed.expiresInSeconds} giây).`
      );
      window.setTimeout(() => {
        loadOrdersAndDownloads().catch(() => {});
      }, 900);
    } catch (err: any) {
      setDownloadError(err?.message || 'Không thể tải tệp bản vẽ.');
    } finally {
      setDownloadingProductId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    onNavigate({ name: 'home' });
  };

  const navItems: Array<{
    id: AccountTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'profile', label: 'Thông tin cá nhân', icon: User },
    { id: 'wallet', label: 'Ví & Nạp nhanh SHB', icon: Wallet },
    { id: 'custom-prices', label: 'Giá ưu đãi riêng', icon: Tag },
    { id: 'orders', label: 'Đơn hàng & Lịch sử tải', icon: Download },
    { id: 'seller', label: 'Kênh Người bán', icon: Store },
    { id: 'favorites', label: 'Bản vẽ yêu thích', icon: Heart },
    {
      id: 'notifications',
      label: unreadCount > 0 ? `Thông báo (${unreadCount})` : 'Thông báo',
      icon: Bell,
    },
    { id: 'security', label: 'Bảo mật & Mật khẩu', icon: Lock },
  ];

  if (canAccessAdminPricing) {
    navItems.push({
      id: 'admin-pricing',
      label: 'Quản trị Hệ thống',
      icon: ShieldCheck,
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5 space-y-6">
          <div className="space-y-1.5 pb-4 border-b border-slate-200">
            <div className="font-display text-base font-bold text-[#142C48] truncate">
              {user.fullName}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
            <div className="text-xs font-mono-tech text-slate-600">
              Vai trò: {user.roles.join(' · ')}
            </div>
            <div className="pt-2 flex items-baseline justify-between border-t border-slate-100">
              <span className="text-[11px] font-medium text-slate-500">Số dư ví</span>
              <span className="text-sm font-extrabold text-[#142C48] tabular-nums">
                {formatVnd(wallet?.availableBalanceVnd ?? 0)}
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer text-left ${
                    tab === item.id
                      ? 'bg-[#142C48] text-white'
                      : 'text-slate-600 hover:bg-[#F5F7FA] hover:text-[#142C48]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-200">
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-9 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#142C48]">
                  Hồ sơ cá nhân &amp; Đơn vị công tác
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Thông tin này được lưu trực tiếp trong cơ sở dữ liệu PostgreSQL và dùng cho hóa đơn, hỗ trợ kỹ thuật.
                </p>
              </div>

              {profileNotice && (
                <div className="rounded-lg border border-slate-200 bg-[#F5F7FA] px-4 py-3 text-xs font-semibold text-[#142C48]">
                  {profileNotice}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0901234567"
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Chức danh chuyên môn
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Kiến trúc sư / Kỹ sư kết cấu / Sinh viên"
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Công ty / Văn phòng thiết kế
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Công ty Cổ phần Tư vấn Thiết kế..."
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Mã số thuế (nếu xuất hóa đơn)
                  </label>
                  <input
                    type="text"
                    value={taxCode}
                    onChange={(e) => setTaxCode(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm font-mono-tech focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                    Tỉnh / Thành phố
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="TP. Hồ Chí Minh / Hà Nội"
                    className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Địa chỉ liên hệ
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Giới thiệu chuyên môn
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <Shield className="w-4 h-4 text-[#142C48]" />
                  Email {user.emailVerified ? 'đã xác minh' : 'chờ xác minh'}
                </span>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
              </div>
            </form>
          )}

          {tab === 'wallet' && <WalletTopupPanel />}

          {tab === 'custom-prices' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#142C48]">
                  Chính sách giá ưu đãi riêng cho tài khoản
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Các hồ sơ bản vẽ được quản trị viên thiết lập mức giá riêng cho tài khoản của bạn. Hệ thống tự động áp dụng mức giá này khi hiển thị và thanh toán.
                </p>
              </div>

              {customPricesLoading ? (
                <div className="h-48 rounded-xl bg-[#F5F7FA] animate-pulse" />
              ) : customPrices.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-10 text-center space-y-4">
                  <p className="text-sm text-slate-600">
                    Hiện tài khoản của bạn chưa có bảng giá ưu đãi riêng nào. Tất cả bản vẽ đang áp dụng theo giá niêm yết công khai.
                  </p>
                  <Button onClick={() => onNavigate({ name: 'catalog' })}>
                    Xem danh mục bản vẽ
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Mã &amp; Tên bản vẽ</th>
                        <th className="py-2.5 px-3 font-semibold">Định dạng</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Giá niêm yết</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Giá riêng của bạn</th>
                        <th className="py-2.5 px-3 font-semibold">Thời hạn áp dụng</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customPrices.map((cp) => {
                        const pct =
                          cp.listedPriceVnd > 0 && cp.customPriceVnd < cp.listedPriceVnd
                            ? Math.round(
                                ((cp.listedPriceVnd - cp.customPriceVnd) / cp.listedPriceVnd) *
                                  100
                              )
                            : 0;
                        return (
                          <tr key={cp.id} className="hover:bg-[#F5F7FA]/60">
                            <td className="py-3 px-3">
                              <div className="font-mono-tech font-bold text-[#142C48]">
                                {cp.productCode}
                              </div>
                              <div className="text-slate-700 font-medium line-clamp-1 max-w-xs">
                                {cp.productTitle}
                              </div>
                              {cp.note && (
                                <div className="text-[11px] text-slate-500 mt-0.5">{cp.note}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono-tech text-slate-600">
                              {cp.fileFormat}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums text-slate-400 line-through">
                              {formatVnd(cp.listedPriceVnd)}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums">
                              <div className="font-extrabold text-[#142C48]">
                                {formatVnd(cp.customPriceVnd)}
                              </div>
                              {pct > 0 && (
                                <div className="text-[11px] font-semibold text-amber-700">
                                  Giảm {pct}%
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 tabular-nums text-slate-500">
                              {cp.startsAt ? formatDateVi(cp.startsAt) : 'Hiệu lực ngay'} →{' '}
                              {cp.endsAt ? formatDateVi(cp.endsAt) : 'Không giới hạn'}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate({ name: 'product', slug: cp.productSlug })
                                }
                                className="font-semibold text-[#142C48] hover:underline cursor-pointer"
                              >
                                Xem hồ sơ
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-8">
              <div>
                <h1 className="font-display text-xl font-bold text-[#142C48]">
                  Tài liệu đã mua &amp; Lịch sử tải bản vẽ
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Lưu giữ nguyên trạng mức giá tại thời điểm thanh toán và cấp liên kết Signed URL tải bảo mật có thời hạn 120 giây.
                </p>
              </div>

              {downloadFeedback && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
                  {downloadFeedback}
                </div>
              )}
              {downloadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                  {downloadError}
                </div>
              )}

              {ordersLoading ? (
                <div className="h-48 rounded-xl bg-[#F5F7FA] animate-pulse" />
              ) : (
                <>
                  {/* Purchased Entitlements */}
                  <div className="space-y-3">
                    <h2 className="font-display text-sm font-bold text-[#142C48]">
                      Hồ sơ bản vẽ đã sở hữu ({downloads.entitlements.length})
                    </h2>
                    {downloads.entitlements.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-6 text-center space-y-3">
                        <p className="text-xs text-slate-600">
                          Bạn chưa sở hữu bản vẽ trả phí hoặc miễn phí nào trong thư viện cá nhân.
                        </p>
                        <Button size="sm" onClick={() => onNavigate({ name: 'catalog' })}>
                          Khám phá kho bản vẽ
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Bản vẽ</th>
                              <th className="py-2.5 px-3 font-semibold">Định dạng</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Lượt tải</th>
                              <th className="py-2.5 px-3 font-semibold">Ngày cấp quyền</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Tải tệp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {downloads.entitlements.map((e) => (
                              <tr key={e.id}>
                                <td className="py-2.5 px-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onNavigate({ name: 'product', slug: e.productSlug })
                                    }
                                    className="text-left hover:underline cursor-pointer"
                                  >
                                    <span className="font-mono-tech font-bold text-[#142C48] mr-2">
                                      {e.productCode}
                                    </span>
                                    <span className="text-slate-700 font-medium">
                                      {e.productTitle}
                                    </span>
                                  </button>
                                </td>
                                <td className="py-2.5 px-3 font-mono-tech text-slate-600">
                                  {e.fileFormat} · {e.fileSizeLabel}
                                </td>
                                <td className="py-2.5 px-3 text-right tabular-nums text-[#142C48] font-semibold">
                                  {e.downloadsUsed} / {e.maxDownloads}
                                </td>
                                <td className="py-2.5 px-3 tabular-nums text-slate-500">
                                  {formatDateVi(e.grantedAt)}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      downloadingProductId === e.productId ||
                                      e.downloadsUsed >= e.maxDownloads
                                    }
                                    onClick={() => handleDownloadFromEntitlement(e.productId)}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    {downloadingProductId === e.productId
                                      ? 'Đang tạo...'
                                      : e.downloadsUsed >= e.maxDownloads
                                      ? 'Hết lượt'
                                      : 'Tải bản vẽ'}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Order History */}
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <h2 className="font-display text-sm font-bold text-[#142C48]">
                      Lịch sử đơn hàng ({orders.length})
                    </h2>
                    {orders.length === 0 ? (
                      <p className="text-xs text-slate-500">Chưa có đơn hàng nào được tạo.</p>
                    ) : (
                      <div className="space-y-3">
                        {orders.map((o) => (
                          <div
                            key={o.id}
                            className="rounded-xl border border-slate-200 p-4 space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                              <span className="font-mono-tech font-bold text-[#142C48]">
                                {o.orderCode}
                              </span>
                              <span className="text-slate-500 tabular-nums">
                                {formatDateVi(o.createdAt)} · {o.status}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {o.items.map((it) => (
                                <div
                                  key={it.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700">
                                    {it.productCode} — {it.productTitle}
                                  </span>
                                  <span className="font-bold tabular-nums text-[#142C48]">
                                    {formatVnd(it.unitPriceSnapshotVnd)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end pt-1 font-bold tabular-nums text-[#142C48]">
                              Tổng thanh toán: {formatVnd(o.totalAmountVnd)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Download Logs */}
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <h2 className="font-display text-sm font-bold text-[#142C48]">
                      Nhật ký tải tệp gần đây ({downloads.logs.length})
                    </h2>
                    {downloads.logs.length === 0 ? (
                      <p className="text-xs text-slate-500">Chưa có lượt tải tệp nào.</p>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3 font-semibold">Mã bản vẽ</th>
                              <th className="py-2.5 px-3 font-semibold">Tên hồ sơ</th>
                              <th className="py-2.5 px-3 font-semibold">Thời điểm tải</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {downloads.logs.map((l) => (
                              <tr key={l.id}>
                                <td className="py-2.5 px-3 font-mono-tech font-semibold text-[#142C48]">
                                  {l.productCode}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">{l.productTitle}</td>
                                <td className="py-2.5 px-3 tabular-nums text-slate-500">
                                  {formatDateVi(l.downloadedAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'favorites' && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-xl font-bold text-[#142C48]">
                  Bản vẽ đã lưu yêu thích
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Danh sách các hồ sơ thiết kế bạn đã đánh dấu quan tâm.
                </p>
              </div>

              {favLoading ? (
                <div className="h-48 rounded-xl bg-[#F5F7FA] animate-pulse" />
              ) : favorites.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-10 text-center space-y-4">
                  <p className="text-sm text-slate-600">
                    Bạn chưa lưu bản vẽ nào vào mục yêu thích.
                  </p>
                  <Button onClick={() => onNavigate({ name: 'catalog' })}>
                    Khám phá thư viện bản vẽ
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {favorites.map((item) => (
                    <ProductCard
                      key={item.id}
                      product={item}
                      onSelect={(slug) => onNavigate({ name: 'product', slug })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#142C48]">
                    Thông báo hệ thống
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Cập nhật biến động số dư ví SHB, chính sách giá riêng và trạng thái đơn hàng.
                  </p>
                </div>
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                    Đánh dấu tất cả đã đọc
                  </Button>
                )}
              </div>

              {notifLoading ? (
                <div className="h-40 rounded-xl bg-[#F5F7FA] animate-pulse" />
              ) : notifications.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-10 text-center">
                  <p className="text-sm text-slate-600">Bạn chưa có thông báo nào.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 flex items-start justify-between gap-4 ${
                        n.isRead ? 'bg-white' : 'bg-[#F5F7FA]'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-[#142C48]">
                          {!n.isRead && <span className="text-amber-600 mr-1.5">[Mới]</span>}
                          {n.title}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{n.body}</p>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {formatDateVi(n.createdAt)} · {n.type}
                        </div>
                      </div>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkOneRead(n.id)}
                          className="text-xs font-semibold text-[#142C48] hover:underline shrink-0 cursor-pointer"
                        >
                          Đã đọc
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
              <div>
                <h1 className="font-display text-xl font-bold text-[#142C48]">
                  Đổi mật khẩu tài khoản
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Sử dụng mật khẩu tối thiểu 8 ký tự để bảo vệ tài khoản và số dư ví.
                </p>
              </div>

              {passError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {passError}
                </div>
              )}
              {passNotice && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                  {passNotice}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Mật khẩu hiện tại (để trống nếu đăng nhập lần đầu bằng Google)
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Mật khẩu mới (tối thiểu 8 ký tự)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <Button type="submit" disabled={savingPass}>
                {savingPass ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
              </Button>
            </form>
          )}

          {tab === 'seller' && <SellerDashboardPanel onNavigate={onNavigate} />}

          {tab === 'admin-pricing' && canAccessAdminPricing && <AdminPricingConsole />}
        </div>
      </div>
    </div>
  );
}
