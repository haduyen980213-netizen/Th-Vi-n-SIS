import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileArchive,
  Layers,
  PlusCircle,
  Upload,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, apiUpload } from '../lib/api';
import { formatDateVi, formatVnd } from '../lib/format';
import type {
  CategoryItem,
  SellerBalanceRecord,
  SellerCommissionRecord,
  SellerPayoutRecord,
  SellerProductRecord,
  SellerProfileRecord,
} from '../types/sis';
import type { AppRoute } from './Header';
import { Button } from './ui/button';

interface SellerDashboardPanelProps {
  onNavigate: (route: AppRoute) => void;
}

const PRESET_THUMBNAILS: Array<{ label: string; url: string }> = [
  {
    label: 'Biệt thự hiện đại',
    url: '/src/assets/images/drawing_modern_villa_1794798219281.jpg',
  },
  {
    label: 'Mặt tiền nhà phố',
    url: '/src/assets/images/drawing_townhouse_facade_1794798220506.jpg',
  },
  {
    label: 'Kết cấu & BIM',
    url: '/src/assets/images/drawing_structural_bim_1794798220917.jpg',
  },
  {
    label: 'Nội thất phòng khách',
    url: '/src/assets/images/drawing_interior_living_1794798220391.jpg',
  },
  {
    label: 'Hệ thống MEP / Điện nước',
    url: '/src/assets/images/drawing_mep_mechanical_1794798222346.jpg',
  },
  {
    label: 'Phối cảnh kiến trúc SIS',
    url: '/src/assets/images/hero_sis_architecture_1794798218632.jpg',
  },
];

function approvalStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'APPROVED':
      return { text: 'Đang phát hành', className: 'text-emerald-700' };
    case 'PENDING':
      return { text: 'Chờ kiểm duyệt', className: 'text-amber-700' };
    case 'REJECTED':
      return { text: 'Bị từ chối', className: 'text-red-700' };
    case 'HIDDEN':
      return { text: 'Đang tạm ẩn', className: 'text-slate-600' };
    default:
      return { text: 'Bản nháp', className: 'text-slate-500' };
  }
}

export function SellerDashboardPanel({ onNavigate }: SellerDashboardPanelProps) {
  const { user, refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerProfileRecord | null>(null);
  const [balance, setBalance] = useState<SellerBalanceRecord | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<SellerProductRecord[]>([]);
  const [commissions, setCommissions] = useState<SellerCommissionRecord[]>([]);
  const [payouts, setPayouts] = useState<SellerPayoutRecord[]>([]);

  const [subTab, setSubTab] = useState<'products' | 'upload' | 'revenue' | 'settings'>('products');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Onboarding / Settings form
  const [displayName, setDisplayName] = useState('');
  const [specialty, setSpecialty] = useState('Kiến trúc dân dụng · Kết cấu · BIM');
  const [bio, setBio] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Upload new drawing form
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [isFree, setIsFree] = useState(false);
  const [listedPriceVnd, setListedPriceVnd] = useState<number>(150000);
  const [fileFormat, setFileFormat] = useState('DWG + PDF');
  const [softwareVersion, setSoftwareVersion] = useState('AutoCAD 2024');
  const [pageOrSheetCount, setPageOrSheetCount] = useState<number>(25);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [presetThumbnailUrl, setPresetThumbnailUrl] = useState(PRESET_THUMBNAILS[0].url);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<File | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState(false);

  // Inline Edit Product state
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriceVnd, setEditPriceVnd] = useState<number>(0);
  const [editIsFree, setEditIsFree] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [editStatus, setEditStatus] = useState<'APPROVED' | 'DRAFT' | 'PENDING' | 'HIDDEN'>('PENDING');
  const [savingEdit, setSavingEdit] = useState(false);

  const canDirectApprove = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'MODERATOR') ||
      user?.permissions?.includes('product:approve')
  );

  // Inline Version Upload state
  const [versionProductId, setVersionProductId] = useState<number | null>(null);
  const [versionNumber, setVersionNumber] = useState('v1.1');
  const [versionChangelog, setVersionChangelog] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [publishingVersion, setPublishingVersion] = useState(false);

  // Withdrawal form state
  const [payoutAmount, setPayoutAmount] = useState<number>(100000);
  const [payoutBankName, setPayoutBankName] = useState('');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('');
  const [payoutAccountHolder, setPayoutAccountHolder] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [requestingPayout, setRequestingPayout] = useState(false);

  const loadSellerWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, catsRes] = await Promise.all([
        apiRequest<{ seller: SellerProfileRecord | null; balance: SellerBalanceRecord | null }>(
          '/seller/profile'
        ),
        apiRequest<CategoryItem[]>('/categories'),
      ]);

      setCategories(catsRes);
      if (catsRes.length > 0 && categoryId === 0) {
        setCategoryId(catsRes[0].id);
      }

      if (profileRes.seller) {
        setSeller(profileRes.seller);
        setBalance(profileRes.balance);
        setDisplayName(profileRes.seller.displayName);
        setSpecialty(profileRes.seller.specialty || '');
        setBio(profileRes.seller.bio || '');
        setBankName(profileRes.seller.bankName || '');
        setBankAccountNumber(profileRes.seller.bankAccountNumber || '');
        setBankAccountHolder(profileRes.seller.bankAccountHolder || '');

        setPayoutBankName(profileRes.seller.bankName || '');
        setPayoutAccountNumber(profileRes.seller.bankAccountNumber || '');
        setPayoutAccountHolder(profileRes.seller.bankAccountHolder || '');

        const [prodsRes, revRes] = await Promise.all([
          apiRequest<SellerProductRecord[]>('/seller/products'),
          apiRequest<{
            balance: SellerBalanceRecord;
            commissions: SellerCommissionRecord[];
            payouts: SellerPayoutRecord[];
          }>('/seller/revenue'),
        ]);

        setProducts(prodsRes);
        setBalance(revRes.balance);
        setCommissions(revRes.commissions);
        setPayouts(revRes.payouts);
      } else {
        setSeller(null);
        setBalance(null);
        if (user && !displayName) {
          setDisplayName(`${user.fullName} Studio`);
          setBankAccountHolder(user.fullName.toUpperCase());
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải dữ liệu Kênh Người bán.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, displayName, user]);

  useEffect(() => {
    loadSellerWorkspace();
  }, [loadSellerWorkspace]);

  const handleSaveSellerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setNotice('');
    setErrorMsg('');
    try {
      const isOnboarding = !seller;
      await apiRequest('/seller/profile', {
        method: 'POST',
        body: JSON.stringify({
          displayName,
          specialty: specialty.trim() || null,
          bio: bio.trim() || null,
          bankName: bankName.trim() || null,
          bankAccountNumber: bankAccountNumber.trim() || null,
          bankAccountHolder: bankAccountHolder.trim() || null,
        }),
      });
      await refreshMe();
      await loadSellerWorkspace();
      setNotice(
        isOnboarding
          ? 'Đã kích hoạt Kênh Người bán và cấp quyền đăng tải bản vẽ thành công.'
          : 'Đã cập nhật thông tin Studio & Tài khoản ngân hàng nhận rút tiền.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể lưu hồ sơ Người bán.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateProduct = async (submitMode: 'PENDING' | 'DRAFT') => {
    setNotice('');
    setErrorMsg('');
    if (!drawingFile) {
      setErrorMsg('Vui lòng chọn tệp bản vẽ kỹ thuật (.zip, .dwg, .rvt, .skp, .pdf...).');
      return;
    }

    setUploadingProduct(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('summary', summary);
      fd.append('description', description);
      fd.append('categoryId', String(categoryId));
      fd.append('isFree', String(isFree));
      fd.append('listedPriceVnd', String(isFree ? 0 : listedPriceVnd));
      fd.append('fileFormat', fileFormat);
      if (softwareVersion.trim()) fd.append('softwareVersion', softwareVersion.trim());
      fd.append('pageOrSheetCount', String(pageOrSheetCount));
      fd.append('presetThumbnailUrl', presetThumbnailUrl);
      fd.append('submitMode', submitMode);
      fd.append('drawingFile', drawingFile);
      if (previewImage) {
        fd.append('previewImage', previewImage);
      }

      const created = await apiUpload<{ code: string; title: string }>(
        '/seller/products',
        fd,
        'POST'
      );

      setTitle('');
      setSummary('');
      setDescription('');
      setDrawingFile(null);
      setPreviewImage(null);
      setSubTab('products');
      await loadSellerWorkspace();
      setNotice(
        submitMode === 'PENDING'
          ? `Đã tải lên bản vẽ ${created.code} vào kho bảo mật và gửi kiểm duyệt.`
          : `Đã lưu bản nháp ${created.code}.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể đăng tải bản vẽ mới.');
    } finally {
      setUploadingProduct(false);
    }
  };

  const openEditProduct = (p: SellerProductRecord) => {
    setVersionProductId(null);
    setEditingProductId(p.id);
    setEditTitle(p.title);
    setEditPriceVnd(p.listedPriceVnd);
    setEditIsFree(p.isFree);
    setEditSummary(p.summary);
    setEditStatus(
      p.approvalStatus === 'APPROVED'
        ? 'APPROVED'
        : p.approvalStatus === 'HIDDEN'
        ? 'HIDDEN'
        : p.approvalStatus === 'DRAFT'
        ? 'DRAFT'
        : 'PENDING'
    );
  };

  const handleSaveEditProduct = async (e: React.FormEvent, product: SellerProductRecord) => {
    e.preventDefault();
    setSavingEdit(true);
    setNotice('');
    setErrorMsg('');
    try {
      const payload: Record<string, any> = {
        title: editTitle,
        summary: editSummary,
        isFree: editIsFree,
        listedPriceVnd: editIsFree ? 0 : editPriceVnd,
      };
      if (editStatus !== product.approvalStatus) {
        payload.approvalStatus = editStatus;
      }

      await apiRequest(`/seller/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setEditingProductId(null);
      await loadSellerWorkspace();
      setNotice(`Đã cập nhật thông tin bản vẽ ${product.code}.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể cập nhật bản vẽ.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePublishVersion = async (e: React.FormEvent, product: SellerProductRecord) => {
    e.preventDefault();
    if (!versionFile) {
      setErrorMsg('Vui lòng đính kèm tệp bản vẽ phiên bản mới.');
      return;
    }
    setPublishingVersion(true);
    setNotice('');
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('versionNumber', versionNumber);
      fd.append('changelog', versionChangelog);
      fd.append('drawingFile', versionFile);

      await apiUpload(`/seller/products/${product.id}/versions`, fd, 'POST');
      setVersionProductId(null);
      setVersionNumber('v1.2');
      setVersionChangelog('');
      setVersionFile(null);
      await loadSellerWorkspace();
      setNotice(`Đã phát hành phiên bản ${versionNumber} cho bản vẽ ${product.code}.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể phát hành phiên bản mới.');
    } finally {
      setPublishingVersion(false);
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestingPayout(true);
    setNotice('');
    setErrorMsg('');
    try {
      const res = await apiRequest<SellerPayoutRecord>('/seller/payouts', {
        method: 'POST',
        body: JSON.stringify({
          amountVnd: payoutAmount,
          bankName: payoutBankName,
          bankAccountNumber: payoutAccountNumber,
          bankAccountHolder: payoutAccountHolder,
          note: payoutNote || null,
        }),
      });
      setPayoutNote('');
      await loadSellerWorkspace();
      setNotice(
        `Đã gửi yêu cầu rút ${formatVnd(res.amountVnd)} (Mã ${res.payoutCode}). Kế toán sẽ đối soát và chuyển khoản.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tạo yêu cầu rút tiền.');
    } finally {
      setRequestingPayout(false);
    }
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#F5F7FA] animate-pulse" />;
  }

  // ============================================================================
  // ONBOARDING SCREEN (MEMBER -> DUAL BUYER + SELLER)
  // ============================================================================
  if (!seller) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-xl font-bold text-[#142C48]">
            Đăng ký Kênh Người bán — Chia sẻ &amp; Kinh doanh Bản vẽ
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tài khoản THƯ VIỆN SIS cho phép bạn vừa là người mua bản vẽ, vừa là tác giả phân phối hồ sơ thiết kế với tỷ lệ chia sẻ doanh thu 70%.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-200 rounded-xl p-4 bg-[#F5F7FA]">
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#142C48]">01. Chia sẻ doanh thu 70%</div>
            <p className="text-xs text-slate-600">
              Tác giả nhận 70% giá trị thực thu từ mỗi lượt mua thành công qua ví VND.
            </p>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#142C48]">02. Kho lưu trữ bảo mật</div>
            <p className="text-xs text-slate-600">
              File bản vẽ gốc lưu tại Private Vault, chỉ cấp phát qua Signed URL 120 giây cho người đã mua.
            </p>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-bold text-[#142C48]">03. Rút tiền minh bạch</div>
            <p className="text-xs text-slate-600">
              Theo dõi sổ hoa hồng chi tiết và gửi yêu cầu rút tiền về tài khoản ngân hàng từ 50.000 ₫.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSaveSellerProfile}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <h2 className="font-display text-sm font-bold text-[#142C48]">
            Thông tin Studio &amp; Tài khoản ngân hàng nhận thanh toán
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tên gian hàng / Studio / Tác giả *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="VD: KTS Minh Quân Studio"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Lĩnh vực chuyên môn
              </label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="VD: Nhà phố, Biệt thự, Revit MEP..."
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Ngân hàng nhận rút tiền
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="VD: SHB / Vietcombank / Techcombank"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Số tài khoản ngân hàng
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="0946xxxxxx"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs font-mono-tech focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tên chủ tài khoản ngân hàng (không dấu)
              </label>
              <input
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="NGUYEN VAN A"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Giới thiệu năng lực thiết kế
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Kinh nghiệm triển khai hồ sơ bản vẽ thi công, tiêu chuẩn kỹ thuật áp dụng..."
                className="w-full p-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              <CheckCircle2 className="w-4 h-4" />
              {savingProfile ? 'Đang kích hoạt...' : 'Kích hoạt Kênh Người bán ngay'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // ACTIVE SELLER WORKSPACE
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono-tech text-[#142C48] font-semibold">
              SELLER-{seller.id}
            </span>
            <span aria-hidden="true">·</span>
            <span>Hoa hồng tác giả {(seller.commissionRateBps / 100).toFixed(0)}%</span>
            <span aria-hidden="true">·</span>
            <span>{products.length} hồ sơ đã tạo</span>
          </div>
          <h1 className="font-display text-xl font-bold text-[#142C48] mt-1">
            {seller.displayName}
          </h1>
          {seller.specialty && (
            <p className="text-xs text-slate-500 mt-0.5">{seller.specialty}</p>
          )}
        </div>

        <Button size="sm" onClick={() => setSubTab('upload')}>
          <PlusCircle className="w-4 h-4" />
          Đăng tải bản vẽ mới
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center flex-wrap gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
        {(
          [
            { id: 'products', label: `Bản vẽ của tôi (${products.length})`, icon: Layers },
            { id: 'upload', label: 'Đăng tải bản vẽ mới', icon: Upload },
            { id: 'revenue', label: 'Doanh thu & Rút tiền', icon: Wallet },
            { id: 'settings', label: 'Hồ sơ Studio & Ngân hàng', icon: Building2 },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === t.id
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
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

      {/* SUB-TAB 1: SELLER PRODUCTS */}
      {subTab === 'products' && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-10 text-center space-y-4">
              <FileArchive className="w-8 h-8 text-[#142C48] mx-auto" />
              <div className="space-y-1">
                <h2 className="font-display text-sm font-bold text-[#142C48]">
                  Bạn chưa đăng tải hồ sơ bản vẽ nào
                </h2>
                <p className="text-xs text-slate-600">
                  Tải lên tệp bản vẽ kỹ thuật (.dwg, .rvt, .skp, .zip, .pdf) để kiểm duyệt và bắt đầu nhận doanh thu 70%.
                </p>
              </div>
              <Button size="sm" onClick={() => setSubTab('upload')}>
                Đăng tải bản vẽ đầu tiên
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((p) => {
                const st = approvalStatusLabel(p.approvalStatus);
                const isEditing = editingProductId === p.id;
                const isVersioning = versionProductId === p.id;

                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className="w-full md:w-36 aspect-[4/3] rounded-lg overflow-hidden bg-[#F5F7FA] border border-slate-200 shrink-0">
                        <img
                          src={p.thumbnailUrl}
                          alt={p.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono-tech font-bold text-[#142C48]">{p.code}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">{p.categoryName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tech text-slate-600">
                            {p.fileFormat} ({p.fileSizeLabel})
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-semibold ${st.className}`}>{st.text}</span>
                        </div>

                        <h3 className="font-display text-base font-bold text-[#142C48] leading-snug">
                          {p.title}
                        </h3>

                        <p className="text-xs text-slate-600 line-clamp-2">{p.summary}</p>

                        {p.approvalStatus === 'REJECTED' && p.rejectionReason && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Lý do cần chỉnh sửa: {p.rejectionReason}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                          <div className="flex flex-wrap items-center gap-4 tabular-nums">
                            <span className="font-bold text-[#142C48]">
                              {p.isFree ? 'Miễn phí' : formatVnd(p.listedPriceVnd)}
                            </span>
                            <span className="text-slate-500">{p.viewCount} lượt xem</span>
                            <span className="text-slate-500">{p.purchaseCount} lượt mua</span>
                            <span className="text-slate-500">{p.downloadCount} lượt tải</span>
                            <span className="font-mono-tech text-slate-500">
                              {p.versions.length} phiên bản ({p.versions[0]?.versionNumber || 'v1.0'})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {p.approvalStatus === 'APPROVED' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onNavigate({ name: 'product', slug: p.slug })}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Xem trên sàn
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEditProduct(p)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Chỉnh sửa
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingProductId(null);
                                setVersionProductId(isVersioning ? null : p.id);
                                setVersionNumber(`v1.${p.versions.length}`);
                              }}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Phiên bản mới
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inline Edit Panel */}
                    {isEditing && (
                      <form
                        onSubmit={(e) => handleSaveEditProduct(e, p)}
                        className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#142C48]">
                            Chỉnh sửa hồ sơ {p.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingProductId(null)}
                            className="text-xs font-semibold text-slate-500 hover:text-[#142C48] cursor-pointer"
                          >
                            Đóng
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Tên bản vẽ
                            </label>
                            <input
                              type="text"
                              required
                              minLength={5}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Giá niêm yết (VND)
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min={0}
                                step={1000}
                                disabled={editIsFree}
                                value={editIsFree ? 0 : editPriceVnd}
                                onChange={(e) => setEditPriceVnd(Number(e.target.value))}
                                className="flex-1 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech font-bold disabled:bg-slate-100"
                              />
                              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#142C48] whitespace-nowrap cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editIsFree}
                                  onChange={(e) => {
                                    const free = e.target.checked;
                                    setEditIsFree(free);
                                    if (!free && editPriceVnd < 10000) {
                                      setEditPriceVnd(100000);
                                    }
                                  }}
                                />
                                Miễn phí
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Trạng thái hồ sơ
                            </label>
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as any)}
                              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                            >
                              {(p.approvalStatus === 'APPROVED' || canDirectApprove) && (
                                <option value="APPROVED">
                                  Đang hiển thị công khai (Giữ nguyên / Phát hành)
                                </option>
                              )}
                              <option value="PENDING">Gửi kiểm duyệt phát hành</option>
                              {p.approvalStatus !== 'APPROVED' && (
                                <option value="DRAFT">Lưu bản nháp (chưa gửi duyệt)</option>
                              )}
                              {(p.approvalStatus === 'APPROVED' || p.approvalStatus === 'HIDDEN') && (
                                <option value="HIDDEN">Tạm ẩn khỏi gian hàng</option>
                              )}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Mô tả ngắn
                            </label>
                            <input
                              type="text"
                              required
                              minLength={10}
                              value={editSummary}
                              onChange={(e) => setEditSummary(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <Button type="submit" size="sm" disabled={savingEdit}>
                            {savingEdit ? 'Đang lưu...' : 'Lưu cập nhật'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Inline Version Publish Panel */}
                    {isVersioning && (
                      <form
                        onSubmit={(e) => handlePublishVersion(e, p)}
                        className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#142C48]">
                            Phát hành phiên bản mới cho {p.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => setVersionProductId(null)}
                            className="text-xs font-semibold text-slate-500 hover:text-[#142C48] cursor-pointer"
                          >
                            Đóng
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Số phiên bản *
                            </label>
                            <input
                              type="text"
                              required
                              value={versionNumber}
                              onChange={(e) => setVersionNumber(e.target.value)}
                              placeholder="v1.1"
                              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Tệp bản vẽ cập nhật *
                            </label>
                            <input
                              type="file"
                              required
                              accept=".zip,.rar,.7z,.dwg,.dxf,.rvt,.rfa,.skp,.ifc,.pdf,.docx,.xlsx,.step,.igs"
                              onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                              className="w-full h-9 px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-xs font-semibold text-[#142C48] mb-1">
                              Nội dung thay đổi (Changelog) *
                            </label>
                            <input
                              type="text"
                              required
                              minLength={5}
                              value={versionChangelog}
                              onChange={(e) => setVersionChangelog(e.target.value)}
                              placeholder="VD: Bổ sung chi tiết thang bộ, cập nhật định dạng AutoCAD 2024"
                              className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button type="submit" size="sm" disabled={publishingVersion}>
                            {publishingVersion ? 'Đang tải lên...' : 'Phát hành phiên bản'}
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: UPLOAD NEW DRAWING */}
      {subTab === 'upload' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateProduct('PENDING');
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div>
            <h2 className="font-display text-base font-bold text-[#142C48]">
              Đăng tải hồ sơ bản vẽ mới lên Kho bảo mật
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tệp nguồn được mã hóa định danh lưu trữ riêng tư (tối đa 25 MB/tệp) và kiểm duyệt trước khi mở bán.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tên hồ sơ bản vẽ *
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Hồ sơ thiết kế kỹ thuật Biệt thự 3 tầng Tân cổ điển 12x18m"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Danh mục chuyên ngành *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Giá bán niêm yết (VND) · Tối thiểu 10.000 ₫ hoặc Miễn phí
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  disabled={isFree}
                  required={!isFree}
                  value={isFree ? 0 : listedPriceVnd}
                  onChange={(e) => setListedPriceVnd(Number(e.target.value))}
                  className="flex-1 h-10 px-3.5 rounded-lg border border-slate-300 text-sm font-mono-tech font-bold disabled:bg-slate-100"
                />
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#142C48] whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFree}
                    onChange={(e) => setIsFree(e.target.checked)}
                  />
                  Miễn phí
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Định dạng tệp bản vẽ *
              </label>
              <input
                type="text"
                required
                value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                placeholder="VD: DWG + PDF, RVT, SKP + VRAY"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs font-mono-tech"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Phiên bản phần mềm
                </label>
                <input
                  type="text"
                  value={softwareVersion}
                  onChange={(e) => setSoftwareVersion(e.target.value)}
                  placeholder="AutoCAD 2024"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Số bản vẽ / Trang *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pageOrSheetCount}
                  onChange={(e) => setPageOrSheetCount(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-mono-tech"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tóm tắt quy mô &amp; hạng mục *
              </label>
              <input
                type="text"
                required
                minLength={10}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="VD: Đầy đủ mặt bằng, mặt đứng, mặt cắt kiến trúc, kết cấu móng cọc và cấp thoát nước."
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Mô tả chi tiết kỹ thuật *
              </label>
              <textarea
                rows={4}
                required
                minLength={20}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Liệt kê danh mục bản vẽ chi tiết, tiêu chuẩn thiết kế, lưu ý khi mở file hoặc thi công..."
                className="w-full p-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tệp bản vẽ kỹ thuật gốc (.zip, .dwg, .rvt, .skp, .pdf...) *
              </label>
              <input
                type="file"
                required
                accept=".zip,.rar,.7z,.dwg,.dxf,.rvt,.rfa,.skp,.ifc,.pdf,.docx,.xlsx,.step,.igs"
                onChange={(e) => setDrawingFile(e.target.files?.[0] || null)}
                className="w-full h-10 px-3 py-2 rounded-lg border border-slate-300 text-xs bg-[#F5F7FA]"
              />
              {drawingFile && (
                <p className="text-[11px] text-emerald-700 mt-1 font-mono-tech">
                  Đã chọn: {drawingFile.name} ({(drawingFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Ảnh xem trước tùy chỉnh (JPG/PNG/WebP — để trống để dùng ảnh mẫu)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => setPreviewImage(e.target.files?.[0] || null)}
                className="w-full h-10 px-3 py-2 rounded-lg border border-slate-300 text-xs bg-[#F5F7FA]"
              />
              {!previewImage && (
                <select
                  value={presetThumbnailUrl}
                  onChange={(e) => setPresetThumbnailUrl(e.target.value)}
                  className="w-full h-9 mt-2 px-3 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {PRESET_THUMBNAILS.map((item) => (
                    <option key={item.url} value={item.url}>
                      Ảnh mẫu: {item.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              disabled={uploadingProduct}
              onClick={() => handleCreateProduct('DRAFT')}
            >
              Lưu bản nháp
            </Button>
            <Button type="submit" disabled={uploadingProduct}>
              <Upload className="w-4 h-4" />
              {uploadingProduct ? 'Đang tải lên kho bảo mật...' : 'Đăng tải & Gửi kiểm duyệt'}
            </Button>
          </div>
        </form>
      )}

      {/* SUB-TAB 3: REVENUE & PAYOUTS */}
      {subTab === 'revenue' && (
        <div className="space-y-8">
          {/* 4-column Balance Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
              <div className="text-xs text-slate-500">Số dư khả dụng (có thể rút)</div>
              <div className="text-lg font-extrabold text-[#142C48] tabular-nums">
                {formatVnd(balance?.availableBalanceVnd ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
              <div className="text-xs text-slate-500">Hoa hồng chờ đối soát</div>
              <div className="text-lg font-extrabold text-amber-700 tabular-nums">
                {formatVnd(balance?.pendingBalanceVnd ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
              <div className="text-xs text-slate-500">Tổng thu nhập ròng (70%)</div>
              <div className="text-lg font-extrabold text-[#142C48] tabular-nums">
                {formatVnd(balance?.totalEarnedVnd ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
              <div className="text-xs text-slate-500">Tổng tiền đã rút</div>
              <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                {formatVnd(balance?.totalWithdrawnVnd ?? 0)}
              </div>
            </div>
          </div>

          {/* Payout Request Form */}
          <form
            onSubmit={handleRequestPayout}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <h2 className="font-display text-sm font-bold text-[#142C48]">
              Gửi yêu cầu rút tiền về tài khoản ngân hàng (Tối thiểu 50.000 ₫)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Số tiền rút (VND) *
                </label>
                <input
                  type="number"
                  required
                  min={50000}
                  step={1000}
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-tech font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Ngân hàng *
                </label>
                <input
                  type="text"
                  required
                  value={payoutBankName}
                  onChange={(e) => setPayoutBankName(e.target.value)}
                  placeholder="VD: SHB"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Số tài khoản *
                </label>
                <input
                  type="text"
                  required
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value)}
                  placeholder="Số tài khoản nhận"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono-tech"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Chủ tài khoản *
                </label>
                <input
                  type="text"
                  required
                  value={payoutAccountHolder}
                  onChange={(e) => setPayoutAccountHolder(e.target.value)}
                  placeholder="NGUYEN VAN A"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <input
                type="text"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                placeholder="Ghi chú cho kế toán (tùy chọn)"
                className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  requestingPayout || (balance?.availableBalanceVnd ?? 0) < 50000
                }
              >
                {requestingPayout ? 'Đang gửi...' : 'Gửi yêu cầu rút tiền'}
              </Button>
            </div>
          </form>

          {/* Commission Ledger */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-bold text-[#142C48]">
              Sổ hoa hồng đơn hàng ({commissions.length})
            </h2>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                    <th className="py-2.5 px-3 font-semibold">Mã đơn</th>
                    <th className="py-2.5 px-3 font-semibold">Bản vẽ</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Giá bán</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Thực nhận (70%)</th>
                    <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Chưa có giao dịch mua bản vẽ nào được ghi nhận.
                      </td>
                    </tr>
                  ) : (
                    commissions.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 px-3 tabular-nums text-slate-500">
                          {formatDateVi(c.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tech font-semibold text-[#142C48]">
                          {c.orderCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono-tech font-semibold text-[#142C48] mr-1.5">
                            {c.productCode}
                          </span>
                          <span className="text-slate-700">{c.productTitle}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                          {formatVnd(c.grossAmountVnd)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-700">
                          +{formatVnd(c.sellerNetVnd)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {c.status === 'AVAILABLE' ? 'Khả dụng' : 'Chờ đối soát'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payout History */}
          <div className="space-y-3">
            <h2 className="font-display text-sm font-bold text-[#142C48]">
              Lịch sử yêu cầu rút tiền ({payouts.length})
            </h2>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Mã rút</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Số tiền</th>
                    <th className="py-2.5 px-3 font-semibold">Tài khoản nhận</th>
                    <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                    <th className="py-2.5 px-3 font-semibold">Ngày tạo</th>
                    <th className="py-2.5 px-3 font-semibold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payouts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Chưa có yêu cầu rút tiền nào.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((po) => (
                      <tr key={po.id}>
                        <td className="py-2.5 px-3 font-mono-tech font-bold text-[#142C48]">
                          {po.payoutCode}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#142C48]">
                          {formatVnd(po.amountVnd)}
                        </td>
                        <td className="py-2.5 px-3">
                          {po.bankName} · {po.bankAccountNumber} ({po.bankAccountHolder})
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {po.status === 'PAID'
                            ? 'Đã chuyển khoản'
                            : po.status === 'REJECTED'
                            ? 'Từ chối'
                            : 'Chờ duyệt chi'}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-slate-500">
                          {formatDateVi(po.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{po.note || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: SETTINGS */}
      {subTab === 'settings' && (
        <form
          onSubmit={handleSaveSellerProfile}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <h2 className="font-display text-base font-bold text-[#142C48]">
            Cập nhật thông tin Studio &amp; Tài khoản nhận chi trả
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tên gian hàng / Studio *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Chuyên môn chính
              </label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Ngân hàng mặc định
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Số tài khoản mặc định
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs font-mono-tech"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Tên chủ tài khoản ngân hàng
              </label>
              <input
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#142C48] mb-1">
                Giới thiệu Studio
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin Studio'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
