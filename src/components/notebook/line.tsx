"use client";
// The notebook line (ADR-002, ADR-020): a paragraph that knows its Block and, when it has a chip,
// its Item. Prefix input rules turn a line into an item; the chip menu turns it back.
import { InputRule } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { createContext, useContext, useState } from "react";
import type { ChipInfo, LineSource, SuggestionView } from "@/domain/notebook-view";
import { SuggestionList } from "./SuggestionList";

export const newClientId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

export const CHIP_LABELS: Record<string, string> = {
  decision: "Decision",
  question: "Question",
  assumption: "Assumption",
  risk: "Risk",
  talking_point: "Talking point",
};

export interface NotebookContextValue {
  chips: Record<string, ChipInfo>;
  sources: Record<string, LineSource>;
  required: boolean;
  setBlocking: (itemId: string, blocking: boolean) => void;
  /** Why the viewer can't change a chip directly (suggest mode), or null. */
  directReason: string | null;
  suggestionsUnder: Record<string, SuggestionView[]>;
  ownSuggested: Record<string, string>;
}

export const NotebookContext = createContext<NotebookContextValue>({
  chips: {},
  sources: {},
  required: false,
  setBlocking: () => {},
  directReason: null,
  suggestionsUnder: {},
  ownSuggested: {},
});

// Typed at the start of a line, followed by a space.
const PREFIX_RULES: [RegExp, string][] = [
  [/^decision:\s$/i, "decision"],
  [/^\?\s$/, "question"],
  [/^assume:\s$/i, "assumption"],
  [/^risk:\s$/i, "risk"],
];

const attr = (key: string, dataName: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${dataName}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [`data-${dataName}`]: attrs[key] } : {}),
});

function Chip({ itemId, itemType, onTurnBack }: { itemId: string | null; itemType: string; onTurnBack: () => void }) {
  const nb = useContext(NotebookContext);
  const [open, setOpen] = useState(false);
  const info = itemId ? nb.chips[itemId] : undefined;
  const blocking = info?.blocking ?? false;
  const settled = info?.settled ?? false;
  const style = blocking
    ? "border-alert bg-alert-bg text-alert"
    : settled
      ? "border-agreed bg-agreed-bg text-agreed"
      : "border-dashed border-line text-ink";
  return (
    <span contentEditable={false} className="relative inline-block shrink-0 select-none">
      <button
        type="button"
        data-testid="chip"
        data-chip-type={itemType}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${style}`}
      >
        {blocking ? "Blocking" : CHIP_LABELS[itemType] ?? itemType}
      </button>
      {open && (
        <span role="menu" className="absolute left-0 top-full z-20 mt-1 flex w-56 flex-col rounded border border-line bg-panel py-1 text-sm shadow">
          {itemType === "question" && info && (
            <button
              type="button"
              role="menuitem"
              disabled={nb.directReason !== null}
              title={nb.directReason ?? undefined}
              className="px-3 py-1 text-left hover:bg-sunk disabled:text-muted"
              onClick={() => {
                setOpen(false);
                nb.setBlocking(itemId!, !blocking);
              }}
            >
              {blocking ? "Not blocking" : "Mark as blocking"}
              {nb.directReason && <span className="block text-xs">{nb.directReason}</span>}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="px-3 py-1 text-left hover:bg-sunk"
            onClick={() => {
              setOpen(false);
              onTurnBack();
            }}
          >
            Turn back into plain text
          </button>
        </span>
      )}
    </span>
  );
}

function LineView({ node, updateAttributes }: ReactNodeViewProps) {
  const nb = useContext(NotebookContext);
  const { blockId, itemId, itemType } = node.attrs as { blockId: string | null; itemId: string | null; itemType: string | null };
  const source = blockId ? nb.sources[blockId] : undefined;
  const info = itemId ? nb.chips[itemId] : undefined;
  const empty = node.content.size === 0;
  const ownSuggestion = blockId ? nb.ownSuggested[blockId] : undefined;
  const under = blockId ? (nb.suggestionsUnder[blockId] ?? []) : [];
  // Solid when sourced; dashed when unsourced in a required section, or when it's only a suggestion.
  const edge = ownSuggestion
    ? "border-dashed border-muted"
    : source?.sourced
      ? "border-agreed"
      : nb.required && !empty
        ? "border-dashed border-muted"
        : "border-transparent";
  return (
    <NodeViewWrapper
      as="div"
      id={blockId ? `block-${blockId}` : undefined}
      data-block-id={blockId ?? undefined}
      data-testid="line"
      className={`my-1 flex flex-wrap items-baseline gap-x-2 border-l-2 py-0.5 pl-3 ${edge}`}
    >
      {itemType && (
        <Chip itemId={itemId} itemType={itemType} onTurnBack={() => updateAttributes({ itemId: null, itemType: null, itemText: null })} />
      )}
      <NodeViewContent<"span"> as="span" className="min-w-[2ch] flex-1 whitespace-pre-wrap" />
      {(source?.labels.length || info?.status || ownSuggestion) && (
        <span contentEditable={false} data-testid={ownSuggestion ? "own-suggestion" : undefined} className="shrink-0 select-none font-mono text-[11px] text-muted">
          {[ownSuggestion, ...(source?.labels ?? []), info?.status].filter(Boolean).join(" · ")}
        </span>
      )}
      {under.length > 0 && (
        <div contentEditable={false} className="w-full select-none">
          <SuggestionList suggestions={under} />
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const NotebookLine = Paragraph.extend({
  addAttributes() {
    return {
      blockId: attr("blockId", "block-id"),
      itemId: attr("itemId", "item-id"),
      itemType: attr("itemType", "item-type"),
      itemText: attr("itemText", "item-text"),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(LineView);
  },
  addInputRules() {
    return PREFIX_RULES.map(
      ([find, type]) =>
        new InputRule({
          find,
          handler: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            const line = $from.parent;
            if (line.type.name !== this.name || line.attrs.itemType) return null;
            state.tr
              .delete(range.from, range.to)
              .setNodeMarkup($from.before(), undefined, { ...line.attrs, itemType: type, itemId: newClientId("itm"), itemText: null });
          },
        }),
    );
  },
});
