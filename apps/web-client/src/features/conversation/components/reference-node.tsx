import { DecoratorNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import type { ReactNode } from "react";
import { type InlineReference, referenceText } from "@/features/conversation/lib/inline-references";
import { InlineReferenceChip } from "./inline-references";

type SerializedReference = SerializedLexicalNode & { reference: InlineReference };

export class ReferenceNode extends DecoratorNode<ReactNode> {
  __reference: InlineReference;
  constructor(reference: InlineReference, key?: NodeKey) {
    super(key);
    this.__reference = reference;
  }
  static getType() {
    return "ngertiin-reference";
  }
  static clone(node: ReferenceNode) {
    return new ReferenceNode(node.__reference, node.__key);
  }
  static importJSON(node: SerializedReference) {
    return new ReferenceNode(node.reference);
  }
  exportJSON(): SerializedReference {
    return {
      ...super.exportJSON(),
      reference: this.__reference,
      type: ReferenceNode.getType(),
      version: 1,
    };
  }
  getTextContent() {
    return referenceText(this.__reference);
  }
  isInline() {
    return true;
  }
  createDOM() {
    const element = document.createElement("span");
    element.className = "composer-reference-node";
    element.contentEditable = "false";
    return element;
  }
  updateDOM() {
    return false;
  }
  exportDOM() {
    const element = document.createElement("span");
    element.textContent = this.__reference.label;
    return { element };
  }
  decorate() {
    return <InlineReferenceChip reference={this.__reference} />;
  }
}
