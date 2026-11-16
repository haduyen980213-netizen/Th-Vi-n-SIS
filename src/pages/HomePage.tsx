import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, Layers, Search, ShieldCheck } from 'lucide-react';
import type { AppRoute } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { SafeImage } from '../components/SafeImage';
import { Button } from '../components/ui/button';
import { apiRequest } from '../lib/api';
import { formatNumberVi } from '../lib/format';
import type { CategoryItem, CmsBannerRecord, ProductSummary } from '../types/sis';

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<ProductSummary[]>([]);
  const [freeProducts, setFreeProducts] = useState<ProductSummary[]>([]);
  const [cmsBanners, setCmsBanners] = useState<CmsBannerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [catsRes, featRes, freeRes, cmsRes] = await Promise.allSettled([
        apiRequest<CategoryItem[]>('/categories'),
        apiRequest<{ items: ProductSummary[] }>('/products?tag=featured&limit=6&sort=popular'),
        apiRequest<{ items: ProductSummary[] }>('/products?tag=free&limit=3&sort=newest'),
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate({ name: 'catalog', q: searchTerm.trim() || undefined });
  };

  return (
    <div>
      {/* 1. Storefront Hero Split */}
      <section className="bg-[#F5F7FA] border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div className="text-xs font-semibold tracking-wide text-[#142C48]/70">
                SIS DIGITAL LIBRARY · KHO BẢN VẼ KỸ THUẬT VIỆT NAM
              </div>

              <h1
                className="font-display font-extrabold text-[#142C48] leading-[1.12] tracking-tight"
                style={{ fontSize: 'clamp(2rem, 3.8vw, 3.25rem)', textWrap: 'balance' }}
              >
                Hồ sơ bản vẽ thi công, mô hình BIM và tài liệu kỹ thuật chuẩn xác
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Nền tảng giao dịch bản vẽ AutoCAD, Revit, SketchUp, kết cấu, MEP và đồ án chuyên ngành
                dành cho kiến trúc sư, kỹ sư xây dựng và đơn vị thi công.
              </p>

              {/* Prominent Search Bar */}
              <form
                onSubmit={handleSearch}
                className="flex flex-col sm:flex-row gap-2.5 max-w-xl"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm bản vẽ biệt thự, nhà phố, kết cấu, MEP, mã SIS..."
                    className="w-full h-12 pl-10 pr-4 rounded-lg bg-white border border-slate-300 text-sm text-[#142C48] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                  />
                </div>
                <Button type="submit" variant="gold" size="lg" className="h-12 px-6 font-bold">
                  Tìm kiếm
                </Button>
              </form>

              <div className="flex flex-wrap items-center gap-6 pt-2 text-xs font-medium text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#142C48]" />
                  Kiểm duyệt kỹ thuật trước phát hành
                </span>
                <span className="inline-flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#142C48]" />
                  Đa định dạng DWG · RVT · SKP · IFC
                </span>
                <span className="inline-flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#142C48]" />
                  Chính sách giá ưu đãi theo tài khoản
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-white">
                <SafeImage
                  src="/src/assets/images/hero_sis_architecture_1794798218632.jpg"
                  alt="Không gian thiết kế kiến trúc và mô hình BIM tại THƯ VIỆN SIS"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Active CMS Banner Strip (managed via Admin CMS) */}
      {cmsBanners.length > 0 && (
        <section className="bg-[#142C48] text-white border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-[#F2C94C]">{cmsBanners[0].title}</div>
              {cmsBanners[0].subtitle && (
                <div className="text-xs text-slate-200 mt-0.5">{cmsBanners[0].subtitle}</div>
              )}
            </div>
            <Button
              variant="gold"
              size="sm"
              onClick={() => onNavigate({ name: 'catalog', tag: 'featured' })}
            >
              Xem chi tiết
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </section>
      )}

      {/* 2. 15 Technical Categories Directory */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#142C48]">
              15 Chuyên mục bản vẽ kỹ thuật
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Lọc nhanh hồ sơ theo bộ môn thiết kế và phần mềm chuyên ngành.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate({ name: 'catalog' })}
          >
            Xem toàn bộ danh mục
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={idx}
                className="h-20 rounded-lg bg-[#F5F7FA] border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onNavigate({ name: 'catalog', category: cat.slug })}
                className="group p-4 rounded-lg border border-slate-200 bg-white hover:border-[#142C48] hover:bg-[#F5F7FA] transition-colors text-left cursor-pointer"
              >
                <div className="text-sm font-bold text-[#142C48] group-hover:underline">
                  {cat.name}
                </div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  {formatNumberVi(cat.productCount)} hồ sơ
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-[#F5F7FA] p-6 text-center text-sm text-slate-600">
            Không thể tải danh sách chuyên mục. Vui lòng thử lại.
          </div>
        )}
      </section>

      {/* 3. Featured Drawings Collection */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#142C48]">
              Hồ sơ bản vẽ nổi bật
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Các bộ hồ sơ thi công và mô hình BIM được kiến trúc sư, kỹ sư tải nhiều nhất.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate({ name: 'catalog', tag: 'featured' })}
          >
            Xem tất cả nổi bật
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-96 rounded-xl bg-[#F5F7FA] border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : error && featuredProducts.length === 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
            <span className="text-sm text-red-700">{error}</span>
            <Button variant="outline" size="sm" onClick={loadData}>
              Thử lại
            </Button>
          </div>
        ) : featuredProducts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-10 text-center">
            <p className="text-sm text-slate-600">Chưa có bản vẽ nổi bật nào được xuất bản.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

      {/* 4. Free Technical Resources Collection */}
      <section className="bg-[#F5F7FA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#142C48]">
                Tài liệu &amp; thư viện miễn phí
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Block AutoCAD chuẩn TCVN, Family Revit và thuyết minh biện pháp thi công chia sẻ mở.
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => onNavigate({ name: 'catalog', tag: 'free' })}
            >
              Xem kho miễn phí
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {!loading && freeProducts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {freeProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={(slug) => onNavigate({ name: 'product', slug })}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
