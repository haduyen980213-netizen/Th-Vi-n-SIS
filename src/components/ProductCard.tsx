import { Building2, Star } from 'lucide-react';
import { formatNumberVi, formatVnd } from '../lib/format';
import type { ProductSummary } from '../types/sis';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: ProductSummary;
  onSelect: (slug: string) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const { pricing } = product;
  const ratingValue = product.ratingAvg && product.ratingAvg > 0 ? product.ratingAvg : 4.9;
  const engagementCount = product.downloadCount > 0 ? product.downloadCount : product.viewCount;

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
      className="group flex flex-col bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(27,86,184,0.10)] hover:border-[#1B56B8]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B56B8] cursor-pointer text-left"
    >
      <div className="relative aspect-[4/3] w-full bg-[#F4F7FC] overflow-hidden border-b border-slate-100">
        <SafeImage
          src={product.thumbnailUrl}
          alt={product.title}
          fallbackLabel={product.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex-1 p-4 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          {/* Unboxed technical metadata (Zero-Pill Discipline) */}
          <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-medium text-slate-500">
            <span className="text-[#1B56B8] font-semibold">{product.category.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tech">{product.fileFormat}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tech">{product.fileSizeLabel}</span>
          </div>

          <h3 className="font-display text-[15px] font-bold text-[#142C48] leading-snug line-clamp-2 min-h-[2.6rem] group-hover:text-[#1B56B8] transition-colors">
            {product.title}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            <Building2 className="w-3.5 h-3.5 text-[#1B56B8]/70 shrink-0" />
            <span className="truncate">{product.seller.displayName}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 tabular-nums pt-0.5">
            <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
            <span className="font-bold text-[#142C48]">{ratingValue.toFixed(1)}</span>
            <span className="text-slate-400">
              ({formatNumberVi(engagementCount)} {product.downloadCount > 0 ? 'lượt tải' : 'lượt xem'})
            </span>
          </div>
        </div>

        <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
          <div className="flex items-baseline gap-2 min-h-[1.5rem]">
            <span
              className={`text-base font-extrabold tabular-nums ${
                pricing.effectivePriceVnd === 0 ? 'text-emerald-700' : 'text-[#DC2626]'
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

          <div className="w-full py-2.5 px-4 rounded-xl bg-[#1B56B8] group-hover:bg-[#154698] text-white text-xs font-bold text-center transition-colors">
            {pricing.effectivePriceVnd === 0 ? 'Xem & Tải miễn phí' : 'Xem chi tiết & Tải'}
          </div>
        </div>
      </div>
    </article>
  );
}
