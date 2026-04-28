import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center gap-2 p-4 text-sm text-destructive bg-destructive/5 rounded-bento-inner">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Something went wrong{this.state.error ? `: ${this.state.error.message}` : ""}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
