import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import type { AppRoute } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/ui/button';
import { apiRequest } from '../lib/api';
import { formatNumberVi } from '../lib/format';
import type { CategoryItem, ProductSummary } from '../types/sis';

interface CatalogPageProps {
  initialCategory?: string;
  initialTag?: 'featured' | 'new' | 'free';
  initialQuery?: string;
  onNavigate: (route: AppRoute) => void;
}

export function CatalogPage({
  initialCategory = 'all',
  initialTag,
  initialQuery = '',
  onNavigate,
}: CatalogPageProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [q, setQ] = useState(initialQuery);
  const [submittedQ, setSubmittedQ] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory || 'all');
  const [tag, setTag] = useState<'all' | 'featured' | 'new' | 'free'>(initialTag || 'all');
  const [format, setFormat] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setCategory(initialCategory || 'all');
    setTag(initialTag || 'all');
    setQ(initialQuery || '');
    setSubmittedQ(initialQuery || '');
    setPage(1);
  }, [initialCategory, initialTag, initialQuery]);

  useEffect(() => {
    apiRequest<CategoryItem[]>('/categories')
      .then(setCategories)
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (submittedQ) params.set('q', submittedQ);
      if (category !== 'all') params.set('category', category);
      if (tag !== 'all') params.set('tag', tag);
      if (format !== 'all') params.set('format', format);
      params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', '12');

      const data = await apiRequest<{
        items: ProductSummary[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/products?${params.toString()}`);

      setProducts(data.items);
      setTotal(data.pagination.total);
      setTotalPages(Math.max(1, data.pagination.totalPages));
    } catch (err: any) {
      setError(err?.message || 'Không thể tải danh sách bản vẽ.');
    } finally {
      setLoading(false);
    }
  }, [submittedQ, category, tag, format, sort, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedQ(q.trim());
  };

  const resetFilters = () => {
    setQ('');
    setSubmittedQ('');
    setCategory('all');
    setTag('all');
    setFormat('all');
    setSort('newest');
    setPage(1);
  };

  const headingTitle =
    tag === 'featured'
      ? 'Tài liệu nổi bật'
      : tag === 'free'
      ? 'Tài liệu miễn phí'
      : tag === 'new'
      ? 'Tài liệu mới phát hành'
      : 'Danh mục bản vẽ & hồ sơ kỹ thuật';

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Search Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-5 border-b border-slate-100">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              Trang chủ / Thư viện bản vẽ
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#142C48]">
              {headingTitle}
            </h1>
            <p className="text-sm text-slate-500 mt-1 tabular-nums">
              Tìm thấy {formatNumberVi(total)} hồ sơ đã kiểm duyệt
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full lg:w-auto lg:min-w-[420px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên bản vẽ, mã SIS, định dạng..."
                className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B56B8]"
              />
            </div>
            <Button type="submit">Tìm</Button>
          </form>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Segmented Tabs */}
          <div className="flex items-center flex-wrap gap-1 p-1 bg-[#F4F7FC] rounded-xl w-fit">
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'featured', label: 'Nổi bật' },
                { id: 'new', label: 'Mới nhất' },
                { id: 'free', label: 'Miễn phí' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTag(item.id);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tag === item.id
                    ? 'bg-white text-[#1B56B8] shadow-xs'
                    : 'text-slate-600 hover:text-[#1B56B8]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo danh mục"
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#142C48] focus:outline-none focus:ring-2 focus:ring-[#142C48]"
          >
            <option value="all">Tất cả 15 danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name} ({c.productCount})
              </option>
            ))}
          </select>

          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo định dạng"
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#142C48] focus:outline-none focus:ring-2 focus:ring-[#142C48]"
          >
            <option value="all">Mọi định dạng</option>
            <option value="DWG">AutoCAD (DWG)</option>
            <option value="RVT">Revit (RVT / RFA)</option>
            <option value="SKP">SketchUp (SKP)</option>
            <option value="IFC">BIM (IFC)</option>
            <option value="PDF">Hồ sơ PDF / DOCX</option>
          </select>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            aria-label="Sắp xếp"
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#142C48] focus:outline-none focus:ring-2 focus:ring-[#142C48]"
          >
            <option value="newest">Mới đăng nhất</option>
            <option value="popular">Mua nhiều nhất</option>
            <option value="views">Xem nhiều nhất</option>
            <option value="price_asc">Giá tăng dần</option>
            <option value="price_desc">Giá giảm dần</option>
          </select>

          {(submittedQ || category !== 'all' || tag !== 'all' || format !== 'all') && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="w-3.5 h-3.5" />
              Đặt lại
            </Button>
          )}
        </div>
        </div>
      </div>

      {/* Results */}
      <div>
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-white p-4 flex items-center justify-between">
            <span className="text-sm text-red-700">{error}</span>
            <Button variant="outline" size="sm" onClick={fetchProducts}>
              Thử lại
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[360px] rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-4">
            <h2 className="font-display text-lg font-bold text-[#142C48]">
              Không tìm thấy bản vẽ phù hợp
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Hãy thử từ khóa khác hoặc đặt lại bộ lọc danh mục để xem toàn bộ hồ sơ kỹ thuật.
            </p>
            <Button variant="default" onClick={resetFilters}>
              Xem tất cả bản vẽ
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={(slug) => onNavigate({ name: 'product', slug })}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Trang trước
                </Button>
                <span className="text-xs font-semibold text-slate-600 tabular-nums px-3">
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
          </>
        )}
      </div>
    </div>
  );
}
