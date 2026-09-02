import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full mx-4 p-8 bg-white rounded-2xl shadow-lg text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Terjadi Kesalahan</h2>
            <p className="text-sm text-gray-500 mb-6">
              Halaman ini mengalami error yang tidak terduga. Silakan muat ulang aplikasi.
            </p>
            {this.state.error && (
              <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded p-2 mb-6 text-left break-all">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ background: '#384959' }}
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
