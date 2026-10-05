// Imported as the FIRST import in main.jsx, for side effects only.
//
// WHY THIS FILE EXISTS, rather than just calling initSentry() in main.jsx:
//
// ES module imports are HOISTED. Every `import` in a module is resolved and
// evaluated before any statement in that module's body runs - so
// initSentry() written underneath the imports would execute after App.jsx,
// AuthContext.jsx and everything they pull in had already been evaluated. A
// module that throws at evaluation time would never be reported.
//
// A side-effect import is evaluated in source order, so putting this one
// first genuinely does start Sentry before the rest of the application is
// loaded. It is the browser equivalent of the backend's instrument.js, and it
// exists for the same reason: a reporter that starts too late looks installed
// and is partly blind.
//
// Both calls are no-ops when their keys are unset - see observability.js.
import { initSentry, initAnalytics } from "./observability";

initSentry();
initAnalytics();
