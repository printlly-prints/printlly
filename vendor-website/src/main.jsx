// FIRST import, for side effects only: it starts Sentry and PostHog before
// the rest of the application is evaluated. ES imports are hoisted, so
// calling the initialisers further down this file would run them AFTER every
// module below had already been evaluated. See lib/bootObservability.js.
import "./lib/bootObservability";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { SoundProvider } from "./context/SoundContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";
import "./styles/paper.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Outside the router and the auth provider on purpose: a render error
        thrown while either of those is initialising would otherwise take the
        whole page to a blank white screen with nothing reported. This is the
        last line of defence, so it has to sit above everything it protects. */}
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <SoundProvider><App /></SoundProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
