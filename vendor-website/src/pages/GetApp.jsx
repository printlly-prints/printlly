import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

// The customer app isn't published yet - these are placeholders until
// real store listings exist (see .env.example). Vite only exposes
// VITE_-prefixed vars to client code, so that's the naming used here even
// though the task described them without the prefix.
const APP_DOWNLOAD_URL = import.meta.env.VITE_APP_DOWNLOAD_URL;
const GOOGLE_PLAY_URL = import.meta.env.VITE_GOOGLE_PLAY_URL;
const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL;

// "/auth/get-app" - there is no customer web login, only the mobile app.
// This page just points customers at it.
export default function GetApp() {
  // Falls back to this site's own URL rather than encoding "undefined"
  // into the QR code when the real download link isn't configured yet.
  const qrValue = APP_DOWNLOAD_URL || window.location.origin;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-heading font-bold text-2xl text-text-primary">Get the app</h1>

        <div className="mt-8 inline-flex bg-surface border border-border rounded-xl p-6">
          {/* qrcode.react takes literal colours, not Tailwind classes -
              these are the `surface` and `text-primary-bright` token values. */}
          <QRCodeSVG value={qrValue} size={200} bgColor="#FFFFFF" fgColor="#123326" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <StoreBadge href={GOOGLE_PLAY_URL} small="GET IT ON" big="Google Play" />
          <StoreBadge href={APP_STORE_URL} small="Download on the" big="App Store" />
        </div>

        <p className="mt-6 text-sm text-text-muted">
          Scan the QR code or tap a button to download the app and get started
        </p>

        <Link to="/auth" className="mt-8 inline-block text-sm text-text-muted hover:text-text-primary">
          ← Back
        </Link>
      </div>
    </div>
  );
}

// Renders as a disabled placeholder until a real store URL is set, rather
// than linking to "#" and silently doing nothing on click.
function StoreBadge({ href, small, big }) {
  const isConfigured = Boolean(href);
  const className =
    "block w-full max-w-[220px] px-4 py-2.5 rounded-lg bg-text-primary-bright text-white text-left";

  const content = (
    <>
      <span className="block text-[10px] uppercase tracking-wide opacity-80">{small}</span>
      <span className="block text-base font-semibold leading-tight">{big}</span>
    </>
  );

  if (!isConfigured) {
    return (
      <span className={`${className} opacity-40 cursor-not-allowed`} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} hover:opacity-90`}>
      {content}
    </a>
  );
}
