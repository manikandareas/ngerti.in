// Fixed structural gate. Never return field values, titles, or callback URLs.
(() => {
  const visible = e => e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) &&
    e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const sensitive = d => {
    if (/[?&#](access_token|refresh_token|id_token|token|code|secret|password)=/i.test(d.URL))
      return true;
    for (const e of d.querySelectorAll('*')) {
      if (!visible(e)) continue;
      if (e.href && /[?&#](access_token|refresh_token|id_token|token|code|secret|password)=/i.test(e.href))
        return true;
      if (e.tagName === 'IFRAME' || e.tagName === 'FRAME') {
        // A loading frame can still expose an about:blank document before its
        // cross-origin content arrives. Require takeover for visible frames.
        return true;
      }
      if (['password','file'].includes(e.type) ||
          /password|one-time-code|cc-number|cc-csc|otp|token|secret/i.test(
            [e.autocomplete,e.name,e.id,e.getAttribute('aria-label')].join(' '))) return true;
      if (e.shadowRoot && e.shadowRoot.querySelector('input,textarea,iframe,[contenteditable]'))
        return true;
    }
    return false;
  };
  return {private:sensitive(document), focused:document.hasFocus(),
    ready:!!document.body && document.readyState !== 'loading'};
})()
