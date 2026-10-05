// FIRST import, for side effects only: it starts Sentry before the rest of
// the application is evaluated. ES imports are hoisted, so calling the
// initialiser further down this file would run it AFTER every module below
// had already been evaluated. See lib/bootObservability.js.
import "./lib/bootObservability";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SupportProvider } from "./context/SupportContext";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Outside the router and both providers: an error thrown while any of
        them initialises would otherwise reach nothing and leave a blank
        page. This is the last line of defence, so it sits above everything
        it protects. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          {/* Above the router, not inside the inbox page: the sidebar's
              unread badge has to stay live on every screen, which a socket
              scoped to one page could never do. */}
          <SupportProvider>
            <App />
          </SupportProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
