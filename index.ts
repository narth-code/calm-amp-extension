// Calm - a standalone conversation-presentation toggle for omp.
//
// Adapted from the Firstmate project's omp Calm port.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// /calm hides thinking, tool rows and short mid-turn working notes so the
// transcript reads as a conversation, and swaps omp's working loader for a small
// sailing boat. Each presentation adapter lives in its own module and probes the
// exact omp component it patches: ./lib/collapsed-thinking.ts (assistant rows),
// ./lib/built-in-tool-shells.ts (tool rows), and ./lib/working-ship.ts (the boat
// and the stock loader it replaces). ./lib/visibility.ts owns the shared
// presentation state and ./lib/preference.ts the local state file.
//
// Calm changes presentation only. It never intercepts, transforms, reroutes,
// removes, or reorders input, tool execution, model context, session storage,
// or export data.
import { loadCalmPreference, persistCalmPreference } from "./lib/preference.ts";
import {
  installCalmBuiltInToolShellLayout,
  installCalmReadToolGroupLayout,
} from "./lib/built-in-tool-shells.ts";
import {
  type CalmMessage,
  calmStoppedForTools,
  installCalmCollapsedThinkingLayout,
} from "./lib/collapsed-thinking.ts";
import { createCalmPresentation } from "./lib/visibility.ts";
import {
  CALM_WORKING_SHIP_WIDGET_KEY,
  createCalmWorkingShipAnimation,
  createCalmWorkingShipWidget,
  installCalmWorkingRow,
} from "./lib/working-ship.ts";

export default function (omp: any) {
  // omp exposes its package exports, including the transcript components, as omp.pi.
  const components: Record<string, any> = omp.pi ?? {};
  const presentation = createCalmPresentation();
  const unavailable: string[] = [];
  const reason = (name: string, error: unknown): string =>
    `${name}: ${error instanceof Error ? error.message : String(error)}`;
  let workingSupported = false;
  let lastCtx: any;

  const workingFailed = (error: unknown): void => {
    if (!workingSupported) return;
    workingSupported = false;
    unavailable.push(reason("working-row", error));
    console.error(`Calm: unavailable presentation adapters: ${unavailable.at(-1)}`);
    if (lastCtx) apply(lastCtx);
  };

  // Each adapter probes the exact omp component it patches. If a future omp
  // removes one, only that adapter degrades; the rest of Calm keeps working.
  const adapters: [string, () => void][] = [
    ["collapsed-thinking", () => installCalmCollapsedThinkingLayout(components.AssistantMessageComponent?.prototype, presentation)],
    ["built-in-tool-shells", () => installCalmBuiltInToolShellLayout(components, presentation)],
    ["read-tool-group", () => installCalmReadToolGroupLayout(components, presentation)],
    ["working-row", () => {
      installCalmWorkingRow(components.InteractiveMode?.prototype, presentation, workingFailed);
      workingSupported = true;
    }],
  ];
  for (const [name, install] of adapters) {
    try { install(); }
    catch (error) { unavailable.push(reason(name, error)); }
  }
  if (unavailable.length) console.error(`Calm: unavailable presentation adapters: ${unavailable.join("; ")}`);

  // One logical agent run, agent_start through agent_end, so the boat never
  // flickers between tool calls inside the same run.
  let runActive = false;
  let shipShown = false;
  let warned = 0;
  // One animation per extension lifetime: hiding the boat freezes it and the next
  // run resumes it. session_start resets it to the initial position.
  const animation = createCalmWorkingShipAnimation();

  const apply = (ctx: any): void => {
    lastCtx = ctx;
    if (!ctx.hasUI) return;
    const show = workingSupported && runActive && presentation.active;
    if (show !== shipShown) {
      shipShown = show;
      ctx.ui.setWidget(CALM_WORKING_SHIP_WIDGET_KEY,
        show ? (tui: any) => createCalmWorkingShipWidget(tui, animation) : undefined);
    }
    if (presentation.active && unavailable.length > warned) {
      ctx.ui.notify(`Calm: unavailable presentation adapters: ${unavailable.slice(warned).join("; ")}`, "warning");
      warned = unavailable.length;
    }
    // Repaint live rows without adding a transcript entry or changing expansion.
    ctx.ui.setStatus("calm", undefined);
  };

  // omp runs extension message_end handlers before its transcript receives the
  // settled message, so a row's first settled draw already finds its step here.
  const noteToolStop = (message: CalmMessage | undefined): void => {
    if (message?.role === "assistant" && message.timestamp !== undefined && calmStoppedForTools(message)) {
      presentation.toolStops.add(message.timestamp);
    }
  };
  // A resumed, switched or branched session replays stored messages without any
  // message_end, so rebuild the record from the stored branch.
  const rebuildToolStops = (ctx: any): void => {
    presentation.toolStops.clear();
    try {
      for (const entry of ctx.sessionManager?.getBranch?.() ?? []) {
        if (entry.type === "message") noteToolStop(entry.message);
      }
    } catch { /* the live message_end record still covers new messages */ }
  };

  omp.on("message_end", (event: any) => noteToolStop(event.message));
  for (const name of ["session_switch", "session_branch", "session_tree"]) {
    omp.on(name, (_event: any, ctx: any) => rebuildToolStops(ctx));
  }
  omp.on("session_start", (_event: any, ctx: any) => {
    rebuildToolStops(ctx);
    presentation.active = loadCalmPreference();
    runActive = false;
    if (shipShown) ctx.ui.setWidget(CALM_WORKING_SHIP_WIDGET_KEY, undefined);
    shipShown = false;
    animation.reset();
    warned = 0;
    apply(ctx);
  });
  omp.on("agent_start", (_event: any, ctx: any) => { runActive = true; apply(ctx); });
  omp.on("agent_end", (_event: any, ctx: any) => { runActive = false; apply(ctx); });
  omp.on("session_shutdown", (_event: any, ctx: any) => { runActive = false; apply(ctx); });

  omp.registerCommand("calm", {
    description: "Toggle Calm: hide thinking, tool rows and working notes from the transcript (presentation only).",
    handler: async (_args: string, ctx: any) => {
      const active = !presentation.active;
      // Persist first, so a toggle that cannot survive a restart fails loudly.
      try { persistCalmPreference(active); }
      catch (error) { ctx.ui.notify(String(error instanceof Error ? error.message : error), "error"); return; }
      presentation.active = active;
      apply(ctx);
      ctx.ui.notify(active ? "Calm on" : "Calm off", "info");
    },
  });
}
