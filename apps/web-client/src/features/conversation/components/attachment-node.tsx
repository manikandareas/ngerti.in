import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, DecoratorNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import { createContext, type ReactNode, useContext } from "react";
import {
  attachmentReference,
  type ComposerAttachment,
} from "@/features/conversation/lib/attachment-references";
import { AttachmentChip } from "./attachment-chip";

export const ComposerAttachmentContext = createContext<{
  lookup: (id: string) => ComposerAttachment | undefined;
  retry: (id: string) => void;
  readOnly: boolean;
}>({ lookup: () => undefined, retry: () => {}, readOnly: false });

type SerializedAttachment = SerializedLexicalNode & { id: string; name: string };

function AttachmentDecoration({
  id,
  name,
  nodeKey,
}: {
  id: string;
  name: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const { lookup, retry, readOnly } = useContext(ComposerAttachmentContext);
  const file = lookup(id);
  if (!file) return <span>{name}</span>;
  return (
    <AttachmentChip
      file={file}
      disabled={readOnly}
      retry={() => retry(id)}
      remove={readOnly ? undefined : () => editor.update(() => $getNodeByKey(nodeKey)?.remove())}
    />
  );
}

export class AttachmentNode extends DecoratorNode<ReactNode> {
  __attachmentId: string;
  __name: string;
  constructor(id: string, name: string, key?: NodeKey) {
    super(key);
    this.__attachmentId = id;
    this.__name = name;
  }
  static getType() {
    return "ngertiin-attachment";
  }
  static clone(node: AttachmentNode) {
    return new AttachmentNode(node.__attachmentId, node.__name, node.__key);
  }
  static importJSON(node: SerializedAttachment) {
    return new AttachmentNode(node.id, node.name);
  }
  exportJSON(): SerializedAttachment {
    return {
      ...super.exportJSON(),
      id: this.__attachmentId,
      name: this.__name,
      type: AttachmentNode.getType(),
      version: 1,
    };
  }
  getTextContent() {
    return attachmentReference(this.__attachmentId, this.__name);
  }
  isInline() {
    return true;
  }
  createDOM() {
    const element = document.createElement("span");
    element.className = "composer-attachment-node";
    element.contentEditable = "false";
    return element;
  }
  updateDOM() {
    return false;
  }
  exportDOM() {
    const element = document.createElement("span");
    element.textContent = this.__name;
    return { element };
  }
  decorate() {
    return (
      <AttachmentDecoration id={this.__attachmentId} name={this.__name} nodeKey={this.__key} />
    );
  }
}
