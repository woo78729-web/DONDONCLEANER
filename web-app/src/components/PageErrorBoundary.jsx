import { Component } from 'react';
import { clearChunkReload } from '../utils/lazyRetry';

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

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
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
            <pre className="page-error-boundary__message">{error.message || String(error)}</pre>
            <button
              type="button"
              className="btn btn-primary btn-pill"
              onClick={() => this.setState({ error: null })}
            >
              返回頁面
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-pill"
              onClick={() => {
                clearChunkReload();
                window.location.reload();
              }}
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
