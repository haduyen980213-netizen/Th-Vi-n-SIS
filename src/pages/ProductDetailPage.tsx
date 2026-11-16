import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Heart,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { AppRoute } from '../components/Header';
import { SafeImage } from '../components/SafeImage';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatDateVi, formatNumberVi, formatVnd } from '../lib/format';
import type {
  CheckoutResult,
  ProductDetail,
  SignedDownloadResponse,
} from '../types/sis';

interface ProductDetailPageProps {
  slug: string;
  onNavigate: (route: AppRoute) => void;
  onRequireAuth: () => void;
}

export function ProductDetailPage({
  slug,
  onNavigate,
  onRequireAuth,
}: ProductDetailPageProps) {
  const { user, wallet, refreshMe } = useAuth();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorited, setFavorited] = useState(false);
  const [favPending, setFavPending] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Stage 3 checkout & signed download states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [needsTopup, setNeedsTopup] = useState(false);

  const loadProduct = useCallback(async () => {
    const data = await apiRequest<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
    setProduct(data);
    setFavorited(data.isFavorited);
    setActiveImage((prev) => prev || data.images[0]?.imageUrl || data.thumbnailUrl);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setActionSuccess('');
    setActionError('');
    setConfirmOpen(false);
    setNeedsTopup(false);
    setActiveImage('');

    apiRequest<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setFavorited(data.isFavorited);
        setActiveImage(data.images[0]?.imageUrl || data.thumbnailUrl);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Không thể tải thông tin bản vẽ.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, user?.id]);

  const handleToggleFavorite = async () => {
    if (!product) return;
    if (!user) {
      onRequireAuth();
      return;
    }

    setFavPending(true);
    setActionError('');
    try {
      if (favorited) {
        await apiRequest(`/favorites/${product.id}`, { method: 'DELETE' });
        setFavorited(false);
      } else {
        await apiRequest(`/favorites/${product.id}`, { method: 'POST' });
        setFavorited(true);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Không thể cập nhật danh sách yêu thích.');
    } finally {
      setFavPending(false);
    }
  };

  const handleCopyCode = () => {
    if (!product) return;
    navigator.clipboard?.writeText(product.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleExecuteCheckout = async () => {
    if (!product) return;
    if (!user) {
      onRequireAuth();
      return;
    }

    setCheckingOut(true);
    setActionError('');
    setActionSuccess('');
    setNeedsTopup(false);

    try {
      const idemKey = `prd-${product.id}-${Date.now()}`;
      const res = await apiRequest<CheckoutResult>('/orders/checkout', {
        method: 'POST',
        body: JSON.stringify({
          productIds: [product.id],
          couponCode: couponCode.trim() || undefined,
          idempotencyKey: idemKey,
        }),
      });

      await Promise.all([refreshMe(), loadProduct()]);
      setConfirmOpen(false);
      setCouponCode('');
      setActionSuccess(
        res.order.totalAmountVnd > 0
          ? `Thanh toán thành công đơn ${res.order.orderCode} (${formatVnd(
              res.order.totalAmountVnd
            )}). Bạn đã có quyền tải xuống hồ sơ bản vẽ.`
          : `Đã kích hoạt quyền tải tài liệu miễn phí (${res.order.orderCode}).`
      );
    } catch (err: any) {
      const msg = err?.message || 'Không thể thanh toán đơn hàng.';
      setActionError(msg);
      if (err?.code === 'INSUFFICIENT_BALANCE') {
        setNeedsTopup(true);
      }
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePrimaryPurchaseButton = () => {
    if (!product) return;
    if (!user) {
      onRequireAuth();
      return;
    }

    setActionError('');
    setActionSuccess('');
    setNeedsTopup(false);

    if (product.pricing.effectivePriceVnd === 0) {
      handleExecuteCheckout();
      return;
    }

    setConfirmOpen((prev) => !prev);
  };

  const handleDownloadFile = async (fileId?: number) => {
    if (!product) return;
    if (!user) {
      onRequireAuth();
      return;
    }

    setDownloadingFileId(fileId ?? -1);
    setActionError('');
    setActionSuccess('');

    try {
      const signed = await apiRequest<SignedDownloadResponse>('/downloads/request-url', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          ...(fileId ? { fileId } : {}),
        }),
      });

      const link = document.createElement('a');
      link.href = signed.signedUrl;
      link.setAttribute('download', signed.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setActionSuccess(
        `Đang tải xuống "${signed.filename}" qua liên kết bảo mật (hiệu lực ${signed.expiresInSeconds} giây).`
      );
      window.setTimeout(() => {
        loadProduct().catch(() => {});
      }, 900);
    } catch (err: any) {
      setActionError(err?.message || 'Không thể cấp liên kết tải tệp.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 h-[460px] rounded-xl bg-[#F5F7FA] animate-pulse" />
          <div className="lg:col-span-5 h-[460px] rounded-xl bg-[#F5F7FA] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#142C48]">
          Không tìm thấy hồ sơ bản vẽ
        </h1>
        <p className="text-sm text-slate-600">{error || 'Hồ sơ này không tồn tại hoặc đã bị gỡ.'}</p>
        <Button onClick={() => onNavigate({ name: 'catalog' })}>
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh mục
        </Button>
      </div>
    );
  }

  const availableBalance = wallet?.availableBalanceVnd ?? 0;
  const priceToPay = product.pricing.effectivePriceVnd;
  const projectedRemaining = availableBalance - priceToPay;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-2 text-xs text-slate-500 mb-6">
        <button
          type="button"
          onClick={() => onNavigate({ name: 'home' })}
          className="hover:text-[#142C48] cursor-pointer"
        >
          Trang chủ
        </button>
        <span>/</span>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'catalog', category: product.category.slug })}
          className="hover:text-[#142C48] cursor-pointer"
        >
          {product.category.name}
        </button>
        <span>/</span>
        <span className="font-mono-tech text-[#142C48] font-semibold">{product.code}</span>
      </nav>

      {/* Main Split: Gallery Left + Purchase & Spec Module Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Preview Gallery & Technical Description */}
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-3">
            <div className="aspect-[4/3] w-full rounded-xl overflow-hidden border border-slate-200 bg-[#F5F7FA]">
              <SafeImage
                src={activeImage}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            </div>

            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {product.images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImage(img.imageUrl)}
                    className={`aspect-[4/3] rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
                      activeImage === img.imageUrl
                        ? 'border-[#142C48]'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <SafeImage
                      src={img.imageUrl}
                      alt={img.caption || product.title}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="font-display text-xl font-bold text-[#142C48]">
              Mô tả nội dung hồ sơ
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </div>

          {/* File Package Manifest */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <h2 className="font-display text-xl font-bold text-[#142C48]">
              Thành phần tệp tin đính kèm
            </h2>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white">
              {product.files.map((f) => (
                <div
                  key={f.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-4 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileArchive className="w-4 h-4 text-[#142C48] shrink-0" />
                    <span className="font-mono-tech text-xs text-[#142C48] truncate">
                      {f.originalFilename}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono-tech text-slate-500">
                      {f.versionLabel} · {product.fileSizeLabel}
                    </span>
                    {product.hasEntitlement && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={downloadingFileId !== null}
                        onClick={() => handleDownloadFile(f.id)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloadingFileId === f.id ? 'Đang tạo link...' : 'Tải tệp'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Version History */}
          {product.versions.length > 0 && (
            <div className="pt-6 border-t border-slate-200 space-y-3">
              <h2 className="font-display text-lg font-bold text-[#142C48]">
                Lịch sử phiên bản
              </h2>
              <div className="space-y-2">
                {product.versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-baseline justify-between gap-4 text-xs py-2 border-b border-slate-100"
                  >
                    <div>
                      <span className="font-mono-tech font-bold text-[#142C48]">
                        {v.versionNumber}
                      </span>
                      <span className="text-slate-600 ml-2">{v.changelog}</span>
                    </div>
                    <span className="text-slate-400 tabular-nums shrink-0">
                      {formatDateVi(v.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Contiguous Purchase & Specification Module */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{product.category.name} · Đã kiểm duyệt</span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 font-mono-tech font-semibold text-[#142C48] hover:underline cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Đã sao chép {product.code}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    {product.code}
                  </>
                )}
              </button>
            </div>

            <h1 className="font-display text-2xl font-extrabold text-[#142C48] leading-snug">
              {product.title}
            </h1>

            <p className="text-sm text-slate-600 leading-relaxed">{product.summary}</p>
          </div>

          {/* Account-Aware Pricing Box */}
          <div className="p-4 rounded-lg bg-[#F5F7FA] border border-slate-200 space-y-1.5">
            <div className="text-xs font-semibold text-slate-500">
              {product.pricing.hasCustomPrice
                ? 'Giá áp dụng riêng cho tài khoản của bạn'
                : 'Giá niêm yết hồ sơ'}
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className={`text-3xl font-extrabold tabular-nums ${
                  product.pricing.effectivePriceVnd === 0
                    ? 'text-emerald-700'
                    : 'text-[#142C48]'
                }`}
              >
                {formatVnd(product.pricing.effectivePriceVnd)}
              </span>
              {product.pricing.hasCustomPrice &&
                product.pricing.listedPriceVnd > product.pricing.effectivePriceVnd && (
                  <span className="text-sm text-slate-400 line-through tabular-nums">
                    {formatVnd(product.pricing.listedPriceVnd)}
                  </span>
                )}
            </div>
            {product.pricing.hasCustomPrice && (
              <div className="text-xs font-semibold text-amber-700">
                Ưu đãi -{product.pricing.discountPercent}% so với giá niêm yết
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {product.hasEntitlement ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-emerald-900">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    Bạn đã sở hữu hồ sơ này
                  </span>
                  {product.entitlement && (
                    <span className="font-mono-tech tabular-nums">
                      Đã tải {product.entitlement.downloadsUsed}/{product.entitlement.maxDownloads}
                    </span>
                  )}
                </div>
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full font-bold text-[#142C48]"
                  disabled={downloadingFileId !== null}
                  onClick={() => handleDownloadFile()}
                >
                  <Download className="w-4 h-4" />
                  {downloadingFileId !== null
                    ? 'Đang tạo liên kết bảo mật...'
                    : 'Tải xuống hồ sơ bản vẽ (.ZIP)'}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full font-bold text-[#142C48]"
                  disabled={checkingOut}
                  onClick={handlePrimaryPurchaseButton}
                >
                  {checkingOut
                    ? 'Đang xử lý đơn hàng...'
                    : priceToPay === 0
                    ? 'Nhận tài liệu miễn phí'
                    : confirmOpen
                    ? 'Thu gọn xác nhận thanh toán'
                    : 'Mua bản vẽ bằng Ví VND'}
                </Button>

                {confirmOpen && user && priceToPay > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-3 text-xs">
                    <div className="font-bold text-[#142C48]">
                      Xác nhận thanh toán bằng Ví nội bộ
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Giá thanh toán áp dụng</span>
                        <span className="font-bold tabular-nums text-[#142C48]">
                          {formatVnd(priceToPay)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Số dư ví khả dụng</span>
                        <span className="font-bold tabular-nums text-[#142C48]">
                          {formatVnd(availableBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-slate-200">
                        <span className="text-slate-600 font-medium">
                          {projectedRemaining >= 0 ? 'Số dư dự kiến sau mua' : 'Còn thiếu'}
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            projectedRemaining >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatVnd(Math.abs(projectedRemaining))}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#142C48] mb-1">
                        Mã ưu đãi / Coupon (nếu có)
                      </label>
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Nhập mã giảm giá..."
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono-tech uppercase focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                      />
                    </div>

                    {projectedRemaining >= 0 || couponCode.trim() ? (
                      <Button
                        type="button"
                        className="w-full"
                        disabled={checkingOut}
                        onClick={handleExecuteCheckout}
                      >
                        {checkingOut
                          ? 'Đang trừ ví & cấp quyền tải...'
                          : `Xác nhận thanh toán ${formatVnd(priceToPay)}`}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => onNavigate({ name: 'account', tab: 'wallet' })}
                      >
                        <Wallet className="w-4 h-4" />
                        Nạp thêm qua VietQR SHB (0946265256)
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={handleToggleFavorite}
                disabled={favPending}
              >
                <Heart
                  className={`w-4 h-4 ${
                    favorited ? 'fill-red-500 text-red-500' : 'text-slate-500'
                  }`}
                />
                {favorited ? 'Đã yêu thích' : 'Lưu yêu thích'}
              </Button>

              <Button
                variant="outline"
                onClick={() => onNavigate({ name: 'support' })}
              >
                Hỏi kỹ thuật
              </Button>
            </div>
          </div>

          {actionSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900 leading-relaxed space-y-2">
              <p>{actionSuccess}</p>
              <button
                type="button"
                onClick={() => onNavigate({ name: 'account', tab: 'orders' })}
                className="font-bold text-[#142C48] underline cursor-pointer"
              >
                Xem đơn hàng &amp; lịch sử tải →
              </button>
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800 leading-relaxed space-y-2">
              <p>{actionError}</p>
              {needsTopup && user && (
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'account', tab: 'wallet' })}
                  className="font-bold text-[#142C48] underline cursor-pointer"
                >
                  Nạp tiền nhanh qua VietQR SHB (0946265256) →
                </button>
              )}
            </div>
          )}

          {/* Specification Table */}
          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold text-[#142C48] mb-3">
              Thông số kỹ thuật hồ sơ
            </h3>
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Định dạng gốc</dt>
                <dd className="font-mono-tech font-semibold text-[#142C48]">
                  {product.fileFormat}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Phần mềm tương thích</dt>
                <dd className="font-medium text-[#142C48]">
                  {product.softwareVersion || 'Tiêu chuẩn chung'}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Dung lượng gói tải</dt>
                <dd className="font-mono-tech font-semibold text-[#142C48]">
                  {product.fileSizeLabel}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Số lượng bản vẽ / trang</dt>
                <dd className="font-mono-tech font-semibold text-[#142C48]">
                  {formatNumberVi(product.pageOrSheetCount)}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Đơn vị phát hành</dt>
                <dd className="font-semibold text-[#142C48]">
                  {product.seller.displayName}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Ngày đăng</dt>
                <dd className="tabular-nums text-[#142C48]">
                  {formatDateVi(product.publishedAt)}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Lượt xem / Lượt mua</dt>
                <dd className="tabular-nums text-[#142C48]">
                  {formatNumberVi(product.viewCount)} xem · {formatNumberVi(product.purchaseCount)} mua
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-500 pt-2">
            <ShieldCheck className="w-4 h-4 text-[#142C48] shrink-0 mt-0.5" />
            <span>
              Tệp gốc được lưu trữ trong kho bảo mật riêng và chỉ cấp đường dẫn Signed URL có thời hạn 120 giây cho tài khoản sở hữu quyền tải.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
