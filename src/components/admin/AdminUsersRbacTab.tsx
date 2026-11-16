import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Search, Shield, Unlock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { formatDateVi, formatVnd } from '../../lib/format';
import type { AdminUserRecord, RbacRoleRecord } from '../../types/sis';
import { Button } from '../ui/button';

export function AdminUsersRbacTab() {
  const { user: currentUser, refreshMe } = useAuth();
  const actorIsSuperAdmin = currentUser?.roles.includes('SUPER_ADMIN') ?? false;

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [roles, setRoles] = useState<RbacRoleRecord[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Selected user editor
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<'ACTIVE' | 'LOCKED'>('ACTIVE');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiRequest<AdminUserRecord[]>(
          `/admin/users?q=${encodeURIComponent(q)}&status=${statusFilter}`
        ),
        apiRequest<RbacRoleRecord[]>('/admin/roles'),
      ]);
      setUsers(usersRes);
      setRoles(rolesRes.filter((r) => r.code !== 'GUEST'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải danh sách thành viên.');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openEditor = (u: AdminUserRecord) => {
    setEditingUser(u);
    setSelectedRoles(u.roles);
    setSelectedStatus(u.status === 'LOCKED' ? 'LOCKED' : 'ACTIVE');
    setReason('');
    setNotice('');
    setErrorMsg('');
  };

  const toggleRole = (code: string) => {
    if (code === 'MEMBER') return; // MEMBER is always base role
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          roleCodes: selectedRoles,
          status: selectedStatus,
          reason: reason.trim() || null,
        }),
      });
      setNotice(`Đã cập nhật quyền & trạng thái cho ${editingUser.email}.`);
      if (editingUser.id === currentUser?.id) {
        await refreshMe();
      }
      setEditingUser(null);
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật phân quyền.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#142C48]">
            Quản lý Thành viên &amp; Phân quyền RBAC
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gán vai trò kiểm duyệt viên, kế toán, quản trị hoặc khóa tài khoản vi phạm kèm nhật ký kiểm toán.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên, email, SĐT..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 bg-white text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
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

      {/* Role & Status Editor */}
      {editingUser && (
        <form
          onSubmit={handleSaveUser}
          className="rounded-xl border border-slate-300 bg-[#F5F7FA] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-[#142C48]">
                Phân quyền cho #{editingUser.id} · {editingUser.fullName}
              </h3>
              <p className="text-xs text-slate-500">{editingUser.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="text-xs font-semibold text-slate-600 hover:text-[#142C48] cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {roles.map((r) => {
              const checked = selectedRoles.includes(r.code);
              const disabled =
                r.code === 'MEMBER' || (r.code === 'SUPER_ADMIN' && !actorIsSuperAdmin);
              return (
                <label
                  key={r.code}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
                    checked
                      ? 'border-[#142C48] bg-white'
                      : 'border-slate-200 bg-white/70'
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
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Bổ nhiệm kiểm duyệt viên bộ môn Kết cấu"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              <Shield className="w-3.5 h-3.5" />
              {saving ? 'Đang lưu...' : 'Lưu phân quyền RBAC'}
            </Button>
          </div>
        </form>
      )}

      {/* Users Table */}
      {loading ? (
        <div className="h-48 rounded-xl bg-[#F5F7FA] animate-pulse" />
      ) : (
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
                <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>
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
                  <tr key={u.id}>
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
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditor(u)}
                        className="font-semibold text-[#142C48] hover:underline cursor-pointer"
                      >
                        Phân quyền
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
