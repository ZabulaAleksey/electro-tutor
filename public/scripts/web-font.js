(() => {
  const selector = "link[data-web-font-stylesheet]";

  const enableWebFontStylesheet = () => {
    const stylesheet = document.querySelector(selector);
    if (!(stylesheet instanceof HTMLLinkElement)) return;

    const enable = () => stylesheet.setAttribute("media", "all");
    if (stylesheet.sheet) {
      enable();
      return;
    }

    stylesheet.addEventListener("load", enable, { once: true });
  };

  enableWebFontStylesheet();
  document.addEventListener("astro:page-load", enableWebFontStylesheet);
})();
