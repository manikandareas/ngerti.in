/** Measure wrapping without letting the wider expanded layout collapse the editor again. */
export function isComposerMultiline(root: HTMLElement): boolean {
  const style = getComputedStyle(root);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const singleLineHeight =
    parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  if (root.scrollHeight > singleLineHeight + 4) return true;

  const form = root.closest<HTMLElement>(".conversation-composer");
  if (form?.dataset.multiline !== "true") return false;

  const formStyle = getComputedStyle(form);
  const controls = [...form.querySelectorAll<HTMLElement>(".composer-attach, .composer-actions")];
  const controlsWidth = controls.reduce(
    (width, control) => width + control.getBoundingClientRect().width,
    0,
  );
  const compactWidth =
    form.clientWidth -
    parseFloat(formStyle.paddingLeft) -
    parseFloat(formStyle.paddingRight) -
    horizontalPadding -
    controlsWidth -
    parseFloat(formStyle.columnGap) * controls.length;
  const range = document.createRange();
  range.selectNodeContents(root.firstElementChild ?? root);
  return range.getBoundingClientRect().width > compactWidth;
}
