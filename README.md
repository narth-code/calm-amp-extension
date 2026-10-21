# Calm for omp

`/calm` toggles a conversation-only view in [omp](https://github.com/can1357/oh-my-pi). While it is on:

- thinking blocks are hidden
- tool calls and their results are hidden
- short "working notes" the model writes between tool calls are hidden; notes with a line break or 240+ characters stay visible
- omp's `Working…` line is replaced by a small sailing boat

Calm changes presentation only. Input, tool execution, model context, session storage and exported data are never altered. The on/off choice is saved in `~/.omp/agent/calm` (or `$PI_CODING_AGENT_DIR/calm`), which is local state and never tracked in this repo.

Adapted from the Firstmate project's omp Calm port, from Kun Chen's [Pi version](https://github.com/kunchenguid/dotfiles/tree/9a4a6387d0dd6f4bf9b8a5a732b406916bbbf95d/home/.pi/agent/extensions/calm). MIT licensed, see [LICENSE](LICENSE).

## Install

omp loads every extension folder under `~/.omp/agent/extensions/`, so clone this repo there as `calm`:

```bash
git clone https://github.com/narth-code/calm-amp-extension.git ~/.omp/agent/extensions/calm
```

Restart omp (or run `/reload`), then type `/calm`. To update later, run `git -C ~/.omp/agent/extensions/calm pull`.

This repo is published from narth-code's personal dotfiles, where the extension lives at `home/.omp/agent/extensions/calm`. Make changes there; this repo is refreshed from it.

## Files

The layout mirrors the Pi version file for file, so the two can be compared side by side.

| File | Pi version | omp version |
|---|---|---|
| `index.ts` | Wires adapters; hides the stock loader with `setWorkingVisible()` | Wires adapters from `omp.pi`; tracks which steps stopped for tools |
| `lib/visibility.ts` | Global on/off flag, plus a flag forcing stock output during `/export` | Shared presentation state and the generic "draw nothing" row wrapper |
| `lib/collapsed-thinking.ts` | Patches `AssistantMessageComponent` to drop collapsed thinking | Same component; also drops short mid-turn working notes |
| `lib/built-in-tool-shells.ts` | Hides the shell of Pi's 7 built-in tools only | Hides `ToolExecutionComponent` and `ReadToolGroupComponent` rows for every tool |
| `lib/working-ship.ts` | The boat animation | The boat animation, plus the adapter hiding omp's stock loader |
| `lib/preference.ts` | State file under `~/.pi/agent` | State file under `~/.omp/agent` |

## How it hooks into omp

omp gives extensions its package exports as `omp.pi`. Calm wraps methods on these component prototypes (verified against omp 18.12.3):

| Component | Methods wrapped | Purpose |
|---|---|---|
| `AssistantMessageComponent` | `updateContent`, `render`, `describe`, `setMidStreamPublication` | Project a message without thinking and working notes while drawing, then restore it |
| `ToolExecutionComponent` | `render`, `describe` | Hide tool rows |
| `ReadToolGroupComponent` | `render`, `describe` | Hide grouped read rows |
| `InteractiveMode` | `ensureLoadingAnimation` | Hide the stock working loader |

Each adapter checks that its methods exist before patching. If a future omp removes one, only that adapter is skipped, and omp prints `Calm: unavailable presentation adapters: ...`. A marker symbol on each patched prototype keeps `/reload` from stacking wrappers.

## Differences from the Pi version

- **Tool rows:** Pi hid only its 7 built-in tools (read, bash, edit, write, grep, find, ls). omp hides every tool row, including custom tools.
- **Working notes:** new in omp. Pi had no equivalent.
- **Export:** Pi forced the full transcript while `/export` or `/share` rendered. omp does not, so turn Calm off before exporting if you want tool rows in the export. The exported data itself is never changed.
- **Redraw:** Pi toggled tool expansion twice to force a repaint. omp repaints by clearing a status entry (`setStatus("calm", undefined)`).

## Testing

The test suite lives in the dotfiles repo, at `tests/omp-calm.test.sh`. Its unit checks run inside omp's own runtime by loading a probe extension, so Node is not required. To try it by hand, run `omp`, type `/calm`, then ask for something that uses a tool.
