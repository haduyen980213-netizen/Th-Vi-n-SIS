import React, { useEffect, useMemo, useState } from 'react';
import {
  Armchair,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronRight,
  Clock,
  Compass,
  Crown,
  Download,
  FileCode2,
  Flame,
  FolderKanban,
  Gift,
  Headphones,
  Heart,
  Home,
  Layers,
  List,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wrench,
  Zap,
} from 'lucide-react';
import type { AppRoute } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { SafeImage } from '../components/SafeImage';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatNumberVi, formatVnd } from '../lib/format';
import type {
  CategoryItem,
  CmsBannerRecord,
  ProductSummary,
} from '../types/sis';

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  ctaLabel: string;
  imageUrl: string;
  route: AppRoute;
}

const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: 'sis-main',
    title: 'THƯ VIỆN SIS',
    subtitle: 'Tri thức kết nối - Giá trị lan tỏa',
    description:
      'Khám phá kho hồ sơ bản vẽ thi công AutoCAD, mô hình BIM Revit, SketchUp và tài liệu kỹ thuật chuẩn xác từ cộng đồng chuyên gia.',
    ctaLabel: 'Khám phá ngay',
    imageUrl: '/src/assets/images/hero_sis_architecture_1794798218632.jpg',
    route: { name: 'catalog' },
  },
  {
    id: 'sis-featured',
    title: 'Hồ sơ Biệt thự & Nhà phố',
    subtitle: 'Đầy đủ kiến trúc, kết cấu & MEP chuẩn TCVN',
    description:
      'Tổng hợp các bộ bản vẽ thi công hoàn chỉnh được kiến trúc sư, kỹ sư và đơn vị nhà thầu tin dùng.',
    ctaLabel: 'Xem bản vẽ nổi bật',
    imageUrl: '/src/assets/images/drawing_modern_villa_1794798219281.jpg',
    route: { name: 'catalog', tag: 'featured' },
  },
  {
    id: 'sis-free',
    title: 'Kho Tài Nguyên Miễn Phí',
    subtitle: 'Tải nhanh hồ sơ mẫu, Block CAD & Family BIM',
    description:
      'Truy cập và tải xuống ngay các bộ hồ sơ tham khảo miễn phí dành cho thành viên THƯ VIỆN SIS.',
    ctaLabel: 'Xem kho miễn phí',
    imageUrl: '/src/assets/images/drawing_structural_bim_1794798220917.jpg',
    route: { name: 'catalog', tag: 'free' },
  },
];

function getCategoryIcon(slug: string) {
  if (slug.includes('nha-pho') || slug.includes('biet-thu')) return Home;
  if (slug.includes('kien-truc')) return Building2;
  if (slug.includes('noi-that')) return Armchair;
  if (slug.includes('ket-cau') || slug.includes('bim') || slug.includes('revit')) return Layers;
  if (slug.includes('mep') || slug.includes('dien') || slug.includes('nuoc')) return Zap;
  if (slug.includes('cad') || slug.includes('autocad')) return Compass;
  if (slug.includes('do-an') || slug.includes('thuyet-minh')) return BookOpen;
  if (slug.includes('chi-tiet') || slug.includes('thi-cong')) return Wrench;
  return FolderKanban;
}

export function HomePage({ onNavigate, onOpenAuth }: HomePageProps) {
  const { user, wallet } = useAuth();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<ProductSummary[]>([]);
  const [freeProducts, setFreeProducts] = useState<ProductSummary[]>([]);
  const [cmsBanners, setCmsBanners] = useState<CmsBannerRecord[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [catsRes, featRes, freeRes, cmsRes] = await Promise.allSettled([
        apiRequest<CategoryItem[]>('/categories'),
        apiRequest<{ items: ProductSummary[] }>('/products?tag=featured&limit=4&sort=popular'),
        apiRequest<{ items: ProductSummary[] }>('/products?tag=free&limit=4&sort=newest'),
        apiRequest<{ banners: CmsBannerRecord[]; settings: Record<string, string> }>('/cms/home'),
      ]);

      const errors: string[] = [];

      if (catsRes.status === 'fulfilled') {
        setCategories(catsRes.value);
      } else {
        errors.push(catsRes.reason?.message || 'Không thể tải danh mục bản vẽ.');
      }

      if (featRes.status === 'fulfilled') {
        setFeaturedProducts(featRes.value.items);
      } else {
        errors.push(featRes.reason?.message || 'Không thể tải hồ sơ bản vẽ nổi bật.');
      }

      if (freeRes.status === 'fulfilled') {
        setFreeProducts(freeRes.value.items);
      }

      if (cmsRes.status === 'fulfilled') {
        setCmsBanners(cmsRes.value.banners || []);
      } else {
        setCmsBanners([]);
      }

      if (errors.length > 0) {
        setError(errors[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải dữ liệu thư viện.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Build slides using CMS active hero banners if present, falling back to clean real SIS slides
  const heroSlides = useMemo<HeroSlide[]>(() => {
    const activeHeroBanners = cmsBanners.filter(
      (b) => b.isActive && (!b.position || b.position === 'HOME_HERO')
    );
    if (activeHeroBanners.length > 0) {
      const mapped = activeHeroBanners.map((b) => ({
        id: `cms-${b.id}`,
        title: b.title,
        subtitle: b.subtitle || 'Tri thức kết nối - Kho bản vẽ kỹ thuật',
        description:
          'Hệ sinh thái bản vẽ thi công, mô hình BIM và tài liệu kỹ thuật kiểm duyệt chuẩn xác.',
        ctaLabel: 'Khám phá ngay',
        imageUrl: b.imageUrl || '/src/assets/images/hero_sis_architecture_1794798218632.jpg',
        route: { name: 'catalog' } as AppRoute,
      }));
      return [...mapped, ...DEFAULT_HERO_SLIDES.slice(1)];
    }
    return DEFAULT_HERO_SLIDES;
  }, [cmsBanners]);

  // Subtle auto-advance carousel
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveSlideIdx((prev) => (prev + 1) % heroSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  const currentSlide = heroSlides[activeSlideIdx % heroSlides.length] || DEFAULT_HERO_SLIDES[0];
  const sidebarCategories = categories.slice(0, 7);

  const accountTierLabel = !user
    ? 'Khách tham quan'
    : user.roles.includes('ADMIN')
    ? 'Gói: Quản trị viên'
    : user.roles.includes('SELLER')
    ? 'Gói: Đối tác Tác giả'
    : 'Gói: Thành viên SIS';

  const handleOpenAccountTab = (tab: 'profile' | 'orders' | 'favorites' | 'wallet' | 'custom-prices') => {
    if (user) {
      onNavigate({ name: 'account', tab });
    } else if (onOpenAuth) {
      onOpenAuth('login');
    } else {
      onNavigate({ name: 'account', tab });
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* 1. 3-Column Bento Storefront Hero + Feature Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left + Center Main Column (9/12 on lg) */}
        <div className="lg:col-span-9 flex flex-col gap-4">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
            {/* Left Sidebar: Categories */}
            <aside className="md:col-span-4 lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
              <div className="bg-[#1B56B8] text-white px-4 py-3 flex items-center gap-2.5">
                <List className="w-4 h-4 shrink-0" />
                <span className="font-display font-bold text-sm">Danh mục</span>
              </div>

              <div className="flex-1 divide-y divide-slate-100">
                {loading ? (
                  <div className="p-3 space-y-2.5">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="h-7 rounded-lg bg-[#F4F7FC] animate-pulse" />
                    ))}
                  </div>
                ) : sidebarCategories.length > 0 ? (
                  sidebarCategories.map((cat) => {
                    const Icon = getCategoryIcon(cat.slug);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => onNavigate({ name: 'catalog', category: cat.slug })}
                        className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#F4F7FC] transition-colors group cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 text-[#1B56B8] shrink-0" />
                          <span className="text-[13px] font-medium text-[#142C48] group-hover:text-[#1B56B8] truncate">
                            {cat.name}
                          </span>
                        </span>
                        <span className="text-[11px] font-medium text-slate-400 tabular-nums shrink-0">
                          {formatNumberVi(cat.productCount)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-xs text-slate-500">Đang cập nhật danh mục...</div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigate({ name: 'catalog' })}
                className="px-4 py-2.5 bg-[#F4F7FC]/70 border-t border-slate-100 text-xs font-bold text-[#1B56B8] hover:bg-[#1B56B8]/8 flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Xem tất cả {categories.length || 15} danh mục</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </aside>

            {/* Center: Full-bleed Hero Banner Carousel */}
            <div className="md:col-span-8 lg:col-span-9 relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,0.06)] min-h-[290px] sm:min-h-[315px] flex items-center bg-[#102A54]">
              <SafeImage
                src={currentSlide.imageUrl}
                alt={currentSlide.title}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              />
              {/* Left-weighted royal-navy gradient scrim for crisp contrast */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(13, 35, 74, 0.94) 0%, rgba(20, 56, 118, 0.80) 48%, rgba(20, 56, 118, 0.22) 100%)',
                }}
              />

              <div className="relative z-10 p-6 sm:p-9 max-w-xl space-y-3">
                <h1
                  className="font-display font-extrabold text-white leading-[1.1] tracking-tight"
                  style={{ fontSize: 'clamp(1.85rem, 3.2vw, 2.75rem)' }}
                >
                  {currentSlide.title}
                </h1>
                <p className="text-base sm:text-xl font-bold text-white/95">
                  {currentSlide.subtitle}
                </p>
                <p className="text-xs sm:text-sm text-slate-100/90 leading-relaxed max-w-md">
                  {currentSlide.description}
                </p>

                <div className="pt-2">
                  <Button
                    variant="gold"
                    size="lg"
                    className="rounded-full px-6 font-bold shadow-sm"
                    onClick={() => onNavigate(currentSlide.route)}
                  >
                    {currentSlide.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Carousel Dots */}
              {heroSlides.length > 1 && (
                <div className="absolute bottom-4 left-6 sm:left-9 z-10 flex items-center gap-2">
                  {heroSlides.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveSlideIdx(idx)}
                      aria-label={`Chuyển đến slide ${idx + 1}`}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        idx === activeSlideIdx
                          ? 'w-6 bg-[#F6C343]'
                          : 'w-2 bg-white/60 hover:bg-white'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4-Column Trust & Feature Strip below Hero + Category */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white rounded-2xl border border-slate-200/80 p-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'catalog' })}
              className="flex items-center gap-3 text-left p-2 rounded-xl hover:bg-[#F4F7FC] transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1B56B8]/10 text-[#1B56B8] flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-[#142C48] truncate">
                  Kho bản vẽ SIS
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Kết nối tác giả &amp; kỹ sư
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate({ name: 'catalog' })}
              className="flex items-center gap-3 text-left p-2 rounded-xl hover:bg-[#F4F7FC] transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1B56B8]/10 text-[#1B56B8] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-[#142C48] truncate">
                  Kiểm duyệt kỹ thuật
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Đa định dạng DWG · RVT · SKP
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAccountTab('custom-prices')}
              className="flex items-center gap-3 text-left p-2 rounded-xl hover:bg-[#F4F7FC] transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F6C343]/20 text-[#D97706] flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-[#142C48] truncate">
                  Tài khoản linh hoạt
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Giá ưu đãi theo tài khoản
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate({ name: 'support' })}
              className="flex items-center gap-3 text-left p-2 rounded-xl hover:bg-[#F4F7FC] transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-[#1B56B8]/10 text-[#1B56B8] flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-[#142C48] truncate">
                  Hỗ trợ 24/7
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Luôn đồng hành cùng bạn
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Right Sidebar Rail (3/12 on lg) */}
        <div className="lg:col-span-3 flex flex-col gap-3.5">
          {/* Card 1: Your Account */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] flex flex-col justify-between gap-2.5">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F6C343]/25 text-[#D97706] flex items-center justify-center">
                  <Crown className="w-3.5 h-3.5" />
                </span>
                <h2 className="font-display text-sm font-bold text-[#142C48]">Tài khoản của bạn</h2>
              </div>

              {user ? (
                <>
                  <div className="rounded-xl bg-[#FFF9E6] border border-[#F6C343]/40 p-2.5 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#F6C343] text-[#142C48] flex items-center justify-center shrink-0">
                      <Crown className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#142C48] truncate">
                        {accountTierLabel}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-600 tabular-nums">
                        Số dư ví: {formatVnd(wallet?.availableBalanceVnd ?? 0)}
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="default"
                    size="sm"
                    className="w-full h-8 rounded-xl text-xs"
                    onClick={() => onNavigate({ name: 'account', tab: 'profile' })}
                  >
                    Quản lý tài khoản
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-[#F4F7FC] border border-slate-200/80 p-2.5 space-y-0.5">
                    <div className="text-xs font-bold text-[#142C48]">
                      Chưa đăng nhập tài khoản SIS
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      Đăng nhập để tải hồ sơ miễn phí &amp; lưu bản vẽ yêu thích.
                    </p>
                  </div>

                  <Button
                    variant="default"
                    size="sm"
                    className="w-full h-8 rounded-xl text-xs"
                    onClick={() => (onOpenAuth ? onOpenAuth('login') : onNavigate({ name: 'account' }))}
                  >
                    Đăng nhập / Đăng ký
                  </Button>
                </>
              )}
            </div>

            {user ? (
              <div className="divide-y divide-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'account', tab: 'orders' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Đơn hàng của tôi</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'account', tab: 'orders' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Tài liệu &amp; bản vẽ đã mua</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'account', tab: 'favorites' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Heart className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Bản vẽ yêu thích</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'account', tab: 'wallet' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Lịch sử giao dịch</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', tag: 'free' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Gift className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Xem bản vẽ miễn phí</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', tag: 'featured' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Hồ sơ bản vẽ nổi bật</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'support' })}
                  className="w-full py-1.5 flex items-center gap-2 text-[#142C48] hover:text-[#1B56B8] font-medium cursor-pointer"
                >
                  <Headphones className="w-3.5 h-3.5 text-[#1B56B8]" />
                  <span>Hỗ trợ kỹ thuật SIS</span>
                </button>
              </div>
            )}
          </div>

          {/* Card 2: Compact Promo / Free Resources Highlight Card */}
          <div className="shrink-0 rounded-2xl p-3.5 text-white bg-gradient-to-br from-[#1B56B8] via-[#2563EB] to-[#3B82F6] shadow-[0_4px_12px_rgba(27,86,184,0.22)] flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="text-[11px] font-bold text-[#F6C343]">Ưu đãi đặc biệt</div>
              <div className="font-display text-sm font-extrabold leading-tight truncate">
                Kho hồ sơ miễn phí
              </div>
              <p className="text-[11px] text-blue-100 leading-tight line-clamp-1">
                Tải nhanh AutoCAD &amp; Revit miễn phí
              </p>
            </div>
            <Button
              variant="gold"
              size="sm"
              className="rounded-full h-8 px-3.5 font-bold text-[11px] shrink-0"
              onClick={() => onNavigate({ name: 'catalog', tag: 'free' })}
            >
              Xem ngay
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </section>

      {/* 2. Featured Technical Drawings (4-Column Grid) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-orange-500/12 text-orange-600 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#142C48]">
                Hồ sơ bản vẽ nổi bật
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'catalog', tag: 'featured' })}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#1B56B8] hover:underline cursor-pointer shrink-0"
          >
            Xem tất cả
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[360px] rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : error && featuredProducts.length === 0 ? (
          <div className="rounded-2xl border border-red-200 bg-white p-5 flex items-center justify-between gap-4">
            <span className="text-sm text-red-700">{error}</span>
            <Button variant="outline" size="sm" onClick={loadData}>
              Thử lại
            </Button>
          </div>
        ) : featuredProducts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-600">Chưa có bản vẽ nổi bật nào được xuất bản.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={(slug) => onNavigate({ name: 'product', slug })}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Free Technical Resources Collection (4-Column Grid) */}
      <section className="space-y-4 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#1B56B8]/10 text-[#1B56B8] flex items-center justify-center">
              <FileCode2 className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#142C48]">
                Tài liệu &amp; bản vẽ miễn phí
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'catalog', tag: 'free' })}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#1B56B8] hover:underline cursor-pointer shrink-0"
          >
            Xem tất cả
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[360px] rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : freeProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {freeProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={(slug) => onNavigate({ name: 'product', slug })}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Kho bản vẽ miễn phí đang được cập nhật.
          </div>
        )}
      </section>
    </div>
  );
}
