import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service here
    console.error("Global Error Boundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4 font-sans text-gray-800">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full text-center border border-red-100">
            <div className="text-6xl mb-6">⚠️</div>
            <h1 className="text-3xl font-bold mb-4 text-gray-900">Oops! Something went wrong.</h1>
            <p className="text-gray-600 mb-8">
              We encountered an unexpected error. Please try refreshing the page or navigating back.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-red-50 p-4 rounded-xl text-left border border-red-100 mb-8 max-h-48 overflow-auto">
                <p className="text-xs font-mono text-red-600 font-bold mb-2">Error Details:</p>
                <code className="text-[11px] text-red-700 whitespace-pre-wrap font-mono">
                  {this.state.error.toString()}
                  <br />
                  {this.state.errorInfo?.componentStack}
                </code>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-[#10AFA5] hover:bg-[#0e968e] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#10AFA5]/30 active:scale-95"
              >
                Refresh Page
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition-all active:scale-95"
              >
                Go to Homepage
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
