import { Component } from "react";
import { reportError } from "../lib/observability";
import AdminCrash from "./AdminCrash";

// A plain React error boundary.
//
// Not Sentry.ErrorBoundary, because using that component would require
// importing @sentry/react statically - putting the whole SDK into the main
// chunk, which is exactly what lib/observability.js loads it dynamically to
// avoid. An error boundary is fifteen lines of React, so the boundary is
// local and always available, and only the REPORTING degrades to a no-op
// when the SDK is absent or still loading.
//
// Catches errors thrown during render, in lifecycle methods and in
// constructors below it. Does NOT catch errors in event handlers, promises or
// timers - those never pass through React's rendering and are picked up by
// the global handlers Sentry installs at init.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    // Only a flag. The error is reported in componentDidCatch and
    // deliberately not held in state, which would invite a future change
    // that renders it on screen.
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // componentStack names components rather than carrying data, so it is
    // safe to send and is the most useful thing for locating the failure.
    reportError(error, { componentStack: info && info.componentStack });
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return <AdminCrash onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
