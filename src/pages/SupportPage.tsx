import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export function SupportPage() {
  const { user } = useAuth();
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [category, setCategory] = useState<'PAYMENT' | 'DOWNLOAD' | 'SELLER' | 'ACCOUNT' | 'OTHER'>('OTHER');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketResult, setTicketResult] = useState('');

  useEffect(() => {
    if (user) {
      setContactName(user.fullName);
      setContactEmail(user.email);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setTicketResult('');

    try {
      const res = await apiRequest<{ ticketCode: string; message: string }>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          contactName,
          contactEmail,
          category,
          subject,
          message,
        }),
      });
      setTicketResult(res.message);
      setSubject('');
      setMessage('');
    } catch (err: any) {
      setError(err?.message || 'Không thể gửi yêu cầu hỗ trợ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-[#142C48]">
              Trung tâm hỗ trợ THƯ VIỆN SIS
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Đội ngũ kỹ sư và quản trị viên sẵn sàng hỗ trợ về định dạng bản vẽ, thiết lập chính sách giá riêng cho doanh nghiệp, đối soát giao dịch và đăng ký người bán.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-[#F5F7FA] p-5 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-slate-500">Email hỗ trợ chính thức</div>
              <div className="font-semibold text-[#142C48] mt-0.5">hotro@thuviensis.vn</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Tổng đài kỹ thuật</div>
              <div className="font-mono-tech font-semibold text-[#142C48] mt-0.5">1900 6868</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Giờ làm việc</div>
              <div className="text-[#142C48] mt-0.5">Thứ 2 – Thứ 7 · 08:00 – 17:30</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-[#142C48] mb-5">
            Gửi phiếu yêu cầu hỗ trợ
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {ticketResult && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-800">
              {ticketResult}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Họ và tên
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Email liên hệ
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                Phân loại yêu cầu
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              >
                <option value="OTHER">Tư vấn bản vẽ &amp; Hồ sơ kỹ thuật</option>
                <option value="ACCOUNT">Tài khoản &amp; Chính sách giá riêng</option>
                <option value="PAYMENT">Nạp ví &amp; Thanh toán</option>
                <option value="DOWNLOAD">Tải tệp tin &amp; Phiên bản phần mềm</option>
                <option value="SELLER">Đăng ký Người bán (Marketplace)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                Tiêu đề
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Tóm tắt vấn đề cần hỗ trợ"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                Nội dung chi tiết
              </label>
              <textarea
                rows={4}
                required
                minLength={10}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ghi rõ mã bản vẽ (nếu có) hoặc mô tả yêu cầu của bạn..."
                className="w-full p-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
              />
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang gửi phiếu...' : 'Gửi yêu cầu hỗ trợ'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
