// Fixed application code. Export bounded non-secret effect previews only.
(e => {
  if (!e) return {};
  e = e.closest('a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"]') || e;
  const label = e => (e.getAttribute('aria-label') ||
    [...(e.labels || [])].map(l => l.textContent).join(' ') ||
    (['submit','button'].includes(e.type) && e.tagName === 'INPUT' ? e.value : '') ||
    (['BUTTON','A','SUMMARY'].includes(e.tagName) || e.getAttribute('role') === 'button'
      ? e.textContent : '') || e.getAttribute('placeholder') || e.getAttribute('title') || '').slice(0,300);
  const isSearch = e => e.type === 'search' || e.getAttribute('role') === 'searchbox' ||
    /^(q|query|search|search_query|keyword|keywords|cari|pencarian)$/i.test(e.name || e.id || '') ||
    /^(search|cari|telusuri|pencarian)(\b|\s)/i.test(label(e));
  const form = e.form || e.closest('form');
  const fields = form ? [...form.elements].slice(0,50) : [];
  const privateField = x => x.type !== 'hidden' && (['password','file'].includes(x.type) ||
    /password|one-time-code|cc-number|cc-csc|otp|token|secret/i.test(
      [x.autocomplete,x.name,x.id,x.getAttribute('aria-label')].join(' ')));
  const privateTarget = e.tagName === 'IFRAME' || privateField(e) || fields.some(privateField);
  const preview = privateTarget ? [] : fields.filter(x =>
    ['text','email','url','number','textarea','select-one'].includes(x.type) &&
    x.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))
    .slice(0,12).map(x => ({label:label(x)||x.name||x.id,value:String(x.value||'').slice(0,2000)}));
  return {
    browser_error:location.protocol==='chrome-error:',
    tag:e.tagName,role:e.getAttribute('role') || '',type:e.type || '',
    name:e.name || '',id:e.id || '',label:label(e),
    href:e.closest('a[href]')?.href || '',download:!!e.closest('a[download]'),
    private:privateTarget, preview,
    editable_rich:e.isContentEditable,
    search:isSearch(e),
    disclosure:e.hasAttribute('aria-expanded') || ['menu','listbox'].includes(e.getAttribute('aria-haspopup')),
    form:form ? {method:form.method,action:form.action,
      search:form.getAttribute('role') === 'search' || (form.method === 'get' && fields.some(isSearch)),
      fields:fields.map(x => [x.name,x.id,label(x)].join(' ').slice(0,350))} : null
  };
})
