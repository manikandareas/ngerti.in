import DOMPurify from "dompurify";

const policy =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'";

export function staticHtml(body: string) {
  if (!body) return "";
  const clean = DOMPurify.sanitize(body, {
    USE_PROFILES: { html: true },
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["style"],
    FORBID_TAGS: [
      "base",
      "link",
      "meta",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "iframe",
      "object",
      "embed",
      "video",
      "audio",
      "source",
      "track",
    ],
    // CSP resource directives do not prevent link navigation. Remove navigation
    // and external URLs as well; the original downloadable bytes stay intact.
    FORBID_ATTR: [
      "href",
      "srcset",
      "action",
      "formaction",
      "target",
      "ping",
      "download",
      "srcdoc",
      "autofocus",
    ],
    ALLOWED_URI_REGEXP: /^data:image\/(?:png|jpeg|gif|webp);base64,/i,
  });
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"></head><body>${clean}</body></html>`;
}
