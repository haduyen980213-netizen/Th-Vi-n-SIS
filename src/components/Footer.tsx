import type { AppRoute } from './Header';
import { SisLogo } from './SisLogo';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="bg-[#0F274D] text-white border-t border-[#1B3E78]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2 space-y-4">
            <div className="inline-flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl shadow-xs">
              <SisLogo />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed max-w-md">
              Sàn giao dịch bản vẽ kỹ thuật, hồ sơ thiết kế thi công, mô hình BIM 3D và tài liệu xây dựng
              chuyên nghiệp dành cho kiến trúc sư, kỹ sư và đơn vị thi công tại Việt Nam.
            </p>
            <p className="text-xs text-slate-400">
              Hỗ trợ kỹ thuật: hotro.thuviensis.vn@gmail.com · Tổng đài: 0889559997
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#F6C343] mb-4">Thư viện bản vẽ</h3>
            <ul className="space-y-2.5 text-sm text-slate-300">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', category: 'kien-truc' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Hồ sơ Kiến trúc &amp; Biệt thự
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', category: 'nha-pho' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Bản vẽ Nhà phố hiện đại
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', category: 'ket-cau' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Kết cấu &amp; Mô hình BIM
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', tag: 'free' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Tài nguyên miễn phí
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#F6C343] mb-4">Tài khoản &amp; Hệ thống</h3>
            <ul className="space-y-2.5 text-sm text-slate-300">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'catalog', tag: 'new' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Hồ sơ mới phát hành
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ name: 'support' })}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Trung tâm hỗ trợ
                </button>
              </li>
              <li>
                <a
                  href="/api/v1/docs.json"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Tài liệu OpenAPI v1
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <span>© 2026 THƯ VIỆN SIS — SIS Digital Library. Bảo lưu mọi quyền.</span>
          <span>Đơn vị tiền tệ giao dịch: VND</span>
        </div>
      </div>
    </footer>
  );
}
