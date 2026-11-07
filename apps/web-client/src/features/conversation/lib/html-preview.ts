import { type DefaultTreeAdapterTypes, defaultTreeAdapter, html, parse, serialize } from "parse5";

const blocked = new Set([
  "script",
  "base",
  "iframe",
  "object",
  "embed",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
]);
const policy =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

function clean(parent: DefaultTreeAdapterTypes.ParentNode) {
  parent.childNodes = parent.childNodes.filter((node) => {
    if (!("tagName" in node)) return true;
    if (
      blocked.has(node.tagName.toLowerCase()) ||
      (node.tagName === "meta" && node.attrs.some((attribute) => attribute.name === "http-equiv"))
    )
      return false;
    node.attrs = node.attrs.filter((attribute) => {
      if (
        attribute.name.startsWith("on") ||
        attribute.name === "target" ||
        attribute.name === "download"
      )
        return false;
      if (attribute.name === "href") return attribute.value.startsWith("#");
      return true;
    });
    clean(node);
    if ("content" in node) clean(node.content);
    return true;
  });
}

/** Parse without DOM side effects, retaining document/body attributes for a static preview. */
export function htmlPreview(source: string, headerInset = 0) {
  const document = parse(source, { scriptingEnabled: false });
  clean(document);
  const root = document.childNodes.find((node) => "tagName" in node && node.tagName === "html");
  const head =
    root && "childNodes" in root
      ? root.childNodes.find((node) => "tagName" in node && node.tagName === "head")
      : null;
  if (!head || !("tagName" in head)) throw new Error("Unable to prepare the HTML preview.");
  const inset = Math.max(0, Math.min(200, Math.round(headerInset)));
  if (inset > 0) {
    // Scroll this clearance away inside the iframe instead of reserving an opaque outer bar.
    const style = defaultTreeAdapter.createElement("style", html.NS.HTML, []);
    defaultTreeAdapter.insertText(
      style,
      `:root::before{content:"";display:block;height:${inset}px}:root{scroll-padding-top:${inset}px}`,
    );
    style.parentNode = head;
    head.childNodes.push(style);
  }
  const meta = defaultTreeAdapter.createElement("meta", html.NS.HTML, [
    { name: "http-equiv", value: "Content-Security-Policy" },
    { name: "content", value: policy },
  ]);
  meta.parentNode = head;
  head.childNodes.unshift(meta);
  if (!document.childNodes.some((node) => node.nodeName === "#documentType"))
    defaultTreeAdapter.setDocumentType(document, "html", "", "");
  return serialize(document, { scriptingEnabled: false });
}
