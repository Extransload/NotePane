// A Preferences card: a bordered group of settings with a title, a one-line description and
// rows split by hairlines.
export function PreferencesCard({ title, description, className = "", children }) {
  return (
    <section className={`preferences-card ${className}`.trim()} aria-label={title}>
      <header className="preferences-card-header">
        <h3 className="preferences-card-title">{title}</h3>
        {description && <p className="preferences-card-description">{description}</p>}
      </header>
      <div className="preferences-card-body">{children}</div>
    </section>
  );
}
