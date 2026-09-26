import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState, Page } from "../ui";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing it (e.g. the route) clears the error, so navigating away recovers. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** A crash in a page shows a calm «refresh» screen instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Page>
        <ErrorState
          title="Что-то пошло не так"
          description="Обновите страницу. Если вы заполняли товар, несохранённый черновик восстановится."
          retryLabel="Обновить страницу"
          onRetry={() => window.location.reload()}
        />
      </Page>
    );
  }
}
