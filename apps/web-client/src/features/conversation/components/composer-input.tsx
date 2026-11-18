import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  HISTORY_PUSH_TAG,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalNode,
  PASTE_COMMAND,
  type RangeSelection,
} from "lexical";
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  attachmentParts,
  type ComposerAttachment,
} from "@/features/conversation/lib/attachment-references";
import { isComposerMultiline } from "@/features/conversation/lib/composer-layout";
import { referenceParts } from "@/features/conversation/lib/inline-references";
import { usePreferences } from "@/hooks/use-preferences";
import { AttachmentNode, ComposerAttachmentContext } from "./attachment-node";
import { ComposerSuggestions } from "./composer-suggestions";
import { ReferenceNode } from "./reference-node";

export interface ComposerInputHandle {
  focus: (end?: boolean) => void;
  insertAttachments: (files: ComposerAttachment[]) => void;
}
interface Props {
  ref: Ref<ComposerInputHandle>;
  value: string;
  placeholder: string;
  readOnly: boolean;
  lookup: (id: string) => ComposerAttachment | undefined;
  retry: (id: string) => void;
  onChange: (value: string) => void;
  onEnter: () => void;
  onFiles: (files: File[]) => void;
  onMultiline: (multiline: boolean) => void;
  report: (message: string) => void;
  label?: string;
  onEscape?: () => void;
  suggestions?: boolean;
}

function inlineNodes(value: string, lookup: Props["lookup"], plainUnknown = false): LexicalNode[] {
  return attachmentParts(value).flatMap<LexicalNode>((part) => {
    if ("id" in part && lookup(part.id)) return [new AttachmentNode(part.id, part.name)];
    const text = "text" in part ? part.text : plainUnknown ? part.name : part.reference;
    return referenceParts(text).flatMap<LexicalNode>((part) =>
      "reference" in part
        ? [new ReferenceNode(part.reference)]
        : part.text
            .split("\n")
            .flatMap((line, index) => [
              ...(index ? [$createLineBreakNode()] : []),
              ...(line ? [$createTextNode(line)] : []),
            ]),
    );
  });
}

function adjacentCharacter(point: RangeSelection["anchor"], before: boolean) {
  const node = point.getNode();
  if (point.type === "text") {
    const text = node.getTextContent();
    return before
      ? (text.slice(0, point.offset).at(-1) ?? node.getPreviousSibling()?.getTextContent().at(-1))
      : (text.slice(point.offset)[0] ?? node.getNextSibling()?.getTextContent()[0]);
  }
  if (!$isElementNode(node)) return undefined;
  const text = node.getChildAtIndex(point.offset - (before ? 1 : 0))?.getTextContent();
  return before ? text?.at(-1) : text?.[0];
}

function ComposerBridge(props: Props) {
  const { preferences } = usePreferences();
  const shortcut = useRef(preferences.sendShortcut);
  shortcut.current = preferences.sendShortcut;
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const latest = useRef(props);
  latest.current = props;
  const savedSelection = useRef<RangeSelection | null>(null);
  const requestedFocus = useRef<boolean | null>(null);
  const focusNow = useCallback(
    (end: boolean) => {
      editor.focus(() => {
        if (end) editor.update(() => $getRoot().selectEnd());
      });
    },
    [editor],
  );
  useImperativeHandle(
    props.ref,
    () => ({
      focus(end = false) {
        if (
          latest.current.readOnly ||
          !editor.isEditable() ||
          !editor.getRootElement()?.isContentEditable
        )
          requestedFocus.current = end;
        else focusNow(end);
      },
      insertAttachments(files) {
        if (latest.current.readOnly || !files.length) return;
        editor.update(
          () => {
            const native = window.getSelection();
            const root = editor.getRootElement();
            if (
              native?.rangeCount &&
              root?.contains(native.anchorNode) &&
              root.contains(native.focusNode)
            ) {
              const observed = $createRangeSelection();
              observed.applyDOMRange(native.getRangeAt(0));
              $setSelection(observed);
            } else if (!$isRangeSelection($getSelection())) {
              if (savedSelection.current) $setSelection(savedSelection.current.clone());
              else $getRoot().selectEnd();
            }
            const selection = $getSelection();
            const backward = $isRangeSelection(selection) && selection.isBackward();
            const preceding = $isRangeSelection(selection)
              ? adjacentCharacter(backward ? selection.focus : selection.anchor, true)
              : undefined;
            const following = $isRangeSelection(selection)
              ? adjacentCharacter(backward ? selection.anchor : selection.focus, false)
              : undefined;
            $insertNodes([
              ...(preceding && !/\s/.test(preceding) ? [$createTextNode(" ")] : []),
              ...files.flatMap((file, index) => [
                new AttachmentNode(file.id, file.name),
                ...(index < files.length - 1 || !following || !/\s/.test(following)
                  ? [$createTextNode(" ")]
                  : []),
              ]),
            ]);
          },
          { tag: HISTORY_PUSH_TAG, discrete: true },
        );
        editor.focus();
      },
    }),
    [editor, focusNow],
  );

  useEffect(() => {
    editor.setEditable(!props.readOnly);
  }, [editor, props.readOnly]);
  useLayoutEffect(() => {
    if (editable && !props.readOnly && requestedFocus.current !== null) {
      const end = requestedFocus.current;
      requestedFocus.current = null;
      focusNow(end);
    }
  }, [editable, props.readOnly, focusNow]);
  useLayoutEffect(() => {
    if (editor.getEditorState().read(() => $getRoot().getTextContent()) === props.value) return;
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(...inlineNodes(props.value, latest.current.lookup)),
          );
        savedSelection.current = null;
      },
      { tag: "external-value", discrete: true },
    );
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [editor, props.value]);

  useEffect(() => {
    const measure = () => {
      const root = editor.getRootElement();
      if (!root) return;
      latest.current.onMultiline(
        isComposerMultiline(root) ||
          editor.getEditorState().read(() => $getRoot().getTextContent().includes("\n")),
      );
    };
    const observer = new ResizeObserver(measure);
    const offRoot = editor.registerRootListener((root, previous) => {
      if (previous) observer.unobserve(previous);
      if (root) observer.observe(root);
      measure();
    });
    const offUpdate = editor.registerUpdateListener(({ editorState, tags }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) savedSelection.current = selection.clone();
        if (!tags.has("external-value")) latest.current.onChange($getRoot().getTextContent());
      });
      measure();
    });
    return () => {
      offRoot();
      offUpdate();
      observer.disconnect();
    };
  }, [editor]);

  useEffect(() => {
    const offEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event || event.shiftKey) return false;
        if (shortcut.current === "mod-enter" && !event.metaKey && !event.ctrlKey) return false;
        if (event.isComposing || editor.isComposing()) return true;
        event.preventDefault();
        if (editor.getRootElement()?.dataset.suggestionsOpen === "true") return true;
        latest.current.onEnter();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const offPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!event || !("clipboardData" in event) || !event.clipboardData) return false;
        if (latest.current.readOnly) return true;
        const files = [...event.clipboardData.files];
        event.preventDefault();
        if (files.length) latest.current.onFiles(files);
        else {
          const text =
            event.clipboardData.getData("application/x-ngertiin-composer") ||
            event.clipboardData.getData("text/plain");
          $getSelection()?.insertNodes(inlineNodes(text, latest.current.lookup, true));
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const copy = (event: ClipboardEvent | KeyboardEvent | null, cut: boolean) => {
      if (!event || !("clipboardData" in event) || !event.clipboardData) return false;
      const selection = $getSelection();
      if (!selection) return false;
      const text = selection.getTextContent();
      event.preventDefault();
      event.clipboardData.setData("application/x-ngertiin-composer", text);
      event.clipboardData.setData(
        "text/plain",
        attachmentParts(text)
          .map((part) =>
            "text" in part
              ? referenceParts(part.text)
                  .map((item) => ("reference" in item ? item.reference.label : item.text))
                  .join("")
              : part.name,
          )
          .join(""),
      );
      if (cut && !latest.current.readOnly) {
        if ($isRangeSelection(selection)) selection.removeText();
        else for (const node of selection.getNodes()) node.remove();
      }
      return true;
    };
    const offCopy = editor.registerCommand(
      COPY_COMMAND,
      (event) => copy(event, false),
      COMMAND_PRIORITY_HIGH,
    );
    const offCut = editor.registerCommand(
      CUT_COMMAND,
      (event) => copy(event, true),
      COMMAND_PRIORITY_HIGH,
    );
    const offEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        if (!latest.current.onEscape || event.isComposing || editor.isComposing()) return false;
        event.preventDefault();
        latest.current.onEscape();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      offEnter();
      offPaste();
      offCopy();
      offCut();
      offEscape();
    };
  }, [editor]);
  return null;
}

export function ComposerInput(props: Props) {
  "use memo";
  const { report } = props;
  const initialConfig = useMemo(
    () => ({
      namespace: "ngertiin-composer",
      nodes: [AttachmentNode, ReferenceNode],
      theme: { paragraph: "composer-paragraph" },
      onError: (error: Error) => report(error.message),
    }),
    [report],
  );
  return (
    <ComposerAttachmentContext.Provider
      value={{ lookup: props.lookup, retry: props.retry, readOnly: props.readOnly }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className="composer-editor">
          <PlainTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable
                className="composer-input"
                aria-label={props.label ?? "Pesan"}
                aria-haspopup="listbox"
                aria-multiline="true"
                aria-readonly={props.readOnly}
                aria-placeholder={props.placeholder}
                placeholder={
                  <span className="composer-placeholder" aria-hidden="true">
                    {props.placeholder}
                  </span>
                }
                spellCheck
              />
            }
          />
        </div>
        <HistoryPlugin />
        <ComposerBridge {...props} />
        {props.suggestions !== false && (
          <ComposerSuggestions value={props.value} readOnly={props.readOnly} />
        )}
      </LexicalComposer>
    </ComposerAttachmentContext.Provider>
  );
}
