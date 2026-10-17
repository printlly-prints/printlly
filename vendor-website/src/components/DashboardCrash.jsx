import tokens from "../../../shared/design-tokens.json";

/** Last-resort boundary also works before Router/Auth/Theme can mount. */
export default function DashboardCrash({ onRetry }) {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const colors = Object.fromEntries(Object.entries(tokens.colors[theme]).map(([name, value]) => [`--color-${name}`, value]));
  return <div className="public-shell" style={colors}><main className="public-content recovery-page">
    <section className="mascot-recovery">
      <div className="mascot-recovery-heading"><picture className="mascot-recovery-art" aria-hidden="true"><source media="(min-width: 768px)" srcSet="/mascot-reactions/desktop/service_unavailable.png" /><img src="/mascot-reactions/service_unavailable.png" alt="" width="96" height="96" /></picture><div><h1>This screen couldn’t open.</h1><p>Printlly ran into a problem. Try opening this screen again.</p></div></div>
      <div className="mascot-recovery-actions"><button type="button" className="paper-button paper-button--primary" onClick={onRetry}>Try again</button><a href="/help" className="paper-button paper-button--secondary">Get help</a></div>
    </section>
  </main></div>;
}
