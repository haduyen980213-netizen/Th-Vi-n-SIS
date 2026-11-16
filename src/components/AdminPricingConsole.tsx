import React, { useCallback, useEffect, useState } from 'react';
import { Check, Search, Trash2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatDateVi, formatVnd } from '../lib/format';
import type {
  AdminModerationProductRecord,
  AdminSellerPayoutRecord,
  CategoryItem,
  CustomPriceRecord,
  PriceChangeLogRecord,
  ReceivingBankInfo,
} from '../types/sis';
import { AdminAnalyticsAndLogsTab } from './admin/AdminAnalyticsAndLogsTab';
import { AdminCmsAndSupportTab } from './admin/AdminCmsAndSupportTab';
import { AdminUsersRbacTab } from './admin/AdminUsersRbacTab';
import { Button } from './ui/button';

interface SearchUserItem {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  roles: string[];
}

interface CompactProductItem {
  id: number;
  code: string;
  title: string;
  listedPriceVnd: number;
  isFree: boolean;
  categoryName: string;
  categorySlug: string;
}

type AdminSubTab =
  | 'analytics'
  | 'single'
  | 'bulk'
  | 'logs'
  | 'moderation'
  | 'payouts'
  | 'reconcile'
  | 'users'
  | 'cms';

export function AdminPricingConsole() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  const canManagePricing = isAdmin;
  const canModerate = isAdmin || roles.includes('MODERATOR');
  const canHandleFinance = isAdmin || roles.includes('ACCOUNTANT');

  const defaultTab: AdminSubTab = canHandleFinance
    ? 'analytics'
    : canModerate
    ? 'moderation'
    : 'reconcile';

  const [subTab, setSubTab] = useState<AdminSubTab>(defaultTab);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Shared lookup lists
  const [usersList, setUsersList] = useState<SearchUserItem[]>([]);
  const [userSearchQ, setUserSearchQ] = useState('');
  const [productsList, setProductsList] = useState<CompactProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [customPrices, setCustomPrices] = useState<CustomPriceRecord[]>([]);
  const [priceLogs, setPriceLogs] = useState<PriceChangeLogRecord[]>([]);

  // Single 1-1 pricing form
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [customPriceVnd, setCustomPriceVnd] = useState<number>(150000);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);

  // Bulk pricing form
  const [bulkUserIds, setBulkUserIds] = useState<number[]>([]);
  const [bulkCategorySlug, setBulkCategorySlug] = useState('all');
  const [bulkProductIds, setBulkProductIds] = useState<number[]>([]);
  const [bulkMode, setBulkMode] = useState<'PERCENT_DISCOUNT' | 'FIXED_VND'>('PERCENT_DISCOUNT');
  const [bulkValue, setBulkValue] = useState<number>(20);
  const [bulkStartsAt, setBulkStartsAt] = useState('');
  const [bulkEndsAt, setBulkEndsAt] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);

  // SHB Reconciliation & Bank Config
  const [adminTopups, setAdminTopups] = useState<any[]>([]);
  const [bankConfig, setBankConfig] = useState<ReceivingBankInfo>({
    bankCode: 'SHB',
    bankName: 'Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)',
    bankBin: '970443',
    accountNumber: '0946265256',
    accountName: 'THU VIEN SIS',
  });
  const [confirmingCode, setConfirmingCode] = useState('');
  const [bankRefCode, setBankRefCode] = useState('');
  const [confirmAmount, setConfirmAmount] = useState(0);
  const [confirmNote, setConfirmNote] = useState('Đối soát sao kê SHB hợp lệ');
  const [savingBank, setSavingBank] = useState(false);

  // Moderation state
  const [moderationFilter, setModerationFilter] = useState<'PENDING' | 'ALL' | 'REJECTED' | 'APPROVED'>('PENDING');
  const [moderationItems, setModerationItems] = useState<AdminModerationProductRecord[]>([]);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [moderatingId, setModeratingId] = useState<number | null>(null);

  // Seller Payouts & Commissions state
  const [sellerPayouts, setSellerPayouts] = useState<AdminSellerPayoutRecord[]>([]);
  const [settlingCommissions, setSettlingCommissions] = useState(false);
  const [activePayoutId, setActivePayoutId] = useState<number | null>(null);
  const [payoutAction, setPayoutAction] = useState<'PAY' | 'REJECT'>('PAY');
  const [payoutBankRef, setPayoutBankRef] = useState('');
  const [payoutActionNote, setPayoutActionNote] = useState('');
  const [processingPayout, setProcessingPayout] = useState(false);

  const loadBaseData = useCallback(async () => {
    if (!canManagePricing) return;
    try {
      const [uRes, pRes, cRes, pricesRes, logsRes] = await Promise.all([
        apiRequest<SearchUserItem[]>(`/admin/users/search?q=${encodeURIComponent(userSearchQ)}`),
        apiRequest<CompactProductItem[]>('/admin/products/compact'),
        apiRequest<CategoryItem[]>('/categories'),
        apiRequest<CustomPriceRecord[]>('/admin/pricing'),
        apiRequest<PriceChangeLogRecord[]>('/admin/pricing/logs'),
      ]);
      setUsersList(uRes);
      setProductsList(pRes);
      setCategories(cRes);
      setCustomPrices(pricesRes);
      setPriceLogs(logsRes);
      if (!selectedUserId && uRes.length > 0) setSelectedUserId(uRes[0].id);
      if (!selectedProductId && pRes.length > 0) {
        const firstPaid = pRes.find((p) => !p.isFree) || pRes[0];
        setSelectedProductId(firstPaid.id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải dữ liệu quản trị giá.');
    }
  }, [canManagePricing, userSearchQ, selectedUserId, selectedProductId]);

  const loadReconcileData = useCallback(async () => {
    if (!canHandleFinance) return;
    try {
      const [topupRes, bankRes] = await Promise.all([
        apiRequest<{ topups: any[] }>('/admin/payments/topups'),
        apiRequest<ReceivingBankInfo>('/payments/bank-info'),
      ]);
      setAdminTopups(topupRes.topups);
      setBankConfig(bankRes);
    } catch {
      // Ignore if unauthorized
    }
  }, [canHandleFinance]);

  const loadModerationData = useCallback(async () => {
    if (!canModerate) return;
    try {
      const rows = await apiRequest<AdminModerationProductRecord[]>(
        `/admin/products/moderation?status=${moderationFilter}`
      );
      setModerationItems(rows);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải danh sách kiểm duyệt bản vẽ.');
    }
  }, [canModerate, moderationFilter]);

  const loadPayoutsData = useCallback(async () => {
    if (!canHandleFinance) return;
    try {
      const rows = await apiRequest<AdminSellerPayoutRecord[]>('/admin/payouts');
      setSellerPayouts(rows);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải danh sách yêu cầu rút tiền.');
    }
  }, [canHandleFinance]);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    if (subTab === 'reconcile') {
      loadReconcileData();
    } else if (subTab === 'moderation') {
      loadModerationData();
    } else if (subTab === 'payouts') {
      loadPayoutsData();
    }
  }, [subTab, loadReconcileData, loadModerationData, loadPayoutsData]);

  const handleSaveSinglePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    setSavingSingle(true);
    try {
      await apiRequest('/admin/pricing', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          productId: selectedProductId,
          customPriceVnd,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          reason: priceReason || null,
        }),
      });
      setNotice('Đã lưu giá riêng cho tài khoản và ghi nhật ký thay đổi.');
      setPriceReason('');
      await loadBaseData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể thiết lập giá riêng.');
    } finally {
      setSavingSingle(false);
    }
  };

  const handleDeleteCustomPrice = async (id: number) => {
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/pricing/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Quản trị viên gỡ bỏ chính sách giá riêng' }),
      });
      setNotice('Đã xóa chính sách giá riêng (quay về giá niêm yết).');
      await loadBaseData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xóa chính sách giá.');
    }
  };

  const handleApplyBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    setSavingBulk(true);
    try {
      const res = await apiRequest<{ updatedCount: number; userCount: number; productCount: number }>(
        '/admin/pricing/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            userIds: bulkUserIds,
            productIds: bulkProductIds.length > 0 ? bulkProductIds : undefined,
            categorySlug: bulkProductIds.length === 0 ? bulkCategorySlug : undefined,
            mode: bulkMode,
            value: bulkValue,
            startsAt: bulkStartsAt || null,
            endsAt: bulkEndsAt || null,
            reason: bulkReason || null,
          }),
        }
      );
      setNotice(
        `Đã cập nhật hàng loạt ${res.updatedCount} mức giá (${res.userCount} tài khoản × ${res.productCount} bản vẽ).`
      );
      await loadBaseData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật giá hàng loạt.');
    } finally {
      setSavingBulk(false);
    }
  };

  const handleConfirmTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/payments/topups/${confirmingCode}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          receivedAmountVnd: confirmAmount,
          bankRefCode,
          note: confirmNote,
        }),
      });
      setNotice(`Đã đối soát và cộng số dư cho mã ${confirmingCode}.`);
      setConfirmingCode('');
      setBankRefCode('');
      await loadReconcileData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xác nhận đối soát.');
    }
  };

  const handleSaveBankConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBank(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest('/admin/payments/bank-config', {
        method: 'PATCH',
        body: JSON.stringify(bankConfig),
      });
      setNotice('Đã cập nhật cấu hình tài khoản ngân hàng nhận nạp VietQR.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật ngân hàng.');
    } finally {
      setSavingBank(false);
    }
  };

  const handleModerate = async (
    productId: number,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => {
    setNotice('');
    setErrorMsg('');
    setModeratingId(productId);
    try {
      await apiRequest(`/admin/products/${productId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          rejectionReason: decision === 'REJECTED' ? reason : null,
        }),
      });
      setRejectingId(null);
      setRejectReason('');
      await loadModerationData();
      setNotice(
        decision === 'APPROVED'
          ? 'Đã duyệt phát hành hồ sơ bản vẽ lên sàn.'
          : 'Đã từ chối hồ sơ bản vẽ và gửi thông báo chỉnh sửa tới Người bán.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xử lý kiểm duyệt bản vẽ.');
    } finally {
      setModeratingId(null);
    }
  };

  const handleSettleCommissions = async () => {
    setSettlingCommissions(true);
    setNotice('');
    setErrorMsg('');
    try {
      const res = await apiRequest<{ settledCount: number; totalReleasedVnd: number }>(
        '/admin/commissions/settle',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setNotice(
        res.settledCount > 0
          ? `Đã kết chuyển ${res.settledCount} khoản hoa hồng (${formatVnd(
              res.totalReleasedVnd
            )}) sang số dư khả dụng của Người bán.`
          : 'Hiện không có khoản hoa hồng nào đang chờ kết chuyển.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể kết chuyển hoa hồng.');
    } finally {
      setSettlingCommissions(false);
    }
  };

  const handleProcessPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayoutId) return;
    setProcessingPayout(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/payouts/${activePayoutId}/process`, {
        method: 'POST',
        body: JSON.stringify({
          action: payoutAction,
          bankRefCode: payoutAction === 'PAY' ? payoutBankRef : undefined,
          note: payoutActionNote || undefined,
        }),
      });
      setActivePayoutId(null);
      setPayoutBankRef('');
      setPayoutActionNote('');
      await loadPayoutsData();
      setNotice(
        payoutAction === 'PAY'
          ? 'Đã xác nhận chuyển khoản chi trả Người bán.'
          : 'Đã từ chối yêu cầu rút tiền và hoàn trả số dư khả dụng cho Người bán.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xử lý yêu cầu rút tiền.');
    } finally {
      setProcessingPayout(false);
    }
  };

  const selectedProduct = productsList.find((p) => p.id === selectedProductId);

  const visibleTabs: Array<{ id: AdminSubTab; label: string }> = [];
  if (canHandleFinance) {
    visibleTabs.push({ id: 'analytics', label: 'Báo cáo & Nhật ký' });
  }
  if (canManagePricing) {
    visibleTabs.push(
      { id: 'single', label: 'Giá riêng 1–1' },
      { id: 'bulk', label: 'Cập nhật hàng loạt' },
      { id: 'logs', label: 'Lịch sử giá' }
    );
  }
  if (canModerate) {
    visibleTabs.push({ id: 'moderation', label: 'Kiểm duyệt bản vẽ' });
  }
  if (canHandleFinance) {
    visibleTabs.push(
      { id: 'payouts', label: 'Chi trả Người bán' },
      { id: 'reconcile', label: 'Đối soát nạp SHB' }
    );
  }
  if (isAdmin) {
    visibleTabs.push({ id: 'users', label: 'Thành viên & RBAC' });
  }
  if (canModerate) {
    visibleTabs.push({ id: 'cms', label: isAdmin ? 'CMS & Hỗ trợ' : 'Phiếu hỗ trợ' });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-[#142C48]">
          Bảng điều khiển Quản trị Tổng hợp — THƯ VIỆN SIS
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Điều hành báo cáo doanh thu, chính sách giá riêng từng tài khoản, phân quyền RBAC, kiểm duyệt bản vẽ, CMS và đối soát SHB.
        </p>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center flex-wrap gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === t.id
                ? 'bg-white text-[#142C48] shadow-xs'
                : 'text-slate-600 hover:text-[#142C48]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {errorMsg}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      {/* TAB 1: SINGLE ACCOUNT PRICING */}
      {subTab === 'single' && (
        <div className="space-y-8">
          <form
            onSubmit={handleSaveSinglePrice}
            className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-sm font-bold text-[#142C48]">
                Thiết lập hoặc thay đổi giá riêng
              </h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={userSearchQ}
                  onChange={(e) => setUserSearchQ(e.target.value)}
                  placeholder="Tìm tài khoản theo tên, email, SĐT..."
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Chọn tài khoản áp dụng
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      #{u.id} · {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Chọn sản phẩm bản vẽ
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                >
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title.slice(0, 52)} ({formatVnd(p.listedPriceVnd)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Giá riêng áp dụng (VND) · Niêm yết:{' '}
                  <span className="font-mono-tech">
                    {formatVnd(selectedProduct?.listedPriceVnd ?? 0)}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  required
                  value={customPriceVnd}
                  onChange={(e) => setCustomPriceVnd(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono-tech font-bold focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Lý do / Ghi chú kiểm toán
                </label>
                <input
                  type="text"
                  value={priceReason}
                  onChange={(e) => setPriceReason(e.target.value)}
                  placeholder="VD: Khách hàng doanh nghiệp / Hợp đồng đối tác..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Ngày bắt đầu hiệu lực (tùy chọn)
                </label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Ngày kết thúc hiệu lực (tùy chọn)
                </label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={savingSingle}>
                {savingSingle ? 'Đang lưu...' : 'Áp dụng giá riêng'}
              </Button>
            </div>
          </form>

          {/* Active Custom Prices Table */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-bold text-[#142C48]">
              Danh sách giá riêng đang kích hoạt ({customPrices.length})
            </h2>
            {customPrices.length === 0 ? (
              <p className="text-xs text-slate-500">
                Chưa có chính sách giá riêng nào đang kích hoạt.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Tài khoản</th>
                      <th className="py-2.5 px-3 font-semibold">Bản vẽ</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Niêm yết</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Giá riêng</th>
                      <th className="py-2.5 px-3 font-semibold">Thời hạn</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customPrices.map((cp) => (
                      <tr key={cp.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#142C48]">{cp.userFullName}</div>
                          <div className="text-[11px] text-slate-500">{cp.userEmail}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono-tech font-semibold text-[#142C48]">
                            {cp.productCode}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">
                            {cp.productTitle}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-500 line-through">
                          {formatVnd(cp.listedPriceVnd)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#142C48]">
                          {formatVnd(cp.customPriceVnd)}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-slate-500">
                          {cp.startsAt ? formatDateVi(cp.startsAt) : 'Ngay lập tức'} →{' '}
                          {cp.endsAt ? formatDateVi(cp.endsAt) : 'Vô thời hạn'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomPrice(cp.id)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                            title="Gỡ bỏ giá riêng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BULK PRICING */}
      {subTab === 'bulk' && (
        <form
          onSubmit={handleApplyBulk}
          className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 space-y-5"
        >
          <h2 className="font-display text-sm font-bold text-[#142C48]">
            Cập nhật giá hàng loạt cho nhiều tài khoản
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-2">
                1. Chọn các tài khoản nhận ưu đãi ({bulkUserIds.length} đã chọn)
              </label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-300 bg-white divide-y divide-slate-100">
                {usersList.map((u) => {
                  const checked = bulkUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[#F5F7FA] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setBulkUserIds((prev) =>
                            e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)
                          );
                        }}
                      />
                      <span className="font-semibold text-[#142C48]">{u.fullName}</span>
                      <span className="text-slate-500 truncate">{u.email}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  2. Phạm vi sản phẩm theo Danh mục
                </label>
                <select
                  value={bulkCategorySlug}
                  onChange={(e) => {
                    setBulkCategorySlug(e.target.value);
                    setBulkProductIds([]);
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  <option value="all">-- Chọn danh mục áp dụng --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name} ({c.productCount} bản vẽ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Hình thức điều chỉnh
                  </label>
                  <select
                    value={bulkMode}
                    onChange={(e) => setBulkMode(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    <option value="PERCENT_DISCOUNT">Giảm theo % niêm yết</option>
                    <option value="FIXED_VND">Đồng giá cố định (VND)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    {bulkMode === 'PERCENT_DISCOUNT' ? 'Phần trăm giảm (1–95%)' : 'Mức giá VND'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={bulkValue}
                    onChange={(e) => setBulkValue(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono-tech font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Bắt đầu (tùy chọn)
                  </label>
                  <input
                    type="datetime-local"
                    value={bulkStartsAt}
                    onChange={(e) => setBulkStartsAt(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Kết thúc (tùy chọn)
                  </label>
                  <input
                    type="datetime-local"
                    value={bulkEndsAt}
                    onChange={(e) => setBulkEndsAt(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Lý do cập nhật hàng loạt
                </label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="VD: Chính sách chiết khấu đối tác Q4/2026"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={savingBulk}>
              {savingBulk ? 'Đang xử lý hàng loạt...' : 'Thực thi cập nhật giá hàng loạt'}
            </Button>
          </div>
        </form>
      )}

      {/* TAB 3: PRICE CHANGE LOGS */}
      {subTab === 'logs' && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                <th className="py-2.5 px-3 font-semibold">Tài khoản áp dụng</th>
                <th className="py-2.5 px-3 font-semibold">Bản vẽ</th>
                <th className="py-2.5 px-3 font-semibold text-right">Giá cũ → Mới</th>
                <th className="py-2.5 px-3 font-semibold">Loại</th>
                <th className="py-2.5 px-3 font-semibold">Người thực hiện</th>
                <th className="py-2.5 px-3 font-semibold">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Chưa có lịch sử điều chỉnh giá nào.
                  </td>
                </tr>
              ) : (
                priceLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-3 tabular-nums text-slate-500">
                      {formatDateVi(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#142C48]">
                      {log.targetUser ? log.targetUser.email : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tech text-[#142C48]">
                      {log.productCode}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <span className="text-slate-400">
                        {log.previousPriceVnd !== null ? formatVnd(log.previousPriceVnd) : '—'}
                      </span>{' '}
                      →{' '}
                      <span className="font-bold text-[#142C48]">
                        {formatVnd(log.newPriceVnd)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono-tech text-slate-600">
                      {log.priceType}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.actorUser?.email || 'Hệ thống'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{log.reason || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: SHB TOPUP RECONCILIATION & BANK CONFIG */}
      {subTab === 'reconcile' && (
        <div className="space-y-8">
          {/* Bank Config Form */}
          <form
            onSubmit={handleSaveBankConfig}
            className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 space-y-4"
          >
            <h2 className="font-display text-sm font-bold text-[#142C48]">
              Cấu hình tài khoản ngân hàng nhận nạp VietQR
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Mã ngân hàng
                </label>
                <input
                  type="text"
                  required
                  value={bankConfig.bankCode}
                  onChange={(e) => setBankConfig({ ...bankConfig, bankCode: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Mã BIN NAPAS (6 số)
                </label>
                <input
                  type="text"
                  required
                  value={bankConfig.bankBin}
                  onChange={(e) => setBankConfig({ ...bankConfig, bankBin: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Số tài khoản nhận
                </label>
                <input
                  type="text"
                  required
                  value={bankConfig.accountNumber}
                  onChange={(e) =>
                    setBankConfig({ ...bankConfig, accountNumber: e.target.value })
                  }
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Tên chủ tài khoản
                </label>
                <input
                  type="text"
                  required
                  value={bankConfig.accountName}
                  onChange={(e) =>
                    setBankConfig({ ...bankConfig, accountName: e.target.value })
                  }
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={savingBank}>
                {savingBank ? 'Đang lưu...' : 'Cập nhật tài khoản nhận SHB'}
              </Button>
            </div>
          </form>

          {/* Manual Confirm Box when reviewing a pending order */}
          {confirmingCode && (
            <form
              onSubmit={handleConfirmTopup}
              className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#142C48]">
                  Xác nhận đối soát giao dịch {confirmingCode}
                </h3>
                <button
                  type="button"
                  onClick={() => setConfirmingCode('')}
                  className="text-xs font-semibold text-slate-600 hover:text-[#142C48] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Số tiền thực nhận (VND)
                  </label>
                  <input
                    type="number"
                    required
                    min={1000}
                    value={confirmAmount}
                    onChange={(e) => setConfirmAmount(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Mã giao dịch sao kê SHB
                  </label>
                  <input
                    type="text"
                    required
                    value={bankRefCode}
                    onChange={(e) => setBankRefCode(e.target.value)}
                    placeholder="VD: FT261115..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Ghi chú đối soát
                  </label>
                  <input
                    type="text"
                    required
                    value={confirmNote}
                    onChange={(e) => setConfirmNote(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
              <Button type="submit" size="sm">
                <Check className="w-4 h-4" />
                Xác nhận cộng tiền vào ví thành viên
              </Button>
            </form>
          )}

          {/* Topup Orders Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã nạp</th>
                  <th className="py-2.5 px-3 font-semibold">Thành viên</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số tiền</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold">Ngày tạo</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Đối soát</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adminTopups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có giao dịch nạp tiền nào.
                    </td>
                  </tr>
                ) : (
                  adminTopups.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5 px-3 font-mono-tech font-semibold text-[#142C48]">
                        {t.topupCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#142C48]">{t.userFullName}</div>
                        <div className="text-[11px] text-slate-500">{t.userEmail}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-[#142C48]">
                        {formatVnd(t.requestedAmountVnd)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{t.status}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-500">
                        {formatDateVi(t.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {t.status !== 'PAID' && (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingCode(t.topupCode);
                              setConfirmAmount(t.requestedAmountVnd);
                            }}
                            className="text-xs font-semibold text-[#142C48] hover:underline cursor-pointer"
                          >
                            Xác nhận đối soát
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PRODUCT MODERATION */}
      {subTab === 'moderation' && canModerate && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold text-[#142C48]">
                Kiểm duyệt hồ sơ bản vẽ từ Người bán
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kiểm tra định dạng tệp, mô tả kỹ thuật và giá niêm yết trước khi cho phép hiển thị công khai.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
              {(
                [
                  { id: 'PENDING', label: 'Chờ duyệt' },
                  { id: 'REJECTED', label: 'Từ chối' },
                  { id: 'APPROVED', label: 'Đã duyệt' },
                  { id: 'ALL', label: 'Tất cả' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setModerationFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    moderationFilter === f.id
                      ? 'bg-white text-[#142C48] shadow-xs'
                      : 'text-slate-600 hover:text-[#142C48]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {rejectingId !== null && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-800">
                  Nhập lý do từ chối hồ sơ #{rejectingId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectReason('');
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-[#142C48] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="VD: Thiếu file mặt cắt kết cấu hoặc ảnh xem trước chưa rõ..."
                  className="flex-1 h-9 px-3 rounded-lg border border-red-300 bg-white text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={moderatingId === rejectingId || !rejectReason.trim()}
                  onClick={() => handleModerate(rejectingId, 'REJECTED', rejectReason)}
                >
                  Xác nhận từ chối
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã &amp; Tên bản vẽ</th>
                  <th className="py-2.5 px-3 font-semibold">Người bán</th>
                  <th className="py-2.5 px-3 font-semibold">Định dạng</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Giá niêm yết</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moderationItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Không có hồ sơ bản vẽ nào trong mục lọc này.
                    </td>
                  </tr>
                ) : (
                  moderationItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-mono-tech font-bold text-[#142C48]">{item.code}</div>
                        <div className="text-slate-700 font-medium line-clamp-1 max-w-xs">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.categoryName} · {formatDateVi(item.createdAt)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{item.sellerName}</td>
                      <td className="py-2.5 px-3 font-mono-tech text-slate-600">
                        {item.fileFormat} ({item.fileSizeLabel})
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#142C48]">
                        {item.isFree ? 'Miễn phí' : formatVnd(item.listedPriceVnd)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold">{item.approvalStatus}</div>
                        {item.rejectionReason && (
                          <div className="text-[11px] text-red-600 line-clamp-1 max-w-[180px]">
                            {item.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                        {item.approvalStatus !== 'APPROVED' && (
                          <button
                            type="button"
                            disabled={moderatingId === item.id}
                            onClick={() => handleModerate(item.id, 'APPROVED')}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-semibold cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Duyệt
                          </button>
                        )}
                        {item.approvalStatus !== 'REJECTED' && (
                          <button
                            type="button"
                            disabled={moderatingId === item.id}
                            onClick={() => {
                              setRejectingId(item.id);
                              setRejectReason('');
                            }}
                            className="inline-flex items-center gap-1 text-red-600 hover:underline font-semibold cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Từ chối
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: SELLER PAYOUTS & COMMISSION SETTLEMENT */}
      {subTab === 'payouts' && canHandleFinance && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-sm font-bold text-[#142C48]">
                Kết chuyển hoa hồng Người bán
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Chuyển các khoản hoa hồng 70% đang ở trạng thái Chờ đối soát sang Số dư khả dụng để Người bán tạo lệnh rút tiền.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={settlingCommissions}
              onClick={handleSettleCommissions}
            >
              {settlingCommissions ? 'Đang kết chuyển...' : 'Kết chuyển hoa hồng chờ sang Khả dụng'}
            </Button>
          </div>

          {activePayoutId !== null && (
            <form
              onSubmit={handleProcessPayout}
              className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#142C48]">
                  {payoutAction === 'PAY'
                    ? `Xác nhận đã chuyển khoản chi trả lệnh #${activePayoutId}`
                    : `Từ chối & Hoàn số dư lệnh #${activePayoutId}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setActivePayoutId(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-[#142C48] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {payoutAction === 'PAY' && (
                  <div>
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Mã giao dịch ngân hàng (Ref) *
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutBankRef}
                      onChange={(e) => setPayoutBankRef(e.target.value)}
                      placeholder="VD: FT2611159988"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                    />
                  </div>
                )}
                <div className={payoutAction === 'PAY' ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    {payoutAction === 'PAY' ? 'Ghi chú kế toán' : 'Lý do từ chối *'}
                  </label>
                  <input
                    type="text"
                    required={payoutAction === 'REJECT'}
                    value={payoutActionNote}
                    onChange={(e) => setPayoutActionNote(e.target.value)}
                    placeholder={
                      payoutAction === 'PAY'
                        ? 'Đã chuyển khoản SHB thành công'
                        : 'Sai số tài khoản thụ hưởng'
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={processingPayout}>
                {processingPayout
                  ? 'Đang xử lý...'
                  : payoutAction === 'PAY'
                  ? 'Xác nhận đã chuyển khoản'
                  : 'Xác nhận từ chối & Hoàn số dư'}
              </Button>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã rút</th>
                  <th className="py-2.5 px-3 font-semibold">Người bán</th>
                  <th className="py-2.5 px-3 font-semibold">Tài khoản nhận</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số tiền</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sellerPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có yêu cầu rút tiền nào từ Người bán.
                    </td>
                  </tr>
                ) : (
                  sellerPayouts.map((po) => (
                    <tr key={po.id}>
                      <td className="py-2.5 px-3 font-mono-tech font-bold text-[#142C48]">
                        {po.payoutCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#142C48]">{po.sellerName}</div>
                        <div className="text-[11px] text-slate-500">{po.sellerEmail}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div>{po.bankName}</div>
                        <div className="font-mono-tech text-[11px] text-slate-600">
                          {po.bankAccountNumber} · {po.bankAccountHolder}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#142C48]">
                        {formatVnd(po.amountVnd)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{po.status}</td>
                      <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                        {po.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActivePayoutId(po.id);
                                setPayoutAction('PAY');
                                setPayoutBankRef('');
                                setPayoutActionNote('');
                              }}
                              className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                            >
                              Duyệt chi
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActivePayoutId(po.id);
                                setPayoutAction('REJECT');
                                setPayoutActionNote('');
                              }}
                              className="text-red-600 hover:underline font-semibold cursor-pointer"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: ANALYTICS & AUDIT LOGS */}
      {subTab === 'analytics' && canHandleFinance && <AdminAnalyticsAndLogsTab />}

      {/* TAB 8: USERS & RBAC */}
      {subTab === 'users' && isAdmin && <AdminUsersRbacTab />}

      {/* TAB 9: CMS & SUPPORT TICKETS */}
      {subTab === 'cms' && canModerate && <AdminCmsAndSupportTab />}
    </div>
  );
}
