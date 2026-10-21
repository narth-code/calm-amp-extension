// Calm - shared presentation state and row-hiding plumbing.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// This module owns the in-memory presentation state every adapter reads, and the
// generic "draw nothing while Calm is on" wrapper the tool-row and working-row
// adapters share. Presentation filtering never deletes or alters semantic,
// session, or export data: wrappers only change what a row draws.

/** Node shape omp's transcript components return from describe(). */
export type CalmNode = { k: string; p?: Record<string, unknown>; c?: CalmNode[] };

// toolStops holds the timestamp of every assistant message whose model step stopped
// to call tools. omp hands transcript rows only the text segments of such a message,
// each stamped stopReason "stop" with the tool calls removed, so a row cannot tell a
// working note from the final reply on its own. The segments keep the original
// timestamp, which is how a row finds out here.
export type CalmPresentation = { active: boolean; toolStops: Set<number> };

export function createCalmPresentation(): CalmPresentation {
  return { active: false, toolStops: new Set() };
}

// The symbol lives on each patched prototype, so /reload cannot stack wrappers;
// a reinstall only rebinds the patch to the new extension lifetime's state.
export const CALM_PATCH = Symbol.for("calm:omp-presentation:v1");

export const calmEmptyNode = (): CalmNode => ({ k: "col", c: [] });

/** Throw a clear diagnostic when omp no longer exports the seam an adapter patches. */
export function calmRequireMethods(prototype: any, names: string[]): void {
  if (!prototype) throw new Error("component not exported");
  for (const name of names) {
    if (typeof prototype[name] !== "function") throw new Error(`missing ${name}`);
  }
}

/** Make every row of one component class draw nothing while Calm is on. */
export function installCalmHiddenRows(prototype: any, presentation: CalmPresentation): void {
  calmRequireMethods(prototype, ["render", "describe"]);
  if (Object.hasOwn(prototype, CALM_PATCH)) { prototype[CALM_PATCH].presentation = presentation; return; }
  const state = { presentation };
  for (const method of ["render", "describe"]) {
    const draw = prototype[method];
    prototype[method] = function (...args: any[]) {
      return state.presentation.active ? (method === "render" ? [] : calmEmptyNode()) : draw.apply(this, args);
    };
  }
  Object.defineProperty(prototype, CALM_PATCH, { value: state });
}
