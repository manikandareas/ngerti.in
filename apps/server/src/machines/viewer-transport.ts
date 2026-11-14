/** The upstream viewer omits cookies; our same-origin gateway also requires its issuing device. */
export const viewerSessionScript = `(() => {
  const root = new URL('../', location.href).pathname;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin === location.origin && url.pathname.startsWith(root + 'cua.env.v1.')) {
      return original(input, {...init, credentials: 'same-origin'});
    }
    return original(input, init);
  };
})();`;
