// Runs before the app's bundle. A window that reloads paints, from the new page's first frame, the
// shell background, text colour and corners its page had on the way out (src/hooks/useReloadReveal.js
// stores them on pagehide), so it neither shows through nor flashes another colour while the app
// starts. index.html keeps the app hidden over that paint until useReloadReveal fades it in.
(() => {
  try {
    const paint = JSON.parse(window.sessionStorage.getItem("notepane.bootPaint") || "null");
    if (!paint || typeof paint.background !== "string") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--notepane-boot-background", paint.background);
    root.style.setProperty("--notepane-boot-foreground", paint.color || "currentColor");
    root.style.setProperty("--notepane-boot-radius", paint.radius || "0px");
    root.dataset.boot = "reload";
  } catch {
    // Without session storage a reload starts as a new window does.
  }
})();
