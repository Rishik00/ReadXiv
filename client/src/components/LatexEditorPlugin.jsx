import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $isParagraphNode,
  $isTextNode,
  DecoratorNode,
  TextNode,
} from 'lexical';
import {
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
} from '@mdxeditor/editor';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';

function LatexEditor({ node, parentEditor }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const value = node.getValue();
  const display = node.isDisplay();
  const html = katex.renderToString(value, {
    displayMode: display,
    throwOnError: false,
    strict: false,
  });

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    const Input = display ? 'textarea' : 'input';
    return (
      <span className={`latex-live-source ${display ? 'latex-live-source-display' : ''}`}>
        <span aria-hidden="true">{display ? '$$' : '$'}</span>
        <Input
          ref={inputRef}
          className="readxiv-focus-delegated"
          value={value}
          rows={display ? 2 : undefined}
          aria-label={display ? 'Edit display equation' : 'Edit inline equation'}
          onChange={(event) => {
            const nextValue = event.target.value;
            parentEditor.update(() => node.setValue(nextValue));
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || (!display && event.key === 'Enter')) {
              event.preventDefault();
              setEditing(false);
            }
          }}
        />
        <span aria-hidden="true">{display ? '$$' : '$'}</span>
      </span>
    );
  }

  return (
    <span
      className={`latex-live ${display ? 'latex-live-display' : 'latex-live-inline'}`}
      role="button"
      tabIndex={0}
      title="Click to edit equation"
      onClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setEditing(true);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

class LatexNode extends DecoratorNode {
  constructor(value, display = false, key) {
    super(key);
    this.__value = value;
    this.__display = display;
  }

  static getType() {
    return 'readxiv-latex';
  }

  static clone(node) {
    return new LatexNode(node.__value, node.__display, node.__key);
  }

  static importJSON(serializedNode) {
    return new LatexNode(serializedNode.value, serializedNode.display);
  }

  exportJSON() {
    return {
      type: 'readxiv-latex',
      version: 1,
      value: this.__value,
      display: this.__display,
    };
  }

  createDOM() {
    return document.createElement(this.__display ? 'div' : 'span');
  }

  updateDOM(previousNode) {
    return previousNode.__display !== this.__display;
  }

  decorate(parentEditor) {
    return <LatexEditor node={this} parentEditor={parentEditor} />;
  }

  isInline() {
    return !this.__display;
  }

  getValue() {
    return this.__value;
  }

  isDisplay() {
    return this.__display;
  }

  setValue(value) {
    this.getWritable().__value = value;
  }
}

function $createLatexNode(value, display = false) {
  return new LatexNode(value, display);
}

function $isLatexNode(node) {
  return node instanceof LatexNode;
}

function LiveLatexTransform() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => editor.registerNodeTransform(TextNode, (node) => {
    if (!$isTextNode(node)) return;
    const value = node.getTextContent();
    const displayMatch = value.match(/^\s*\$\$([^\n]+)\$\$\s*$/);

    if (displayMatch) {
      const parent = node.getParent();
      const latexNode = $createLatexNode(displayMatch[1].trim(), true);
      if ($isParagraphNode(parent) && parent.getChildrenSize() === 1) parent.replace(latexNode);
      else node.replace(latexNode);
      return;
    }

    const inlineMatch = /(^|[^\\$])\$([^$\n]+)\$(?!\$)/.exec(value);
    if (!inlineMatch) return;

    const start = inlineMatch.index + inlineMatch[1].length;
    const end = start + inlineMatch[0].length - inlineMatch[1].length;
    const parts = node.splitText(start, end);
    const matchedNode = start === 0 ? parts[0] : parts[1];
    matchedNode.replace($createLatexNode(inlineMatch[2].trim(), false));
  }), [editor]);

  return null;
}

const MdastMathVisitor = {
  testNode: (node) => node.type === 'math' || node.type === 'inlineMath',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto($createLatexNode(mdastNode.value, mdastNode.type === 'math'));
  },
};

const LexicalMathVisitor = {
  testLexicalNode: $isLatexNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto(lexicalNode.isDisplay() ? 'math' : 'inlineMath', {
      value: lexicalNode.getValue(),
    });
  },
};

export const latexEditorPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: math(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addToMarkdownExtension$]: mathToMarkdown(),
      [addImportVisitor$]: MdastMathVisitor,
      [addLexicalNode$]: LatexNode,
      [addExportVisitor$]: LexicalMathVisitor,
      [addComposerChild$]: LiveLatexTransform,
    });
  },
});
