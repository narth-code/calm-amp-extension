// Calm - assistant-row presentation adapter (thinking and working notes).
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// omp exports AssistantMessageComponent through `omp.pi` with updateContent(),
// render(), describe() and setMidStreamPublication() (verified against omp
// 18.12.3). installCalmCollapsedThinkingLayout() probes that exact seam and
// throws if it is missing; index.ts catches that and skips only this adapter.
//
// How it works: while omp draws a row, the adapter hands it a projected message
// without thinking blocks and, for steps that stopped to call tools, without
// short working notes. It restores the complete message right after drawing,
// even if a renderer throws, so retries, images, invalidation and exports keep
// the source content byte-for-byte.
import {
  CALM_PATCH,
  type CalmPresentation,
  calmRequireMethods,
} from "./visibility.ts";

type Block = { type: string; text?: string };
export type CalmMessage = { role?: string; timestamp?: number; content: Block[]; stopReason?: string };

/** The minimum trimmed length of mid-turn assistant text that stays visible. */
export const CALM_PRESERVE_MIN_CHARS = 240;

/** Whether mid-turn assistant text is substantive enough to remain visible. */
export function calmTextIsSubstantive(text: string): boolean {
  return text.includes("\n") || text.trim().length >= CALM_PRESERVE_MIN_CHARS;
}

/** Whether a model step stopped to call tools, making its text a working note. */
export function calmStoppedForTools(message: CalmMessage | undefined): boolean {
  return message?.stopReason === "toolUse" ||
    (message?.stopReason === "length" && message.content.some((b) => b.type === "toolCall"));
}

export function installCalmCollapsedThinkingLayout(prototype: any, presentation: CalmPresentation): void {
  calmRequireMethods(prototype, ["updateContent", "render", "describe", "setMidStreamPublication"]);
  if (Object.hasOwn(prototype, CALM_PATCH)) { prototype[CALM_PATCH].presentation = presentation; return; }
  const state = { presentation };
  const rows = new WeakMap<object, { message: CalmMessage; options: any; projecting: boolean }>();
  const publication = new WeakMap<object, boolean>();
  const setPublication = prototype.setMidStreamPublication;
  prototype.setMidStreamPublication = function (enabled: boolean) {
    publication.set(this, enabled);
    return setPublication.call(this, enabled);
  };
  const update = prototype.updateContent;
  prototype.updateContent = function (message: CalmMessage, options: any) {
    const row = rows.get(this);
    if (!row?.projecting) rows.set(this, { message, options, projecting: false });
    return update.call(this, message, options);
  };
  for (const method of ["render", "describe"]) {
    const draw = prototype[method];
    prototype[method] = function (...args: any[]) {
      const row = rows.get(this);
      if (!row || row.projecting || !state.presentation.active) return draw.apply(this, args);
      // omp can retire streaming thinking into immutable terminal scrollback.
      // Disable that optimization while Calm needs reversible rows.
      setPublication.call(this, false);
      const midTurn = row.message.timestamp !== undefined &&
        state.presentation.toolStops.has(row.message.timestamp);
      const content = row.message.content.filter((b) => b.type !== "thinking" &&
        !(b.type === "text" && midTurn && !row.options?.transient && !calmTextIsSubstantive(b.text ?? "")));
      row.projecting = true;
      try {
        update.call(this, { ...row.message, content }, row.options);
        return draw.apply(this, args);
      } finally {
        try { update.call(this, row.message, row.options); }
        finally {
          setPublication.call(this, publication.get(this) ?? true);
          row.projecting = false;
        }
      }
    };
  }
  Object.defineProperty(prototype, CALM_PATCH, { value: state });
}
