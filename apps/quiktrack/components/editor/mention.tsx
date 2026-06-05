"use client";

import { Node, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import { PluginKey, type Plugin } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

// Unique key so this suggestion plugin doesn't collide with the slash-menu's
// (both use @tiptap/suggestion, whose default key is `suggestion$`).
const mentionPluginKey = new PluginKey("mentionSuggestion");
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

export interface MentionItem {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
}

/** Stable hash → consistent avatar color (matches the member avatars elsewhere). */
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

interface ListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, ListProps>(function MentionList(
  { items, command },
  ref,
) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-[0_8px_24px_rgba(15,23,42,0.12)] w-64 px-3 py-2 text-xs text-gray-500">
        No people
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-[0_8px_24px_rgba(15,23,42,0.12)] w-64 max-h-72 overflow-y-auto p-1">
      {items.map((m, i) => {
        const initials =
          (m.name.trim()[0] ?? m.email?.[0] ?? "?").toUpperCase() +
          (m.name.trim().split(/\s+/)[1]?.[0]?.toUpperCase() ?? "");
        return (
          <button
            key={m.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(m)}
            onMouseEnter={() => setSelected(i)}
            className={`flex items-center w-full gap-2.5 px-2 py-1.5 rounded text-left transition-colors ${
              i === selected ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-50"
            }`}
          >
            {m.avatar ? (
              <img src={m.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: avatarColor(m.id) }}
              >
                {initials}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium leading-tight truncate">{m.name}</span>
              {m.email && (
                <span
                  className={`block text-[10.5px] leading-tight truncate ${
                    i === selected ? "text-blue-700/70" : "text-gray-500"
                  }`}
                >
                  {m.email}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

/**
 * Inline `@mention` node + `@`-triggered suggestion. Renders an inline chip
 * `<span data-mention-id data-mention-label>@Name</span>` so the server can
 * extract mentioned user ids from the saved HTML and email them.
 *
 * `getItems` is a getter (not a static array) so the popup always reflects the
 * latest project members, even though they load asynchronously after mount.
 */
export function createMentionExtension(getItems: () => MentionItem[]): Node {
  return Node.create({
    name: "mention",
    group: "inline",
    inline: true,
    atom: true,
    selectable: false,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-mention-id"),
          renderHTML: (attrs) => (attrs.id ? { "data-mention-id": attrs.id } : {}),
        },
        label: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-mention-label"),
          renderHTML: (attrs) => (attrs.label ? { "data-mention-label": attrs.label } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: "span[data-mention-id]" }];
    },

    renderHTML({ HTMLAttributes, node }) {
      return [
        "span",
        mergeAttributes(
          { class: "mention rounded bg-blue-50 px-1 font-medium text-blue-700" },
          HTMLAttributes,
        ),
        `@${node.attrs.label ?? ""}`,
      ];
    },

    renderText({ node }) {
      return `@${node.attrs.label ?? ""}`;
    },

    addProseMirrorPlugins() {
      return [
        Suggestion<MentionItem>({
          editor: this.editor,
          pluginKey: mentionPluginKey,
          char: "@",
          allowSpaces: false,
          startOfLine: false,
          command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionItem }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { id: props.id, label: props.name } },
                { type: "text", text: " " },
              ])
              .run();
          },
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase();
            return getItems()
              .filter(
                (m) =>
                  m.name.toLowerCase().includes(q) ||
                  (m.email?.toLowerCase().includes(q) ?? false),
              )
              .slice(0, 8);
          },
          render: () => {
            let component: ReactRenderer<MentionListRef, ListProps> | null = null;
            let popup: TippyInstance | null = null;
            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props: { items: props.items, command: props.command },
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy(document.body, {
                  getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                  appendTo: () => document.body,
                  content: component.element as Element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                  arrow: false,
                  theme: "transparent",
                  offset: [0, 6],
                  maxWidth: "none",
                });
              },
              onUpdate: (props) => {
                component?.updateProps({ items: props.items, command: props.command });
                popup?.setProps({
                  getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                });
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  popup?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.destroy();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        } satisfies Partial<SuggestionOptions<MentionItem>>) as unknown as Plugin,
      ];
    },
  });
}
