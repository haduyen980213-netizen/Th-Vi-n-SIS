import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { formatDateVi } from '../../lib/format';
import type {
  AdminCategoryRecord,
  CmsBannerRecord,
  SiteSettingRecord,
  SupportTicketRecord,
} from '../../types/sis';
import { Button } from '../ui/button';

export function AdminCmsAndSupportTab() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');

  const [section, setSection] = useState<'tickets' | 'banners' | 'categories' | 'settings'>(
    isAdmin ? 'tickets' : 'tickets'
  );
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Support tickets state
  const [ticketFilter, setTicketFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('ALL');
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicketRecord | null>(null);
  const [ticketStatus, setTicketStatus] = useState<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>('RESOLVED');
  const [ticketReply, setTicketReply] = useState('');
  const [savingTicket, setSavingTicket] = useState(false);

  // Banners state
  const [banners, setBanners] = useState<CmsBannerRecord[]>([]);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerImageUrl, setBannerImageUrl] = useState(
    '/src/assets/images/hero_sis_architecture_1794798218632.jpg'
  );
  const [bannerTargetUrl, setBannerTargetUrl] = useState('/danh-muc?tag=featured');
  const [bannerActive, setBannerActive] = useState(true);
  const [savingBanner, setSavingBanner] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<AdminCategoryRecord[]>([]);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSortOrder, setCatSortOrder] = useState(1);
  const [catActive, setCatActive] = useState(true);

  // Site settings state
  const [settings, setSettings] = useState<SiteSettingRecord[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadTickets = useCallback(async () => {
    try {
      const rows = await apiRequest<SupportTicketRecord[]>(
        `/admin/support/tickets?status=${ticketFilter}`
      );
      setTickets(rows);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải danh sách phiếu hỗ trợ.');
    }
  }, [ticketFilter]);

  const loadCmsData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [bRows, cRows, sRows] = await Promise.all([
        apiRequest<CmsBannerRecord[]>('/admin/cms/banners'),
        apiRequest<AdminCategoryRecord[]>('/admin/cms/categories'),
        apiRequest<SiteSettingRecord[]>('/admin/cms/settings'),
      ]);
      setBanners(bRows);
      setCategories(cRows);
      setSettings(sRows);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải cấu hình CMS.');
    }
  }, [isAdmin]);

  useEffect(() => {
    loadTickets();
    loadCmsData();
  }, [loadTickets, loadCmsData]);

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    setSavingTicket(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/support/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: ticketStatus,
          replyMessage: ticketReply.trim() || null,
        }),
      });
      setNotice(`Đã cập nhật phiếu hỗ trợ ${activeTicket.ticketCode}.`);
      setActiveTicket(null);
      setTicketReply('');
      await loadTickets();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật phiếu hỗ trợ.');
    } finally {
      setSavingTicket(false);
    }
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBanner(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest('/admin/cms/banners', {
        method: 'POST',
        body: JSON.stringify({
          title: bannerTitle,
          subtitle: bannerSubtitle.trim() || null,
          imageUrl: bannerImageUrl,
          targetUrl: bannerTargetUrl.trim() || null,
          position: 'HOME_ANNOUNCEMENT',
          isActive: bannerActive,
        }),
      });
      setBannerTitle('');
      setBannerSubtitle('');
      setNotice('Đã lưu banner CMS mới.');
      await loadCmsData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu banner.');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleToggleBanner = async (b: CmsBannerRecord) => {
    try {
      await apiRequest('/admin/cms/banners', {
        method: 'POST',
        body: JSON.stringify({
          id: b.id,
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: b.imageUrl,
          targetUrl: b.targetUrl,
          position: b.position,
          sortOrder: b.sortOrder,
          isActive: !b.isActive,
        }),
      });
      await loadCmsData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật trạng thái banner.');
    }
  };

  const handleDeleteBanner = async (id: number) => {
    try {
      await apiRequest(`/admin/cms/banners/${id}`, { method: 'DELETE' });
      setNotice('Đã xóa banner.');
      await loadCmsData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể xóa banner.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCatId) return;
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest(`/admin/cms/categories/${editingCatId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: catName,
          description: catDesc,
          sortOrder: catSortOrder,
          isActive: catActive,
        }),
      });
      setEditingCatId(null);
      setNotice('Đã cập nhật danh mục kỹ thuật.');
      await loadCmsData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật danh mục.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setNotice('');
    setErrorMsg('');
    try {
      await apiRequest('/admin/cms/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          items: settings.map((s) => ({
            key: s.key,
            value: s.value,
            groupName: s.groupName,
          })),
        }),
      });
      setNotice('Đã lưu cấu hình hệ thống THƯ VIỆN SIS.');
      await loadCmsData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu cấu hình hệ thống.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-base font-bold text-[#142C48]">
          Hỗ trợ Khách hàng, CMS Banner &amp; Danh mục
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Xử lý yêu cầu hỗ trợ thành viên và điều chỉnh nội dung hiển thị trên THƯ VIỆN SIS.
        </p>
      </div>

      <div className="flex items-center flex-wrap gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSection('tickets')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
            section === 'tickets'
              ? 'bg-white text-[#142C48] shadow-xs'
              : 'text-slate-600 hover:text-[#142C48]'
          }`}
        >
          Phiếu hỗ trợ ({tickets.length})
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setSection('banners')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                section === 'banners'
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              Banner Trang chủ ({banners.length})
            </button>
            <button
              type="button"
              onClick={() => setSection('categories')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                section === 'categories'
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              15 Danh mục ({categories.length})
            </button>
            <button
              type="button"
              onClick={() => setSection('settings')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                section === 'settings'
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              Cấu hình chung
            </button>
          </>
        )}
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

      {/* SECTION 1: SUPPORT TICKETS */}
      {section === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
            {(
              [
                { id: 'ALL', label: 'Tất cả' },
                { id: 'OPEN', label: 'Mới mở' },
                { id: 'IN_PROGRESS', label: 'Đang xử lý' },
                { id: 'RESOLVED', label: 'Đã giải quyết' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTicketFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  ticketFilter === f.id
                    ? 'bg-white text-[#142C48] shadow-xs'
                    : 'text-slate-600 hover:text-[#142C48]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {activeTicket && (
            <form
              onSubmit={handleUpdateTicket}
              className="rounded-xl border border-slate-300 bg-[#F5F7FA] p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono-tech font-bold text-xs text-[#142C48] mr-2">
                    {activeTicket.ticketCode}
                  </span>
                  <span className="text-sm font-bold text-[#142C48]">{activeTicket.subject}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTicket(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-[#142C48] cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <div className="font-semibold text-[#142C48] mb-1">
                  Từ: {activeTicket.contactName} ({activeTicket.contactEmail})
                </div>
                {activeTicket.message}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Trạng thái xử lý
                  </label>
                  <select
                    value={ticketStatus}
                    onChange={(e) => setTicketStatus(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Nội dung phản hồi (gửi thông báo tới tài khoản nếu đã đăng nhập)
                  </label>
                  <input
                    type="text"
                    value={ticketReply}
                    onChange={(e) => setTicketReply(e.target.value)}
                    placeholder="VD: Đã kiểm tra giao dịch SHB và kích hoạt quyền tải bản vẽ..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingTicket}>
                  <MessageSquare className="w-3.5 h-3.5" />
                  {savingTicket ? 'Đang gửi...' : 'Cập nhật phiếu hỗ trợ'}
                </Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã phiếu</th>
                  <th className="py-2.5 px-3 font-semibold">Người gửi</th>
                  <th className="py-2.5 px-3 font-semibold">Chủ đề &amp; Nhóm</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold">Ngày gửi</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Chưa có phiếu hỗ trợ nào.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5 px-3 font-mono-tech font-bold text-[#142C48]">
                        {t.ticketCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#142C48]">{t.contactName}</div>
                        <div className="text-[11px] text-slate-500">{t.contactEmail}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800">{t.subject}</div>
                        <div className="text-[11px] font-mono-tech text-slate-500">{t.category}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold">{t.status}</td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-500">
                        {formatDateVi(t.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTicket(t);
                            setTicketStatus(t.status);
                            setTicketReply('');
                          }}
                          className="font-semibold text-[#142C48] hover:underline cursor-pointer"
                        >
                          Phản hồi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: CMS BANNERS */}
      {section === 'banners' && isAdmin && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateBanner}
            className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 space-y-4"
          >
            <h3 className="font-display text-sm font-bold text-[#142C48]">
              Tạo Banner / Thông báo nổi bật trên Trang chủ
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Tiêu đề banner *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="VD: Ra mắt Bộ sưu tập Hồ sơ Biệt thự & BIM 2026"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Mô tả ngắn
                </label>
                <input
                  type="text"
                  value={bannerSubtitle}
                  onChange={(e) => setBannerSubtitle(e.target.value)}
                  placeholder="Nạp ví VietQR SHB tự động 24/7 — Áp dụng giá ưu đãi riêng từng tài khoản"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Đường dẫn liên kết khi bấm
                </label>
                <input
                  type="text"
                  value={bannerTargetUrl}
                  onChange={(e) => setBannerTargetUrl(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                />
              </div>
              <div className="flex items-end gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#142C48] h-9 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bannerActive}
                    onChange={(e) => setBannerActive(e.target.checked)}
                  />
                  Hiển thị ngay trên trang chủ
                </label>
                <Button type="submit" size="sm" disabled={savingBanner}>
                  <Plus className="w-3.5 h-3.5" />
                  {savingBanner ? 'Đang lưu...' : 'Thêm banner'}
                </Button>
              </div>
            </div>
          </form>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Tiêu đề &amp; Phụ đề</th>
                  <th className="py-2.5 px-3 font-semibold">Đích liên kết</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {banners.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Chưa có banner CMS nào được tạo.
                    </td>
                  </tr>
                ) : (
                  banners.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#142C48]">{b.title}</div>
                        <div className="text-[11px] text-slate-500">{b.subtitle || '—'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-slate-600">
                        {b.targetUrl || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => handleToggleBanner(b)}
                          className="hover:underline cursor-pointer text-[#142C48]"
                        >
                          {b.isActive ? 'Đang bật (Bấm để ẩn)' : 'Đang tắt (Bấm để bật)'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteBanner(b.id)}
                          className="inline-flex items-center gap-1 text-red-600 hover:underline font-semibold cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: CATEGORIES */}
      {section === 'categories' && isAdmin && (
        <div className="space-y-4">
          {editingCatId !== null && (
            <form
              onSubmit={handleSaveCategory}
              className="rounded-xl border border-slate-300 bg-[#F5F7FA] p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#142C48]">
                  Chỉnh sửa danh mục #{editingCatId}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingCatId(null)}
                  className="text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Tên danh mục
                  </label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Mô tả chuyên mục
                  </label>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#142C48] mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={catSortOrder}
                    onChange={(e) => setCatSortOrder(Number(e.target.value))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#142C48] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={catActive}
                    onChange={(e) => setCatActive(e.target.checked)}
                  />
                  Kích hoạt hiển thị trên thanh điều hướng
                </label>
                <Button type="submit" size="sm">
                  <Save className="w-3.5 h-3.5" />
                  Lưu danh mục
                </Button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Thứ tự</th>
                  <th className="py-2.5 px-3 font-semibold">Tên &amp; Slug</th>
                  <th className="py-2.5 px-3 font-semibold">Mô tả</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Sửa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-3 font-mono-tech">{c.sortOrder}</td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-[#142C48]">{c.name}</div>
                      <div className="text-[11px] font-mono-tech text-slate-500">{c.slug}</div>
                    </td>
                    <td className="py-2 px-3 text-slate-600 max-w-md">{c.description}</td>
                    <td className="py-2 px-3 font-semibold">
                      {c.isActive ? 'Hiển thị' : 'Đang ẩn'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(c.id);
                          setCatName(c.name);
                          setCatDesc(c.description || '');
                          setCatSortOrder(c.sortOrder);
                          setCatActive(c.isActive);
                        }}
                        className="font-semibold text-[#142C48] hover:underline cursor-pointer"
                      >
                        Chỉnh sửa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4: SITE SETTINGS */}
      {section === 'settings' && isAdmin && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <h3 className="font-display text-sm font-bold text-[#142C48]">
            Cấu hình thông số hệ thống
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {settings.map((s) => (
              <div key={s.key}>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  {s.description || s.key}{' '}
                  <span className="font-mono-tech text-[11px] text-slate-400">({s.key})</span>
                </label>
                <input
                  type="text"
                  value={s.value}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setSettings((prev) =>
                      prev.map((item) => (item.key === s.key ? { ...item, value: nextVal } : item))
                    );
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingSettings}>
              <Save className="w-3.5 h-3.5" />
              {savingSettings ? 'Đang lưu...' : 'Lưu cấu hình hệ thống'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
