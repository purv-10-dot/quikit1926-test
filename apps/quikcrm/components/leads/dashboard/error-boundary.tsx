"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
}

export class LeadDashboardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[lead-dashboard]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="crm-card flex flex-col items-center p-8 text-center">
          <AlertTriangle className="mb-3 text-amber-500" size={32} />
          <h3 className="font-semibold text-crm-text">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </h3>
          <p className="mt-1 text-sm text-crm-muted">Try refreshing this section.</p>
          <Button className="mt-4" onClick={() => this.setState({ hasError: false })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
