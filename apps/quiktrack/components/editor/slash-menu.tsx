"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import type { Plugin } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Table as TableIcon,
  Image as ImageIcon,
  Minus,
  Smile,
  Type,
} from "lucide-react";

export interface SlashMenuItem {
  title: string;
  description: string;
  Icon: React.ElementType;
  command: (props: { editor: Editor; range: Range }) => void;
}

function buildItems(opts: {
  onPickImage?: () => void;
  onPickEmoji?: () => void;
}): SlashMenuItem[] {
  return [
    {
      title: "Text",
      description: "Plain paragraph",
      Icon: Type,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: "Heading 1",
      description: "Big section heading",
      Icon: Heading1,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      Icon: Heading2,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      Icon: Heading3,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: "Bulleted list",
      description: "Simple bulleted list",
      Icon: List,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: "Numbered list",
      description: "Ordered list",
      Icon: ListOrdered,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: "Task list",
      description: "Checkable to-dos",
      Icon: CheckSquare,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: "Quote",
      description: "Block quote",
      Icon: Quote,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: "Code block",
      description: "Monospace code",
      Icon: Code,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: "Divider",
      description: "Horizontal rule",
      Icon: Minus,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: "Table",
      description: "3×3 table",
      Icon: TableIcon,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: "Image",
      description: "Upload an image",
      Icon: ImageIcon,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        opts.onPickImage?.();
      },
    },
    {
      title: "Emoji",
      description: "Insert emoji",
      Icon: Smile,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        opts.onPickEmoji?.();
      },
    },
  ];
}

interface ListProps {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
}

export interface SlashListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashList = forwardRef<SlashListRef, ListProps>(function SlashList(
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
        No matches
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-[0_8px_24px_rgba(15,23,42,0.12)] w-64 max-h-72 overflow-y-auto p-1">
      <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Insert block
      </div>
      {items.map((it, i) => (
        <button
          key={it.title}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(it)}
          onMouseEnter={() => setSelected(i)}
          className={`flex items-center w-full gap-2.5 px-2 py-1.5 rounded text-left transition-colors ${
            i === selected ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-50"
          }`}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
              i === selected ? "bg-white text-blue-600" : "text-gray-500"
            }`}
          >
            <it.Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium leading-tight truncate">
              {it.title}
            </span>
            <span
              className={`block text-[10.5px] leading-tight truncate ${
                i === selected ? "text-blue-700/70" : "text-gray-500"
              }`}
            >
              {it.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
});

export function createSlashMenuExtension(opts: {
  onPickImage?: () => void;
  onPickEmoji?: () => void;
}): Extension {
  return Extension.create({
    name: "slashMenu",
    addOptions() {
      return {
        suggestion: {
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          command: ({ editor, range, props }: {
            editor: Editor;
            range: Range;
            props: SlashMenuItem;
          }) => {
            props.command({ editor, range });
          },
        } satisfies Partial<SuggestionOptions<SlashMenuItem>>,
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashMenuItem>({
          editor: this.editor,
          ...this.options.suggestion,
          items: ({ query }: { query: string }) => {
            const all = buildItems(opts);
            const q = query.toLowerCase();
            return all.filter((i) =>
              i.title.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q),
            );
          },
          render: () => {
            let component: ReactRenderer<SlashListRef, ListProps> | null = null;
            let popup: TippyInstance | null = null;
            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashList, {
                  props: {
                    items: props.items,
                    command: props.command,
                  },
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy(document.body, {
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(),
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
                component?.updateProps({
                  items: props.items,
                  command: props.command,
                });
                popup?.setProps({
                  getReferenceClientRect: () =>
                    props.clientRect?.() ?? new DOMRect(),
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
        }) as unknown as Plugin,
      ];
    },
  });
}
