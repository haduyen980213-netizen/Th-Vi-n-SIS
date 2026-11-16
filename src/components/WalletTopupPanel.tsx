import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { formatDateVi, formatVnd } from '../lib/format';
import type {
  ReceivingBankInfo,
  TopupOrderRecord,
  WalletSummary,
  WalletTransactionRecord,
} from '../types/sis';
import { Button } from './ui/button';

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000, 2000000];

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ chuyển khoản',
  PAID: 'Đã cộng ví',
  UNDERPAID: 'Chuyển thiếu — Chờ đối soát',
  OVERPAID: 'Chuyển dư — Đã cộng ví',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã hủy',
};

export function WalletTopupPanel() {
  const { refreshMe } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [bankInfo, setBankInfo] = useState<ReceivingBankInfo | null>(null);
  const [topups, setTopups] = useState<TopupOrderRecord[]>([]);
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [amountInput, setAmountInput] = useState<number>(200000);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeOrder, setActiveOrder] = useState<TopupOrderRecord | null>(null);
  const [qrSvg, setQrSvg] = useState('');
  const [copiedField, setCopiedField] = useState<string>('');
  const [checkingStatus, setCheckingStatus] = useState(false);

  const loadWalletData = useCallback(async () => {
    try {
      const [walletRes, topupsRes, txRes] = await Promise.all([
        apiRequest<{ wallet: WalletSummary; receivingBank: ReceivingBankInfo }>('/wallet'),
        apiRequest<TopupOrderRecord[]>('/payments/topups'),
        apiRequest<WalletTransactionRecord[]>('/wallet/transactions'),
      ]);
      setWallet(walletRes.wallet);
      setBankInfo(walletRes.receivingBank);
      setTopups(topupsRes);
      setTransactions(txRes);

      const latestPending = topupsRes.find((t) => t.status === 'PENDING');
      setActiveOrder((prev) => {
        if (prev) {
          const updated = topupsRes.find((t) => t.topupCode === prev.topupCode);
          if (updated) return updated;
        }
        return latestPending || null;
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải dữ liệu ví.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWalletData();
  }, [loadWalletData]);

  // Render crisp inline SVG QR code whenever activeOrder changes
  useEffect(() => {
    if (!activeOrder?.qrPayloadUrl) {
      setQrSvg('');
      return;
    }
    QRCode.toString(activeOrder.qrPayloadUrl, {
      type: 'svg',
      width: 240,
      margin: 2,
      color: {
        dark: '#142C48',
        light: '#FFFFFF',
      },
    })
      .then((svg) => setQrSvg(svg))
      .catch(() => setQrSvg(''));
  }, [activeOrder?.qrPayloadUrl]);

  // Poll pending order every 5 seconds to catch automatic webhook confirmation
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'PENDING') return;
    const timer = window.setInterval(async () => {
      try {
        const fresh = await apiRequest<TopupOrderRecord>(
          `/payments/topups/${activeOrder.topupCode}`
        );
        if (fresh.status !== 'PENDING') {
          setActiveOrder(fresh);
          await loadWalletData();
          await refreshMe();
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeOrder, loadWalletData, refreshMe]);

  const handleCreateTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!Number.isInteger(amountInput) || amountInput < 10000) {
      setErrorMsg('Số tiền nạp tối thiểu 10.000 ₫.');
      return;
    }
    setCreating(true);
    try {
      const res = await apiRequest<{ order: TopupOrderRecord; bank: ReceivingBankInfo }>(
        '/payments/topups',
        {
          method: 'POST',
          body: JSON.stringify({ amountVnd: amountInput }),
        }
      );
      setBankInfo(res.bank);
      setActiveOrder(res.order);
      await loadWalletData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tạo mã nạp QR.');
    } finally {
      setCreating(false);
    }
  };

  const handleManualCheck = async () => {
    if (!activeOrder) return;
    setCheckingStatus(true);
    try {
      await loadWalletData();
      await refreshMe();
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCancelOrder = async (topupCode: string) => {
    try {
      await apiRequest(`/payments/topups/${topupCode}/cancel`, { method: 'POST' });
      await loadWalletData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể hủy yêu cầu.');
    }
  };

  const copyValue = (key: string, val: string) => {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1800);
  };

  if (loading) {
    return <div className="h-64 rounded-xl bg-[#F5F7FA] animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      {/* Wallet Summary Metrics */}
      <div>
        <h1 className="font-display text-xl font-bold text-[#142C48]">
          Ví nội bộ VND &amp; Nạp tiền nhanh VietQR SHB
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Số dư ghi nhận trên sổ cái bất biến PostgreSQL. Hệ thống tự động cộng ví khi nhận được giao dịch khớp mã nạp.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <div className="p-4 rounded-xl border border-slate-200 bg-[#F5F7FA]">
            <div className="text-xs font-medium text-slate-500">Số dư khả dụng</div>
            <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-1">
              {formatVnd(wallet?.availableBalanceVnd ?? 0)}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-[#F5F7FA]">
            <div className="text-xs font-medium text-slate-500">Đang chờ đối soát</div>
            <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-1">
              {formatVnd(wallet?.pendingBalanceVnd ?? 0)}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-[#F5F7FA]">
            <div className="text-xs font-medium text-slate-500">Tổng đã nạp</div>
            <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-1">
              {formatVnd(wallet?.totalDepositedVnd ?? 0)}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-[#F5F7FA]">
            <div className="text-xs font-medium text-slate-500">Tổng đã chi tiêu</div>
            <div className="text-xl font-extrabold text-[#142C48] tabular-nums mt-1">
              {formatVnd(wallet?.totalSpentVnd ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Quick SHB Topup Creator + Live QR View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-200">
        {/* Left: Amount Picker */}
        <form onSubmit={handleCreateTopup} className="lg:col-span-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#142C48]">
              1. Tạo yêu cầu nạp tiền nhanh
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Tài khoản nhận: {bankInfo?.bankCode || 'SHB'} · STK{' '}
              <span className="font-mono-tech font-bold text-[#142C48]">
                {bankInfo?.accountNumber || '0946265256'}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmountInput(amt)}
                className={`py-2.5 px-3 rounded-lg border text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                  amountInput === amt
                    ? 'border-[#142C48] bg-[#142C48] text-white'
                    : 'border-slate-200 bg-white text-[#142C48] hover:bg-[#F5F7FA]'
                }`}
              >
                {new Intl.NumberFormat('vi-VN').format(amt)} ₫
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
              Hoặc nhập số tiền khác (VND)
            </label>
            <input
              type="number"
              min={10000}
              step={1000}
              required
              value={amountInput}
              onChange={(e) => setAmountInput(Number(e.target.value))}
              className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm font-mono-tech font-semibold focus:outline-none focus:ring-2 focus:ring-[#142C48]"
            />
          </div>

          <Button type="submit" variant="gold" className="w-full font-bold" disabled={creating}>
            {creating ? 'Đang tạo mã VietQR...' : 'Tạo mã QR nạp tiền SHB'}
          </Button>
        </form>

        {/* Right: Active VietQR Code & Transfer Details */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-[#F5F7FA] p-5">
          {!activeOrder ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8 space-y-2">
              <div className="text-sm font-bold text-[#142C48]">
                Chưa có mã QR đang chờ thanh toán
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Chọn số tiền bên trái và nhấn Tạo mã QR nạp tiền SHB để nhận mã VietQR kèm nội dung chuyển khoản tự động.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
              <div className="sm:col-span-5 flex flex-col items-center bg-white p-4 rounded-xl border border-slate-200">
                {qrSvg ? (
                  <div
                    className="w-48 h-48 [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                    aria-label={`Mã VietQR SHB cho giao dịch ${activeOrder.topupCode}`}
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                    Đang dựng mã QR...
                  </div>
                )}
                <div className="text-[11px] font-semibold text-[#142C48] mt-2 text-center">
                  Quét bằng App Ngân hàng bất kỳ (NAPAS 247)
                </div>
              </div>

              <div className="sm:col-span-7 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <span className="font-bold text-[#142C48] text-sm">
                    {bankInfo?.bankName || 'Ngân hàng SHB'}
                  </span>
                  <span
                    className={`font-semibold ${
                      activeOrder.status === 'PAID'
                        ? 'text-emerald-700'
                        : activeOrder.status === 'PENDING'
                        ? 'text-amber-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {STATUS_LABEL[activeOrder.status] || activeOrder.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Số tài khoản SHB</span>
                  <button
                    type="button"
                    onClick={() =>
                      copyValue('stk', bankInfo?.accountNumber || '0946265256')
                    }
                    className="inline-flex items-center gap-1.5 font-mono-tech font-bold text-sm text-[#142C48] hover:underline cursor-pointer"
                  >
                    {bankInfo?.accountNumber || '0946265256'}
                    {copiedField === 'stk' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Chủ tài khoản</span>
                  <span className="font-semibold text-[#142C48]">
                    {bankInfo?.accountName || 'THU VIEN SIS'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Số tiền cần chuyển</span>
                  <button
                    type="button"
                    onClick={() =>
                      copyValue('amt', String(activeOrder.requestedAmountVnd))
                    }
                    className="inline-flex items-center gap-1.5 font-mono-tech font-bold text-sm text-[#142C48] hover:underline cursor-pointer"
                  >
                    {formatVnd(activeOrder.requestedAmountVnd)}
                    {copiedField === 'amt' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      Nội dung chuyển khoản (bắt buộc)
                    </div>
                    <div className="font-mono-tech font-bold text-sm text-[#142C48]">
                      {activeOrder.topupCode}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyValue('code', activeOrder.topupCode)}
                  >
                    {copiedField === 'code' ? 'Đã chép' : 'Sao chép'}
                  </Button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleManualCheck}
                    disabled={checkingStatus}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`}
                    />
                    Kiểm tra trạng thái
                  </Button>
                  {activeOrder.status === 'PENDING' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelOrder(activeOrder.topupCode)}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Hủy mã nạp
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Topup Requests History */}
      <div className="pt-6 border-t border-slate-200 space-y-3">
        <h2 className="font-display text-base font-bold text-[#142C48]">
          Yêu cầu nạp tiền gần đây
        </h2>
        {topups.length === 0 ? (
          <p className="text-xs text-slate-500">Chưa có yêu cầu nạp tiền nào.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã nạp</th>
                  <th className="py-2.5 px-3 font-semibold">STK nhận</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số tiền yêu cầu</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topups.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F5F7FA]/60">
                    <td className="py-2.5 px-3 font-mono-tech font-semibold text-[#142C48]">
                      {t.topupCode}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tech text-slate-600">
                      SHB · {t.bankAccountNumber || '0946265256'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#142C48]">
                      {formatVnd(t.requestedAmountVnd)}
                    </td>
                    <td className="py-2.5 px-3 font-medium">
                      {STATUS_LABEL[t.status] || t.status}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-500">
                      {formatDateVi(t.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveOrder(t)}
                        className="text-xs font-semibold text-[#142C48] hover:underline cursor-pointer"
                      >
                        Xem QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Immutable Wallet Ledger */}
      <div className="pt-6 border-t border-slate-200 space-y-3">
        <h2 className="font-display text-base font-bold text-[#142C48]">
          Sổ cái giao dịch ví (Bất biến)
        </h2>
        {transactions.length === 0 ? (
          <p className="text-xs text-slate-500">
            Chưa phát sinh giao dịch cộng hoặc trừ số dư nào.
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F7FA] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Mã GD</th>
                  <th className="py-2.5 px-3 font-semibold">Loại</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Biến động</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Số dư sau GD</th>
                  <th className="py-2.5 px-3 font-semibold">Nội dung</th>
                  <th className="py-2.5 px-3 font-semibold">Ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 px-3 font-mono-tech font-semibold text-[#142C48]">
                      {tx.txCode}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{tx.txType}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                        tx.direction === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tx.direction === 'CREDIT' ? '+' : '-'}
                      {formatVnd(tx.amountVnd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#142C48]">
                      {formatVnd(tx.balanceAfterVnd)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{tx.description}</td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-500">
                      {formatDateVi(tx.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
