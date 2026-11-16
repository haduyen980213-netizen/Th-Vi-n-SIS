import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { formatDateVi, formatNumberVi, formatVnd } from '../../lib/format';
import type {
  AdminAnalyticsReport,
  AdminLogRecord,
  AuditLogRecord,
} from '../../types/sis';
import { Button } from '../ui/button';

export function AdminAnalyticsAndLogsTab() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [report, setReport] = useState<AdminAnalyticsReport | null>(null);
  const [adminLogs, setAdminLogs] = useState<AdminLogRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [logView, setLogView] = useState<'admin' | 'audit'>('admin');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [analyticsRes, logsRes] = await Promise.all([
        apiRequest<AdminAnalyticsReport>('/admin/analytics'),
        apiRequest<{ adminLogs: AdminLogRecord[]; auditLogs: AuditLogRecord[] }>(
          '/admin/audit-logs'
        ),
      ]);
      setReport(analyticsRes);
      setAdminLogs(logsRes.adminLogs);
      setAuditLogs(logsRes.auditLogs);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải báo cáo và nhật ký kiểm toán.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#F5F7FA] animate-pulse" />;
  }

  if (errorMsg) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
        {errorMsg}
      </div>
    );
  }

  const s = report?.summary;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#142C48]">
            Báo cáo Vận hành &amp; Doanh thu thực tế
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng hợp trực tiếp từ cơ sở dữ liệu đơn hàng, nạp tiền VietQR SHB và sổ hoa hồng.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={loadData}>
          <RefreshCw className="w-3.5 h-3.5" />
          Làm mới
        </Button>
      </div>

      {/* Real KPI Grid */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
            <div className="text-xs text-slate-500">Tổng giá trị đơn hàng (GMV)</div>
            <div className="text-lg font-extrabold text-[#142C48] tabular-nums">
              {formatVnd(s.totalGmvVnd)}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {formatNumberVi(s.completedOrders)} đơn hoàn tất
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
            <div className="text-xs text-slate-500">Doanh thu phí sàn (30%)</div>
            <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
              {formatVnd(s.platformFeeVnd)}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              Người bán: {formatVnd(s.sellerNetTotalVnd)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
            <div className="text-xs text-slate-500">Tổng nạp ví SHB thành công</div>
            <div className="text-lg font-extrabold text-[#142C48] tabular-nums">
              {formatVnd(s.totalTopupPaidVnd)}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {formatNumberVi(s.paidTopupCount)} giao dịch nạp PAID
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-4 space-y-1">
            <div className="text-xs text-slate-500">Quy mô thành viên &amp; kho bản vẽ</div>
            <div className="text-lg font-extrabold text-[#142C48] tabular-nums">
              {formatNumberVi(s.totalUsers)} tài khoản · {formatNumberVi(s.approvedProducts)} hồ sơ
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {s.totalSellers} gian hàng · {s.pendingProducts} chờ duyệt · {s.openTickets} hỗ trợ mở
            </div>
          </div>
        </div>
      )}

      {/* Daily Revenue & Top Drawings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#142C48]">
            Doanh số 14 ngày gần nhất
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Ngày</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số đơn</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Tổng thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!report?.dailySales.length ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      Chưa phát sinh đơn hàng trong 14 ngày gần đây.
                    </td>
                  </tr>
                ) : (
                  report.dailySales.map((d) => (
                    <tr key={d.day}>
                      <td className="py-2 px-3 font-mono-tech text-[#142C48]">{d.day}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{d.orderCount}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-[#142C48]">
                        {formatVnd(d.revenueVnd)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#142C48]">
            Hồ sơ bản vẽ phát hành nổi bật
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã &amp; Tên bản vẽ</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Giá niêm yết</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Mua</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Tải</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Xem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report?.topProducts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-3">
                      <div className="font-mono-tech font-bold text-[#142C48]">{p.code}</div>
                      <div className="text-slate-700 line-clamp-1 max-w-xs">{p.title}</div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">
                      {p.isFree ? 'Miễn phí' : formatVnd(p.listedPriceVnd)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-bold text-[#142C48]">
                      {p.purchaseCount}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{p.downloadCount}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">
                      {p.viewCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Audit & Admin Logs */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-[#142C48]">
              Nhật ký Quản trị &amp; Kiểm toán Hệ thống
            </h3>
            <p className="text-xs text-slate-500">
              Lưu vết bất biến mọi thao tác duyệt bài, đổi quyền, đối soát nạp tiền và giao dịch ví.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setLogView('admin')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                logView === 'admin'
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              Thao tác Quản trị ({adminLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setLogView('audit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                logView === 'audit'
                  ? 'bg-white text-[#142C48] shadow-xs'
                  : 'text-slate-600 hover:text-[#142C48]'
              }`}
            >
              Kiểm toán Hệ thống ({auditLogs.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          {logView === 'admin' ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                  <th className="py-2.5 px-3 font-semibold">Quản trị viên</th>
                  <th className="py-2.5 px-3 font-semibold">Hành động</th>
                  <th className="py-2.5 px-3 font-semibold">Đối tượng</th>
                  <th className="py-2.5 px-3 font-semibold">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adminLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Chưa có nhật ký thao tác quản trị nào.
                    </td>
                  </tr>
                ) : (
                  adminLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDateVi(l.createdAt)}
                      </td>
                      <td className="py-2 px-3 font-medium text-[#142C48]">{l.actorEmail}</td>
                      <td className="py-2 px-3 font-mono-tech font-semibold text-[#142C48]">
                        {l.action}
                      </td>
                      <td className="py-2 px-3 font-mono-tech text-slate-600">
                        {l.targetType} #{l.targetId || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono-tech text-[11px] text-slate-500 max-w-md truncate">
                        {l.detailsJson ? JSON.stringify(l.detailsJson) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                  <th className="py-2.5 px-3 font-semibold">Tài khoản thực hiện</th>
                  <th className="py-2.5 px-3 font-semibold">Hành động</th>
                  <th className="py-2.5 px-3 font-semibold">Thực thể</th>
                  <th className="py-2.5 px-3 font-semibold">Dữ liệu ghi nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Chưa có nhật ký kiểm toán nào.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDateVi(l.createdAt)}
                      </td>
                      <td className="py-2 px-3 font-medium text-[#142C48]">
                        {l.actorEmail || 'Hệ thống'}
                      </td>
                      <td className="py-2 px-3 font-mono-tech font-semibold text-[#142C48]">
                        {l.action}
                      </td>
                      <td className="py-2 px-3 font-mono-tech text-slate-600">
                        {l.entityType} #{l.entityId}
                      </td>
                      <td className="py-2 px-3 font-mono-tech text-[11px] text-slate-500 max-w-md truncate">
                        {l.afterJson ? JSON.stringify(l.afterJson) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
