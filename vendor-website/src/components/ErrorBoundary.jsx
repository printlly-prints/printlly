import { Component } from "react";
import { reportError } from "../lib/observability";
import DashboardCrash from "./DashboardCrash";

// A plain React error boundary.
//
// WHY NOT Sentry.ErrorBoundary
//
// Using Sentry's component would mean importing @sentry/react statically in
// main.jsx, which would put the whole SDK back into the main chunk - the
// exact cost lib/observability.js loads it dynamically to avoid. This bundle
// also serves the public landing page and the legal pages, so that chunk is
// downloaded by people who are not vendors at all.
//
// An error boundary is about fifteen lines of React, and componentDidCatch is
// a perfectly good place to call reportError. So the boundary is local and
// synchronous - always available, no SDK required - and reporting is what
// degrades to a no-op when Sentry is absent or still loading.
//
// WHAT THIS CATCHES: errors thrown during render, in lifecycle methods, and
// in constructors of the tree below it. It does NOT catch errors in event
// handlers, in promises, or in setTimeout - those never pass through React's
// rendering, and are picked up by the global handlers Sentry installs at
// init instead. Between the two, both halves are covered.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    // Only a flag. The error itself is deliberately not held in state: it is
    // reported in componentDidCatch, and keeping it here invites a future
    // change that renders it to the vendor.
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // componentStack is the React tree path, which names components rather
    // than carrying any data - safe to send, and the single most useful thing
    // for locating the failure.
    reportError(error, { componentStack: info && info.componentStack });
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return <DashboardCrash onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
