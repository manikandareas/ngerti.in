/** Reserve user activation before awaiting a server-owned authorization URL. */
export function reserveAuthorizationBrowser() {
  if (window.ngertiinDesktop?.openExternal) {
    const desktop = window.ngertiinDesktop;
    return {
      async open(url: string) {
        try {
          await desktop.openExternal?.(url);
          return true;
        } catch {
          return false;
        }
      },
      cancel() {},
    };
  }
  let page: Window | null = null;
  let navigated = false;
  let cancelled = false;
  try {
    page = window.open("", "_blank");
    if (page) page.opener = null;
  } catch {
    page?.close();
  }
  return {
    async open(url: string) {
      if (cancelled || !page || page.closed) return false;
      try {
        page.location.replace(url);
        navigated = true;
        return true;
      } catch {
        return false;
      }
    },
    cancel() {
      cancelled = true;
      if (!navigated && page && !page.closed) page.close();
    },
  };
}
