import { createServerFn } from "@tanstack/react-start";
import type { ShortcutTokenStatus } from "@/lib/shortcut";

export const getShortcutTokenStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<ShortcutTokenStatus> => {
    const { getShortcutTokenStatus: load } = await import("@/lib/shortcut.server");
    return load();
  },
);

export const createShortcutToken = createServerFn({ method: "POST" }).handler(
  async (): Promise<ShortcutTokenStatus> => {
    const { createShortcutToken: create } = await import("@/lib/shortcut.server");
    return create();
  },
);

export const deleteShortcutToken = createServerFn({ method: "POST" }).handler(
  async (): Promise<ShortcutTokenStatus> => {
    const { deleteShortcutToken: remove } = await import("@/lib/shortcut.server");
    return remove();
  },
);
