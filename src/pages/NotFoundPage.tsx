import { Compass, FileSearch, Home, LifeBuoy } from 'lucide-react';
import { AppRoute } from '../components/Header';
import { Button } from '../components/ui/button';

interface NotFoundPageProps {
  path: string;
  onNavigate: (route: AppRoute) => void;
}

export function NotFoundPage({ path, onNavigate }: NotFoundPageProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#142C48] text-[#F2C94C]">
          <Compass className="w-7 h-7" />
        </div>

        <div className="font-mono-tech text-xs font-semibold uppercase tracking-widest text-slate-500 mt-5">
          Mã lỗi 404 · Không tìm thấy đường dẫn
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#142C48] mt-2">
          Trang hoặc bản vẽ không tồn tại
        </h1>

        <p className="text-sm text-slate-600 mt-3 max-w-lg mx-auto leading-relaxed">
          Đường dẫn <span className="font-mono-tech text-[#142C48] font-semibold">{path}</span> không khả dụng hoặc đã được thay đổi. Vui lòng quay lại trang chủ hoặc tìm kiếm trong danh mục bản vẽ kỹ thuật.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => onNavigate({ name: 'home' })}>
            <Home className="w-4 h-4" />
            Về trang chủ
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate({ name: 'catalog' })}
          >
            <FileSearch className="w-4 h-4" />
            Khám phá danh mục
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onNavigate({ name: 'support' })}
          >
            <LifeBuoy className="w-4 h-4" />
            Trung tâm hỗ trợ
          </Button>
        </div>
      </div>
    </div>
  );
}
