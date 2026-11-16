import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register' | 'forgot';
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({
  open,
  initialMode = 'login',
  onOpenChange,
}: AuthModalProps) {
  const { loginWithCredentials, registerAccount, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [open, initialMode]);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Forgot password field
  const [forgotEmail, setForgotEmail] = useState('');

  const resetMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await loginWithCredentials(identifier, password);
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng nhập thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await registerAccount({ fullName, email, phone, password: regPassword });
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể đăng ký tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      setSuccessMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể gửi yêu cầu.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    resetMessages();
    setSubmitting(true);
    try {
      await loginWithGoogle();
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng nhập Google không thành công.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(val) => {
        resetMessages();
        onOpenChange(val);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#142C48]/50 backdrop-blur-xs" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl border border-slate-200 focus:outline-none">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <Dialog.Title className="font-display text-xl font-bold text-[#142C48]">
                {mode === 'login'
                  ? 'Đăng nhập THƯ VIỆN SIS'
                  : mode === 'register'
                  ? 'Đăng ký tài khoản mới'
                  : 'Khôi phục mật khẩu'}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Truy cập kho bản vẽ kỹ thuật, giá ưu đãi riêng và lịch sử tải.'
                  : mode === 'register'
                  ? 'Tạo tài khoản bằng email và số điện thoại chính xác.'
                  : 'Nhập email đã đăng ký để nhận hướng dẫn đặt lại mật khẩu.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#142C48] hover:bg-[#F5F7FA] cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {mode !== 'forgot' && (
            <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] rounded-lg mb-5">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setMode('login');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-[#142C48] shadow-xs'
                    : 'text-slate-600 hover:text-[#142C48]'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setMode('register');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-[#142C48] shadow-xs'
                    : 'text-slate-600 hover:text-[#142C48]'
                }`}
              >
                Đăng ký
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
              {successMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Email hoặc Số điện thoại
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="vd: kts.minh@congty.vn hoặc 0901234567"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#142C48]">Mật khẩu</label>
                  <button
                    type="button"
                    onClick={() => {
                      resetMessages();
                      setMode('forgot');
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-[#142C48] cursor-pointer"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Đang xác thực...' : 'Đăng nhập'}
              </Button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Họ và tên
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn An"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domain.com"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901234567"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1">
                  Mật khẩu (tối thiểu 8 ký tự)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Đang khởi tạo tài khoản...' : 'Tạo tài khoản'}
              </Button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#142C48] mb-1.5">
                  Email đã đăng ký
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="email@domain.com"
                  className="w-full h-10 px-3.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#142C48]"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu đặt lại mật khẩu'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  setMode('login');
                }}
                className="w-full text-xs font-semibold text-slate-600 hover:text-[#142C48] py-1 cursor-pointer"
              >
                Quay lại đăng nhập
              </button>
            </form>
          )}

          {mode !== 'forgot' && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2.5 text-slate-400">Hoặc tiếp tục với</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={submitting}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Đăng nhập nhanh bằng Google
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
