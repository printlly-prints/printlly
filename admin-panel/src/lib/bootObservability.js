// Imported as the FIRST import in main.jsx, for side effects only.
//
// ES module imports are HOISTED: every import in a module is evaluated before
// any statement in that module's body runs, so calling initSentry() beneath
// the imports would start it only after App.jsx and both context providers had
// already been evaluated - and a module that throws at evaluation time would
// never be reported.
//
// A side-effect import IS evaluated in source order, so placing this one first
// genuinely starts Sentry before the rest of the application loads. The
// browser counterpart of the backend's instrument.js.
//
// A no-op when VITE_SENTRY_DSN is unset - see observability.js.
import { initSentry } from "./observability";

initSentry();
