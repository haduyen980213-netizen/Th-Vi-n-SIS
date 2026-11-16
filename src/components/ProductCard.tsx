import { Eye, Download } from 'lucide-react';
import { formatNumberVi, formatVnd } from '../lib/format';
import type { ProductSummary } from '../types/sis';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: ProductSummary;
  onSelect: (slug: string) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const { pricing } = product;

  return (
    <article
      onClick={() => onSelect(product.slug)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product.slug);
        }
      }}
      tabIndex={0}
      role="button"
      className="group flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#142C48]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#142C48] cursor-pointer text-left"
    >
      <div className="relative aspect-[4/3] w-full bg-[#F5F7FA] overflow-hidden border-b border-slate-100">
        <SafeImage
          src={product.thumbnailUrl}
          alt={product.title}
          fallbackLabel={product.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex-1 p-5 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          {/* Unboxed metadata with typographic separators (Zero-Pill Discipline) */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs font-medium text-slate-500">
            <span className="text-[#142C48] font-semibold">{product.category.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tech">{product.fileFormat}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tech">{product.fileSizeLabel}</span>
          </div>

          <h3 className="font-display text-base font-bold text-[#142C48] leading-snug line-clamp-2 group-hover:text-[#0E2036]">
            {product.title}
          </h3>

          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {product.summary}
          </p>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono-tech text-slate-400">
              {product.code}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className={`text-base font-bold tabular-nums ${
                  pricing.effectivePriceVnd === 0
                    ? 'text-emerald-700'
                    : 'text-[#142C48]'
                }`}
              >
                {formatVnd(pricing.effectivePriceVnd)}
              </span>
              {pricing.hasCustomPrice && pricing.listedPriceVnd > pricing.effectivePriceVnd && (
                <span className="text-xs text-slate-400 line-through tabular-nums">
                  {formatVnd(pricing.listedPriceVnd)}
                </span>
              )}
            </div>
            {pricing.hasCustomPrice && (
              <div className="text-[11px] font-semibold text-amber-700 mt-0.5">
                Giá riêng tài khoản (-{pricing.discountPercent}%)
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums shrink-0">
            <span className="inline-flex items-center gap-1" title="Lượt xem">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              {formatNumberVi(product.viewCount)}
            </span>
            <span className="inline-flex items-center gap-1" title="Lượt tải">
              <Download className="w-3.5 h-3.5 text-slate-400" />
              {formatNumberVi(product.downloadCount)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
