// Calm - tool-row presentation adapter.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// omp exports ToolExecutionComponent (one tool call and its result) and
// ReadToolGroupComponent (consecutive reads grouped into one row) through
// `omp.pi`, both with render() and describe() (verified against omp 18.12.3).
// While Calm is on, both draw nothing; execution, settings and stored results
// stay owned by omp. Unlike the Pi version, which matched Pi's seven built-in
// tool names, omp's tool rows are hidden for every tool, including custom ones.
import { type CalmPresentation, installCalmHiddenRows } from "./visibility.ts";

export function installCalmBuiltInToolShellLayout(
  components: Record<string, any>,
  presentation: CalmPresentation,
): void {
  installCalmHiddenRows(components.ToolExecutionComponent?.prototype, presentation);
}

export function installCalmReadToolGroupLayout(
  components: Record<string, any>,
  presentation: CalmPresentation,
): void {
  installCalmHiddenRows(components.ReadToolGroupComponent?.prototype, presentation);
}
