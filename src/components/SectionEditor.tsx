"use client";
// One template section of the notebook, as a Tiptap editor (ADR-002, ADR-020).
// Autosaves the whole section; the server decides what changed. Edits to agreed content come
// back as "needs confirmation" and wait for the person to save and reopen, or undo.
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStoryAction, saveSectionAction, setBlockingAction, withdrawSuggestionActionUI } from "@/app/actions";
import type { ChipInfo, EditorLine, LineSource, SuggestionView } from "@/domain/notebook-view";
import { SuggestionList } from "./notebook/SuggestionList";
import { CHIP_LABELS, NotebookContext, NotebookLine, newClientId } from "./notebook/line";

const AUTOSAVE_MS = 700;

interface Props {
  storyId: string;
  epicId: string;
  section: string;
  required: boolean;
  initialLines: EditorLine[];
  chips: Record<string, ChipInfo>;
  sources: Record<string, LineSource>;
  /** `suggesting` for everyone but the lead (ADR-025). */
  mode: "direct" | "suggesting";
  lead: string;
  suggestionsUnder: Record<string, SuggestionView[]>;
  ownSuggested: Record<string, string>;
  topSuggestions: SuggestionView[];
  ownRemovals: { id: string; text: string }[];
}

type SaveState =
  | { kind: "saved" }
  | { kind: "suggested" }
  | { kind: "saving" }
  | { kind: "unsaved" }
  | { kind: "error"; message: string }
  | { kind: "confirm"; warning: string };

function toDoc(lines: EditorLine[]): JSONContent {
  const content = lines.map((l) => ({
    type: "paragraph",
    attrs: { blockId: l.blockId, itemId: l.itemId, itemType: l.itemType, itemText: l.itemText },
    content: l.text ? [{ type: "text", text: l.text }] : [],
  }));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Gives every non-empty line a block id (and de-duplicates pasted ones) before saving. */
function assignIds(editor: Editor) {
  const seen = new Set<string>();
  const tr = editor.state.tr;
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name !== "paragraph") return;
    const id = node.attrs.blockId as string | null;
    if (node.textContent.trim() && (!id || seen.has(id))) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newClientId("blk") });
    } else if (id) {
      seen.add(id);
    }
  });
  if (tr.docChanged) {
    tr.setMeta("addToHistory", false).setMeta("assignIds", true);
    editor.view.dispatch(tr);
  }
}

function toLines(editor: Editor) {
  const lines: { blockId: string | null; itemId: string | null; itemType: string | null; text: string; itemText: string | null }[] = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name !== "paragraph") return;
    lines.push({
      blockId: node.attrs.blockId,
      itemId: node.attrs.itemId,
      itemType: node.attrs.itemType,
      text: node.textContent,
      itemText: node.attrs.itemText,
    });
  });
  return lines;
}

export function SectionEditor({
  storyId,
  epicId,
  section,
  required,
  initialLines,
  chips,
  sources,
  mode,
  lead,
  suggestionsUnder,
  ownSuggested,
  topSuggestions,
  ownRemovals,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const [notice, setNotice] = useState<string | null>(null);
  // A chip action that needs confirming first (marking a question blocking on an agreed story).
  const [pendingConfirm, setPendingConfirm] = useState<{ warning: string; run: () => void } | null>(null);
  const lastSaved = useRef<JSONContent>(toDoc(initialLines));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const queued = useRef<boolean | null>(null);
  const holding = useRef(false);

  const saveOnce = useCallback(
    async (editor: Editor, confirmReopen: boolean) => {
      assignIds(editor);
      const snapshot = editor.getJSON();
      setState({ kind: "saving" });
      try {
        const result = await saveSectionAction(storyId, section, toLines(editor), confirmReopen);
        if (result.status === "suggested") {
          holding.current = false;
          lastSaved.current = snapshot;
          setState(JSON.stringify(editor.getJSON()) === JSON.stringify(snapshot) ? { kind: "suggested" } : { kind: "unsaved" });
        } else if (result.status === "needs_confirmation") {
          holding.current = true;
          setState({ kind: "confirm", warning: result.warning });
        } else {
          holding.current = false;
          lastSaved.current = snapshot;
          setState(JSON.stringify(editor.getJSON()) === JSON.stringify(snapshot) ? { kind: "saved" } : { kind: "unsaved" });
        }
      } catch (e) {
        setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't save" });
      }
    },
    [storyId, section],
  );

  /** One save at a time. A save asked for meanwhile runs as soon as the current one lands. */
  const save = useCallback(
    async (editor: Editor, confirmReopen: boolean) => {
      if (inFlight.current) {
        queued.current = (queued.current ?? false) || confirmReopen;
        return;
      }
      inFlight.current = true;
      try {
        let next: boolean | null = confirmReopen;
        while (next !== null) {
          queued.current = null;
          await saveOnce(editor, next);
          next = holding.current ? null : queued.current;
        }
      } finally {
        inFlight.current = false;
      }
    },
    [saveOnce],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        underline: false,
        link: false,
      }),
      NotebookLine,
    ],
    content: toDoc(initialLines),
    editorProps: {
      attributes: {
        class: "outline-none min-h-[1.75rem]",
        "aria-label": `${section} notes`,
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (transaction.getMeta("assignIds")) return;
      if (timer.current) clearTimeout(timer.current);
      if (holding.current) return; // Waiting for "Save and reopen" or "Undo my edit".
      setState({ kind: "unsaved" });
      timer.current = setTimeout(() => void save(editor, false), AUTOSAVE_MS);
    },
  });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Ready once the editor's React node views have mounted and painted.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!editor) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [editor]);

  const context = useMemo(
    () => ({
      chips,
      sources,
      required,
      setBlocking: (itemId: string, blocking: boolean) => {
        const attempt = (confirmReopen: boolean) =>
          void setBlockingAction(itemId, blocking, confirmReopen).then((r) => {
            if (r.status === "needs_confirmation") setPendingConfirm({ warning: r.warning, run: () => attempt(true) });
            else if (r.status === "refused") setNotice(r.reason);
            else {
              setPendingConfirm(null);
              router.refresh();
            }
          });
        attempt(false);
      },
      directReason: mode === "direct" ? null : `${lead} is the lead`,
      suggestionsUnder,
      ownSuggested,
    }),
    [chips, sources, required, router, mode, lead, suggestionsUnder, ownSuggested],
  );

  // Keep the editor in step with the server when someone else changes this section (the lead
  // accepting a suggestion from the panel, say), but never while this person has unsaved typing.
  const serverKey = JSON.stringify(initialLines.map((l) => [l.blockId, l.itemType, l.text]));
  useEffect(() => {
    if (!editor || (state.kind !== "saved" && state.kind !== "suggested") || timer.current || inFlight.current || holding.current) return;
    const current = JSON.stringify(toLines(editor).filter((l) => l.text.trim()).map((l) => [l.blockId, l.itemType, l.text.trim()]));
    if (current === serverKey) return;
    const doc = toDoc(initialLines);
    lastSaved.current = doc;
    // Outside React's commit phase: setContent re-renders node views synchronously.
    queueMicrotask(() => editor.commands.setContent(doc, { emitUpdate: false }));
    // Only re-sync when the server's content changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, editor]);

  const turnInto = (type: string) => {
    if (!editor) return;
    const { from, to, $from } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to).trim();
    if (!selected) return;
    if (type === "story") {
      // Link the new story to this line once the line is saved, so its source resolves.
      const sourceBlockId = lastSaved.current.content?.some((n) => n.attrs?.blockId === $from.parent.attrs.blockId)
        ? ($from.parent.attrs.blockId as string)
        : null;
      void createStoryAction(epicId, selected, sourceBlockId)
        .then(({ key }) => setNotice(`Created ${key} as a draft story.`))
        .catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Couldn't create the story."));
      return;
    }
    const line = $from.parent;
    const pos = $from.before();
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, {
          ...line.attrs,
          itemType: type,
          itemId: newClientId("itm"),
          itemText: selected === line.textContent.trim() ? null : selected,
        });
        return true;
      })
      .setTextSelection(to)
      .run();
  };

  return (
    <section className="mt-6" data-section={section} data-testid={`section-${section}`} data-ready={ready ? "true" : undefined}>
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">{section}</h2>
        <span data-testid="save-state" className="font-mono text-[11px] text-muted" aria-live="polite">
          {state.kind === "saving"
            ? "Saving"
            : state.kind === "unsaved"
              ? "Not saved yet"
              : state.kind === "error"
                ? `Not saved: ${state.message}`
                : state.kind === "suggested"
                  ? `Suggested · ${lead} reviews`
                  : state.kind === "saved"
                    ? "Saved"
                    : ""}
        </span>
        {mode === "suggesting" && (
          <span data-testid="suggesting" title={`Your edits are suggestions until ${lead}, the lead, accepts them`} className="rounded border border-dashed border-muted px-1.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            Suggesting
          </span>
        )}
      </div>
      {state.kind === "confirm" && editor && (
        <div role="alert" data-testid="reopen-warning" className="mt-2 rounded border border-alert bg-alert-bg px-3 py-2 text-sm text-ink">
          <p>{state.warning}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded bg-ink px-3 py-1 text-paper" onClick={() => void save(editor, true)}>
              Save and reopen
            </button>
            <button
              type="button"
              className="rounded border border-line px-3 py-1"
              onClick={() => {
                holding.current = false;
                editor.commands.setContent(lastSaved.current, { emitUpdate: false });
                setState({ kind: "saved" });
              }}
            >
              Undo my edit
            </button>
          </div>
        </div>
      )}
      {pendingConfirm && (
        <div role="alert" data-testid="chip-warning" className="mt-2 rounded border border-alert bg-alert-bg px-3 py-2 text-sm">
          <p>{pendingConfirm.warning}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="rounded bg-ink px-3 py-1 text-paper" onClick={() => pendingConfirm.run()}>
              Save and reopen
            </button>
            <button type="button" className="rounded border border-line px-3 py-1" onClick={() => setPendingConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {topSuggestions.length > 0 && <SuggestionList suggestions={topSuggestions} />}
      {ownRemovals.length > 0 && (
        <ul data-testid="own-removals" className="mt-1 space-y-1 text-sm">
          {ownRemovals.map((r) => (
            <li key={r.id} className="rounded border border-dashed border-muted px-2 py-1 text-muted">
              You suggested removing <span className="line-through">{r.text}</span>{" "}
              <button type="button" className="text-agreed hover:underline" onClick={() => void withdrawSuggestionActionUI(r.id).then(() => router.refresh())}>
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      )}
      <NotebookContext.Provider value={context}>
        <div className="mt-1 text-[15px] leading-7">
          <EditorContent editor={editor} />
        </div>
      </NotebookContext.Provider>
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state: s }) => !s.selection.empty && s.selection.$from.sameParent(s.selection.$to)}
        >
          <div role="toolbar" aria-label="Turn into" className="flex items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-xs shadow">
            <span className="mr-1 font-mono uppercase text-muted">Turn into</span>
            {["decision", "question", "assumption", "risk"].map((t) => (
              <button key={t} type="button" className="rounded px-2 py-0.5 hover:bg-sunk" onClick={() => turnInto(t)}>
                {CHIP_LABELS[t]}
              </button>
            ))}
            <button type="button" className="rounded px-2 py-0.5 hover:bg-sunk" onClick={() => turnInto("story")}>
              Story
            </button>
          </div>
        </BubbleMenu>
      )}
    </section>
  );
}
