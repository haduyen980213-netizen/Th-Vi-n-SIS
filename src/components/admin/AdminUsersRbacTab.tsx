import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  KeyRound,
  Lock,
  MessageSquare,
  Search,
  Send,
  Shield,
  Unlock,
  UserCog,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { formatDateVi, formatNumberVi, formatVnd } from '../../lib/format';
import type {
  AdminUserDetailRecord,
  AdminUserRecord,
  AdminUsersListResponse,
  RbacRoleRecord,
} from '../../types/sis';
import { Button } from '../ui/button';

interface CompactProductOption {
  id: number;
  code: string;
  title: string;
  listedPriceVnd: number;
  isFree: boolean;
}

type SupportWorkspaceTab = 'profile' | 'wallet' | 'drawings' | 'support' | 'rbac';

export function AdminUsersRbacTab() {
  const { user: currentUser, refreshMe } = useAuth();
  const actorIsSuperAdmin = currentUser?.roles.includes('SUPER_ADMIN') ?? false;

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, locked: 0, sellers: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  const [roles, setRoles] = useState<RbacRoleRecord[]>([]);
  const [productsList, setProductsList] = useState<CompactProductOption[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED' | 'PENDING'>('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Create new account panel
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newInitialWalletVnd, setNewInitialWalletVnd] = useState(0);
  const [newUserRoles, setNewUserRoles] = useState<string[]>(['MEMBER']);
  const [creatingUser, setCreatingUser] = useState(false);

  // Selected user 360° support workspace
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetailRecord | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<SupportWorkspaceTab>('profile');

  // Tab 1: Profile & password recovery form
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmailVerified, setEditEmailVerified] = useState(true);
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [assistReason, setAssistReason] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Tab 2: Wallet assistance form
  const [walletDirection, setWalletDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [walletAmount, setWalletAmount] = useState(100000);
  const [walletReason, setWalletReason] = useState('');
  const [adjustingWallet, setAdjustingWallet] = useState(false);

  // Tab 3: Drawing entitlement grant form
  const [grantProductId, setGrantProductId] = useState<number>(0);
  const [grantDownloads, setGrantDownloads] = useState(20);
  const [grantReason, setGrantReason] = useState('');
  const [grantingProduct, setGrantingProduct] = useState(false);

  // Tab 4: Direct support message form
  const [supportTitle, setSupportTitle] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [createTicketLog, setCreateTicketLog] = useState(true);
  const [sendingSupport, setSendingSupport] = useState(false);

  // Tab 5: RBAC & Status form
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'ACTIVE' | 'LOCKED'>('ACTIVE');
  const [rbacReason, setRbacReason] = useState('');
  const [savingRbac, setSavingRbac] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        status: statusFilter,
        role: roleFilter,
        page: String(page),
        limit: '50',
      });
      const [usersRes, rolesRes, prodsRes] = await Promise.all([
        apiRequest<AdminUsersListResponse>(`/admin/users?${params.toString()}`),
        apiRequest<RbacRoleRecord[]>('/admin/roles'),
        apiRequest<CompactProductOption[]>('/admin/products/compact').catch(() => []),
      ]);
      setUsers(usersRes.items);
      setSummary(usersRes.summary);
      setTotalFiltered(usersRes.pagination.total);
      setTotalPages(usersRes.pagination.totalPages);
      setRoles(rolesRes.filter((r) => r.code !== 'GUEST'));
      setProductsList(prodsRes);
      if (prodsRes.length > 0 && !grantProductId) {
        setGrantProductId(prodsRes[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải danh sách thành viên.');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, roleFilter, page, grantProductId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const hydrateDetailForms = (detail: AdminUserDetailRecord) => {
    setSelectedDetail(detail);
    setEditFullName(detail.user.fullName);
    setEditPhone(detail.user.phone || '');
    setEditEmailVerified(detail.user.emailVerified);
    setEditCompany(detail.profile?.companyName || '');
    setEditJobTitle(detail.profile?.jobTitle || '');
    setEditCity(detail.profile?.city || '');
    setEditAddress(detail.profile?.address || '');
    setResetPassword('');
    setAssistReason('');

    setSelectedRoles(detail.user.roles);
    setSelectedStatus(detail.user.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE');
    setRbacReason('');
  };

  const openUserWorkspace = async (userId: number, initialTab: SupportWorkspaceTab = 'profile') => {
    setNotice('');
    setErrorMsg('');
    setWorkspaceTab(initialTab);
    setDetailLoading(true);
    try {
      const detail = await apiRequest<AdminUserDetailRecord>(`/admin/users/${userId}/detail`);
      hydrateDetailForms(detail);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải chi tiết tài khoản.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelectedDetail = async (userId: number) => {
    const detail = await apiRequest<AdminUserDetailRecord>(`/admin/users/${userId}/detail`);
    hydrateDetailForms(detail);
  };

  const toggleNewUserRole = (code: string) => {
    if (code === 'MEMBER') return;
    setNewUserRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setNotice('');
    setErrorMsg('');
    try {
      const created = await apiRequest<{ id: number; email: string }>('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName,
          email: newEmail,
          phone: newPhone.trim() || null,
          password: newPassword,
          roleCodes: newUserRoles,
          initialWalletVnd: Number(newInitialWalletVnd) || 0,
          emailVerified: true,
        }),
      });
      setNotice(`Đã tạo và kích hoạt tài khoản ${created.email} (#${created.id}).`);
      setShowCreateForm(false);
      setNewFullName('');
      setNewEmail('');
      setNewPhone('');
      setNewPassword('');
      setNewInitialWalletVnd(0);
      setNewUserRoles(['MEMBER']);
      setPage(1);
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tạo tài khoản mới.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveProfileAssistance = async (e: React.FormEvent, forceRevokeSessions = false) => {
    e.preventDefault();
    if (!selectedDetail) return;
    setSavingProfile(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/users/${selectedDetail.user.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editFullName,
          phone: editPhone.trim() || null,
          emailVerified: editEmailVerified,
          companyName: editCompany.trim() || null,
          jobTitle: editJobTitle.trim() || null,
          city: editCity.trim() || null,
          address: editAddress.trim() || null,
          ...(resetPassword.trim() ? { newPassword: resetPassword.trim() } : {}),
          revokeSessions: forceRevokeSessions || Boolean(resetPassword.trim()),
          reason: assistReason.trim() || null,
        }),
      });
      setNotice(
        forceRevokeSessions
          ? `Đã thu hồi toàn bộ phiên đăng nhập và cập nhật hỗ trợ cho ${selectedDetail.user.email}.`
          : resetPassword.trim()
          ? `Đã hỗ trợ đặt lại mật khẩu và cập nhật hồ sơ cho ${selectedDetail.user.email}.`
          : `Đã hỗ trợ cập nhật hồ sơ cho ${selectedDetail.user.email}.`
      );
      await Promise.all([refreshSelectedDetail(selectedDetail.user.id), loadUsers()]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật hỗ trợ hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetail) return;
    setAdjustingWallet(true);
    setNotice('');
    setErrorMsg('');
    try {
      const res = await apiRequest<{
        txCode: string;
        balanceBeforeVnd: number;
        balanceAfterVnd: number;
      }>(`/admin/users/${selectedDetail.user.id}/wallet-adjust`, {
        method: 'POST',
        body: JSON.stringify({
          direction: walletDirection,
          amountVnd: Number(walletAmount),
          reason: walletReason,
        }),
      });
      setNotice(
        `Đã ${walletDirection === 'CREDIT' ? 'cộng' : 'trừ'} ${formatVnd(
          walletAmount
        )} cho ${selectedDetail.user.email} (${res.txCode}). Số dư mới: ${formatVnd(
          res.balanceAfterVnd
        )}.`
      );
      setWalletReason('');
      await Promise.all([refreshSelectedDetail(selectedDetail.user.id), loadUsers()]);
      if (selectedDetail.user.id === currentUser?.id) {
        await refreshMe();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể điều chỉnh ví.');
    } finally {
      setAdjustingWallet(false);
    }
  };

  const handleGrantEntitlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetail || !grantProductId) return;
    setGrantingProduct(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/users/${selectedDetail.user.id}/grant-entitlement`, {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(grantProductId),
          additionalDownloads: Number(grantDownloads) || 20,
          reason: grantReason.trim() || null,
        }),
      });
      setNotice(
        `Đã mở quyền tải bản vẽ (+${grantDownloads} lượt) và gửi thông báo tới ${selectedDetail.user.email}.`
      );
      setGrantReason('');
      await refreshSelectedDetail(selectedDetail.user.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cấp quyền tải bản vẽ.');
    } finally {
      setGrantingProduct(false);
    }
  };

  const handleSendDirectSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetail) return;
    setSendingSupport(true);
    setNotice('');
    setErrorMsg('');
    try {
      const res = await apiRequest<{ notificationId: number; ticketCode: string | null }>(
        `/admin/users/${selectedDetail.user.id}/support-message`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: supportTitle,
            message: supportMessage,
            createTicketLog,
          }),
        }
      );
      setNotice(
        `Đã gửi thông báo hỗ trợ trực tiếp tới ${selectedDetail.user.email}${
          res.ticketCode ? ` (Mã phiếu: ${res.ticketCode})` : ''
        }.`
      );
      setSupportTitle('');
      setSupportMessage('');
      await refreshSelectedDetail(selectedDetail.user.id);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể gửi tin nhắn hỗ trợ.');
    } finally {
      setSendingSupport(false);
    }
  };

  const toggleRole = (code: string) => {
    if (code === 'MEMBER') return;
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  };

  const handleSaveRbac = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetail) return;
    setSavingRbac(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/users/${selectedDetail.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleCodes: selectedRoles,
          status: selectedStatus,
          reason: rbacReason.trim() || null,
        }),
      });
      setNotice(`Đã cập nhật vai trò & trạng thái cho ${selectedDetail.user.email}.`);
      if (selectedDetail.user.id === currentUser?.id) {
        await refreshMe();
      }
      await Promise.all([refreshSelectedDetail(selectedDetail.user.id), loadUsers()]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật phân quyền.');
    } finally {
      setSavingRbac(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#142C48]">
            Quản trị Toàn bộ Tài khoản &amp; Hỗ trợ Trực tiếp
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi toàn bộ tài khoản đã tạo, cấp lại mật khẩu, hỗ trợ ví VND, mở quyền tải bản vẽ, gửi hỗ trợ trực tiếp và phân quyền RBAC.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={showCreateForm ? 'outline' : 'default'}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          <UserPlus className="w-4 h-4" />
          {showCreateForm ? 'Đóng biểu mẫu tạo' : 'Tạo tài khoản mới'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">Tổng tài khoản</div>
          <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-0.5">
            {formatNumberVi(summary.total)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">Đang hoạt động</div>
          <div className="text-xl font-extrabold text-emerald-700 tabular-nums mt-0.5">
            {formatNumberVi(summary.active)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">Tài khoản bị khóa</div>
          <div className="text-xl font-extrabold text-red-700 tabular-nums mt-0.5">
            {formatNumberVi(summary.locked)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-3.5">
          <div className="text-[11px] font-semibold text-slate-500">Gian hàng Seller</div>
          <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-0.5">
            {formatNumberVi(summary.sellers)}
          </div>
        </div>
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

      {/* Create User Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateUser}
          className="rounded-xl border border-slate-300 bg-[#F5F7FA] p-5 space-y-4"
        >
          <h3 className="font-display text-sm font-bold text-[#142C48]">
            Tạo tài khoản thành viên / nhân sự mới
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Họ và tên *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">Email *</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="thanhvien@congty.vn"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Số điện thoại (tùy chọn)
              </label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="0912345678"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Mật khẩu khởi tạo * (tối thiểu 6 ký tự)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Số dư ví khởi tạo (VND)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={newInitialWalletVnd}
                onChange={(e) => setNewInitialWalletVnd(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
              />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#142C48] mb-2">Gán vai trò ban đầu</div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const disabled =
                  r.code === 'MEMBER' || (r.code === 'SUPER_ADMIN' && !actorIsSuperAdmin);
                const checked = newUserRoles.includes(r.code);
                return (
                  <label
                    key={r.code}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                      checked ? 'border-[#142C48] bg-white font-semibold' : 'border-slate-200 bg-white/70'
                    } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleNewUserRole(r.code)}
                    />
                    <span className="font-mono-tech">{r.code}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={creatingUser}>
              <UserPlus className="w-3.5 h-3.5" />
              {creatingUser ? 'Đang khởi tạo...' : 'Xác nhận tạo tài khoản'}
            </Button>
          </div>
        </form>
      )}

      {/* Selected User 360° Support Workspace */}
      {detailLoading && (
        <div className="h-48 rounded-xl border border-slate-200 bg-[#F5F7FA] animate-pulse" />
      )}
      {selectedDetail && !detailLoading && (
        <div className="rounded-xl border-2 border-[#142C48]/25 bg-[#F5F7FA] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="font-mono-tech text-xs font-bold text-[#142C48] bg-white border border-slate-200 px-2 py-0.5 rounded">
                  ID #{selectedDetail.user.id}
                </span>
                <h3 className="font-display text-base font-bold text-[#142C48]">
                  Hỗ trợ tài khoản: {selectedDetail.user.fullName}
                </h3>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    selectedDetail.user.status === 'LOCKED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {selectedDetail.user.status}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {selectedDetail.user.email}
                {selectedDetail.user.phone ? ` · ${selectedDetail.user.phone}` : ''}
                {` · Ví khả dụng: ${formatVnd(selectedDetail.wallet.availableBalanceVnd)}`}
                {` · Phiên đang hoạt động: ${selectedDetail.activeSessionsCount}`}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedDetail(null)}
            >
              Đóng bảng hỗ trợ
            </Button>
          </div>

          {/* 5 Assistance Sub-Tabs */}
          <div className="flex items-center flex-wrap gap-1 p-1 bg-white border border-slate-200 rounded-lg w-fit">
            {(
              [
                { id: 'profile', label: 'Hồ sơ & Mật khẩu', icon: KeyRound },
                { id: 'wallet', label: 'Hỗ trợ Ví VND', icon: Wallet },
                {
                  id: 'drawings',
                  label: `Bản vẽ & Quyền tải (${selectedDetail.entitlements.length})`,
                  icon: Download,
                },
                {
                  id: 'support',
                  label: `Gửi hỗ trợ (${selectedDetail.supportTickets.length})`,
                  icon: MessageSquare,
                },
                { id: 'rbac', label: 'Phân quyền & Khóa', icon: Shield },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWorkspaceTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    workspaceTab === t.id
                      ? 'bg-[#142C48] text-white'
                      : 'text-slate-600 hover:bg-[#F5F7FA] hover:text-[#142C48]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Sub-tab 1: Profile & Password Assistance */}
          {workspaceTab === 'profile' && (
            <form
              onSubmit={(e) => handleSaveProfileAssistance(e, false)}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">Họ tên</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Chức danh / Chuyên môn
                  </label>
                  <input
                    type="text"
                    value={editJobTitle}
                    onChange={(e) => setEditJobTitle(e.target.value)}
                    placeholder="Kiến trúc sư, Kỹ sư..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Công ty / Đơn vị
                  </label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Tỉnh / Thành phố
                  </label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">Địa chỉ</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Đặt lại mật khẩu mới (hỗ trợ quên mật khẩu)
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="Để trống nếu không đổi..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Ghi chú hỗ trợ (Audit log)
                  </label>
                  <input
                    type="text"
                    value={assistReason}
                    onChange={(e) => setAssistReason(e.target.value)}
                    placeholder="VD: Hỗ trợ xác minh & cấp lại mật khẩu theo yêu cầu"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#142C48] h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEmailVerified}
                      onChange={(e) => setEditEmailVerified(e.target.checked)}
                    />
                    Đã xác minh Email
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingProfile}
                  onClick={(e) => handleSaveProfileAssistance(e, true)}
                >
                  Thu hồi toàn bộ phiên đăng nhập ({selectedDetail.activeSessionsCount})
                </Button>
                <Button type="submit" size="sm" disabled={savingProfile}>
                  {savingProfile ? 'Đang lưu...' : 'Lưu hỗ trợ hồ sơ & mật khẩu'}
                </Button>
              </div>
            </form>
          )}

          {/* Sub-tab 2: Wallet Assistance */}
          {workspaceTab === 'wallet' && (
            <div className="space-y-4">
              <form
                onSubmit={handleWalletAdjust}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#142C48]">
                    Điều chỉnh số dư ví hỗ trợ khách hàng
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    Hiện có: <strong className="text-[#142C48]">{formatVnd(selectedDetail.wallet.availableBalanceVnd)}</strong> · Đã nạp:{' '}
                    {formatVnd(selectedDetail.wallet.totalDepositedVnd)} · Đã chi:{' '}
                    {formatVnd(selectedDetail.wallet.totalSpentVnd)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Hình thức
                    </label>
                    <select
                      value={walletDirection}
                      onChange={(e) => setWalletDirection(e.target.value as 'CREDIT' | 'DEBIT')}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                    >
                      <option value="CREDIT">Cộng tiền vào ví (+)</option>
                      <option value="DEBIT">Khấu trừ điều chỉnh (-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Số tiền (VND) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1000}
                      step={1000}
                      value={walletAmount}
                      onChange={(e) => setWalletAmount(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-tech"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Lý do hỗ trợ / đối soát *
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={walletReason}
                      onChange={(e) => setWalletReason(e.target.value)}
                      placeholder="VD: Hỗ trợ bù giao dịch chuyển khoản thiếu nội dung hoặc tặng thưởng thành viên"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={adjustingWallet}>
                    <Wallet className="w-3.5 h-3.5" />
                    {adjustingWallet ? 'Đang xử lý...' : 'Thực hiện điều chỉnh ví'}
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Mã GD</th>
                      <th className="py-2 px-3 font-semibold">Loại</th>
                      <th className="py-2 px-3 font-semibold text-right">Số tiền</th>
                      <th className="py-2 px-3 font-semibold text-right">Số dư sau</th>
                      <th className="py-2 px-3 font-semibold">Diễn giải</th>
                      <th className="py-2 px-3 font-semibold">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetail.recentWalletTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-5 text-center text-slate-500">
                          Tài khoản chưa có giao dịch ví nào.
                        </td>
                      </tr>
                    ) : (
                      selectedDetail.recentWalletTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2 px-3 font-mono-tech font-semibold">{tx.txCode}</td>
                          <td className="py-2 px-3 font-mono-tech">{tx.txType}</td>
                          <td
                            className={`py-2 px-3 text-right font-bold tabular-nums ${
                              tx.direction === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {tx.direction === 'CREDIT' ? '+' : '-'}
                            {formatVnd(tx.amountVnd)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {formatVnd(tx.balanceAfterVnd)}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{tx.description}</td>
                          <td className="py-2 px-3 text-slate-500 tabular-nums">
                            {formatDateVi(tx.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-tab 3: Drawing Entitlement Assistance */}
          {workspaceTab === 'drawings' && (
            <div className="space-y-4">
              <form
                onSubmit={handleGrantEntitlement}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="text-xs font-bold text-[#142C48]">
                  Cấp quyền tải bản vẽ trực tiếp / Mở thêm lượt tải cho tài khoản
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Chọn hồ sơ bản vẽ
                    </label>
                    <select
                      value={grantProductId}
                      onChange={(e) => setGrantProductId(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      {productsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code}] {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Số lượt tải cộng thêm
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={grantDownloads}
                      onChange={(e) => setGrantDownloads(Number(e.target.value))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-tech"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#142C48] mb-1">
                      Ghi chú gửi người dùng
                    </label>
                    <input
                      type="text"
                      value={grantReason}
                      onChange={(e) => setGrantReason(e.target.value)}
                      placeholder="VD: Hỗ trợ tải lại bản vẽ..."
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={grantingProduct || !grantProductId}>
                    <Download className="w-3.5 h-3.5" />
                    {grantingProduct ? 'Đang cấp quyền...' : 'Cấp quyền tải ngay'}
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Mã &amp; Tên bản vẽ</th>
                      <th className="py-2 px-3 font-semibold">Lượt đã tải</th>
                      <th className="py-2 px-3 font-semibold">Trạng thái</th>
                      <th className="py-2 px-3 font-semibold">Ngày cấp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetail.entitlements.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-500">
                          Tài khoản chưa sở hữu quyền tải bản vẽ nào.
                        </td>
                      </tr>
                    ) : (
                      selectedDetail.entitlements.map((ent) => (
                        <tr key={ent.id}>
                          <td className="py-2 px-3">
                            <span className="font-mono-tech font-bold text-[#142C48] mr-2">
                              {ent.productCode}
                            </span>
                            <span>{ent.productTitle}</span>
                          </td>
                          <td className="py-2 px-3 font-mono-tech tabular-nums">
                            {ent.downloadsUsed} / {ent.maxDownloads}
                          </td>
                          <td className="py-2 px-3 font-semibold">
                            {ent.isRevoked ? (
                              <span className="text-red-700">Đã thu hồi</span>
                            ) : (
                              <span className="text-emerald-700">Đang hiệu lực</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-500 tabular-nums">
                            {formatDateVi(ent.grantedAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-tab 4: Direct Support Message & Ticket History */}
          {workspaceTab === 'support' && (
            <div className="space-y-4">
              <form
                onSubmit={handleSendDirectSupport}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="text-xs font-bold text-[#142C48]">
                  Gửi tin nhắn &amp; hướng dẫn hỗ trợ trực tiếp vào tài khoản {selectedDetail.user.email}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Tiêu đề thông báo hỗ trợ *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={supportTitle}
                    onChange={(e) => setSupportTitle(e.target.value)}
                    placeholder="VD: Hỗ trợ kiểm tra file AutoCAD và gia hạn lượt tải"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Nội dung chi tiết gửi người dùng *
                  </label>
                  <textarea
                    required
                    minLength={5}
                    rows={3}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="Nhập hướng dẫn kỹ thuật, thông tin đối soát hoặc phản hồi trực tiếp cho tài khoản này..."
                    className="w-full p-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#142C48] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createTicketLog}
                      onChange={(e) => setCreateTicketLog(e.target.checked)}
                    />
                    Lưu kèm vào lịch sử Phiếu hỗ trợ
                  </label>
                  <Button type="submit" size="sm" disabled={sendingSupport}>
                    <Send className="w-3.5 h-3.5" />
                    {sendingSupport ? 'Đang gửi...' : 'Gửi hỗ trợ trực tiếp'}
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Mã phiếu</th>
                      <th className="py-2 px-3 font-semibold">Chủ đề &amp; Nội dung</th>
                      <th className="py-2 px-3 font-semibold">Trạng thái</th>
                      <th className="py-2 px-3 font-semibold">Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDetail.supportTickets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-500">
                          Tài khoản này chưa có phiếu hỗ trợ nào.
                        </td>
                      </tr>
                    ) : (
                      selectedDetail.supportTickets.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 px-3 font-mono-tech font-bold text-[#142C48]">
                            {t.ticketCode}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-[#142C48]">{t.subject}</div>
                            <div className="text-[11px] text-slate-600 line-clamp-2">{t.message}</div>
                          </td>
                          <td className="py-2 px-3 font-semibold">{t.status}</td>
                          <td className="py-2 px-3 text-slate-500 tabular-nums">
                            {formatDateVi(t.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-tab 5: RBAC Roles & Account Lock */}
          {workspaceTab === 'rbac' && (
            <form
              onSubmit={handleSaveRbac}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {roles.map((r) => {
                  const checked = selectedRoles.includes(r.code);
                  const disabled =
                    r.code === 'MEMBER' || (r.code === 'SUPER_ADMIN' && !actorIsSuperAdmin);
                  return (
                    <label
                      key={r.code}
                      className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                        checked ? 'border-[#142C48] bg-[#F5F7FA]' : 'border-slate-200 bg-white'
                      } ${disabled ? 'opacity-65 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleRole(r.code)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-mono-tech font-bold text-[#142C48]">
                          {r.code} · {r.name}
                        </div>
                        {r.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{r.description}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Trạng thái tài khoản
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as 'ACTIVE' | 'LOCKED')}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="ACTIVE">ACTIVE — Hoạt động bình thường</option>
                    <option value="LOCKED">LOCKED — Khóa truy cập &amp; Thu hồi phiên</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Lý do điều chỉnh quyền / trạng thái
                  </label>
                  <input
                    type="text"
                    value={rbacReason}
                    onChange={(e) => setRbacReason(e.target.value)}
                    placeholder="VD: Bổ nhiệm kiểm duyệt viên bộ môn Kết cấu"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingRbac}>
                  <Shield className="w-3.5 h-3.5" />
                  {savingRbac ? 'Đang lưu...' : 'Lưu phân quyền RBAC'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-600 tabular-nums">
          Hiển thị {users.length} / {formatNumberVi(totalFiltered)} tài khoản khớp bộ lọc
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên, email, SĐT..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
          >
            <option value="ALL">Mọi vai trò</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="h-48 rounded-xl bg-[#F5F7FA] animate-pulse" />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Thành viên</th>
                  <th className="py-2.5 px-3 font-semibold">Vai trò RBAC</th>
                  <th className="py-2.5 px-3 font-semibold">Gian hàng</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số dư ví</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold">Ngày tạo</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Thao tác quản trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Không tìm thấy thành viên nào phù hợp.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className={
                        selectedDetail?.user.id === u.id ? 'bg-[#F5F7FA]' : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#142C48]">
                          #{u.id} · {u.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-[#142C48]">
                        {u.roles.join(' · ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {u.sellerDisplayName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[#142C48]">
                        {formatVnd(u.walletBalanceVnd)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        {u.status === 'LOCKED' ? (
                          <span className="inline-flex items-center gap-1 text-red-700">
                            <Lock className="w-3 h-3" />
                            LOCKED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Unlock className="w-3 h-3" />
                            {u.status}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-500">
                        {formatDateVi(u.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openUserWorkspace(u.id, 'profile')}
                            className="inline-flex items-center gap-1 font-semibold text-[#142C48] hover:underline cursor-pointer"
                          >
                            <UserCog className="w-3.5 h-3.5" />
                            Hỗ trợ &amp; Chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => openUserWorkspace(u.id, 'rbac')}
                            className="font-semibold text-slate-600 hover:text-[#142C48] hover:underline cursor-pointer"
                          >
                            Phân quyền
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
                Trang trước
              </Button>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                Trang {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Trang sau
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
