import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Vendor App Error:', error, errorInfo);
    const isChunkLoadError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed');

    if (isChunkLoadError) {
      const hasReloaded = sessionStorage.getItem('chunk_load_reloaded');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_load_reloaded', 'true');
        window.location.reload();
        return;
      }
    }

    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Unexpected rendering error';
      return (
        <div className="flex items-center justify-center min-h-screen bg-white p-6">
          <div className="flex flex-col items-center gap-4 max-w-md mx-auto text-center">
            <img src="/logo/WBILogo.jpg" alt="WBI" className="w-16 h-16 rounded-2xl shadow" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h2 className="text-2xl font-bold text-gray-800">Vendor Portal failed to load</h2>
            <p className="text-gray-600 text-sm">
              Please refresh. If this keeps happening, clear site cache and try again.
            </p>
            <p className="text-xs text-gray-400 break-all">{message}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('chunk_load_reloaded');
                  window.location.reload();
                }}
                className="px-6 py-3 rounded-xl font-semibold text-white"
                style={{ background: '#0D8A72' }}
              >
                Refresh Page
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    ['vendorAccessToken', 'vendorRefreshToken', 'vendorData'].forEach((k) => {
                      localStorage.removeItem(k);
                      sessionStorage.removeItem(k);
                    });
                  } catch { /* ignore */ }
                  window.location.href = '/vendor/login';
                }}
                className="px-6 py-3 rounded-xl font-semibold border border-gray-300 text-gray-700"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
