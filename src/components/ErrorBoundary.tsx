import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('THƯ VIỆN SIS UI ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-700">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-xl font-extrabold text-[#142C48] mt-4">
              Đã xảy ra lỗi hiển thị ngoài ý muốn
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Trang hiện tại gặp sự cố tạm thời. Dữ liệu tài khoản, ví VND và bản vẽ của bạn vẫn an toàn.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="w-4 h-4" />
                Tải lại trang
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = '/';
                }}
              >
                <Home className="w-4 h-4" />
                Về trang chủ
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
