import React from 'react';
import { captureAppError } from '../lib/instrumentation';

export default class InstrumentationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureAppError(error, {
      route: window.__readxivCurrentRoute || null,
      source: 'react_error_boundary',
      componentStack: info?.componentStack || null,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
          <div className="max-w-xl rounded-lg border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold mb-2">ReadXiv hit a render error</h1>
            <p className="text-sm text-muted mb-4">
              The error was logged locally. Reload the page after the fix is applied.
            </p>
            <pre className="max-h-48 overflow-auto rounded bg-background p-3 text-xs text-red-300">
              {this.state.error?.message || String(this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
