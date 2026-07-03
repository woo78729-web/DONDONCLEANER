import { Component } from 'react';

export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info);
  }

  render() {
    const { error } = this.state;
    const { title = '頁面載入失敗', children } = this.props;

    if (error) {
      return (
        <div className="page-error-boundary">
          <div className="card page-error-boundary__card">
            <h2 className="card-title">{title}</h2>
            <p className="hint">此頁面發生錯誤，請重新整理後再試。若問題持續，請聯絡管理員。</p>
            <pre className="page-error-boundary__message">{error.message}</pre>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => window.location.reload()}
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
