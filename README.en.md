# Sage · dsh-expert-sage

> **A general-purpose front workflow for new projects: kickoff to PRD, then hand off to the delivery pipeline.**
> Built on the [expert-team](https://github.com/yangdcm/dsh-expert-team) engine (12 roles / 9 gated phases), Sage adds kickoff → discovery → PRD → optional prototype / tech plan, and keeps the workflow, templates, settings and cockpit in one plugin.

| 12 roles | 9 phases | 99 test files | 0 runtime deps | 0 build steps |
|---|---|---|---|---|

## Why Sage

The team engine answers "how to build it". Three things before that are usually skipped or done thinly:

- **No alignment at kickoff**: scope, boundaries, owner and non-goals stay vague, so delivery reworks;
- **One-size-fits-all research**: the same template runs whether or not there are competitors or compliance rules;
- **PRD as a checklist**: headings are filled, but pain points, highlights, failure definition and acceptance metrics are missing.

Sage turns these into **configurable templates**, not rules baked into one project.

## Default workflow

```text
kickoff (charter draft -> final + solution-stage AGENTS)
   -> discovery (routes trimmed to the project; no competitor quota)
   -> PRD (one file, two states: draft for alignment -> human-signed final)
   -> [optional] prototype / tech plan (only after the final PRD, each item must point back to it)
   -> /team delivery (12 roles / 9 phases)
```

- **One PRD, two states**: the draft may contain open questions; the final requires a human signature recorded in `decisions.md` — an agent cannot declare it final.
- **Trimmable discovery**: internal / users / competitors / policy / tech-form / market.
- **Derived phases gated**: prototype and tech plan do not exist until the PRD is final.
- **Preconditions warn by default**: strict mode (a switch) blocks run creation and `src/` writes before the final PRD.
- **Templates are data**: `workflow/base.yml` plus `software` / `internal-platform` / `tool` presets; switching project type means switching preset, not code.

## Install

```bash
# npm (once published)
dsh plugin --profile <profile> add dsh-expert-sage

# local development (link)
dsh plugin --profile <profile> add link:/path/to/dsh-sage
```

Restart dsh once after installing.

## Quick start

1. Switch to the Sage view;
2. Run `/team` for a delivery run (the expert-team pipeline is unchanged);
3. For the front stage use the skills: `kickoff` -> `discovery` (optional) -> `prd`;
4. Settings -> Sage -> Workflow: template/preset, phase switches, discovery routes, strict mode.

## One cockpit, one settings page

- **One view**: project bar (PRD draft/final badge) + readiness (dimensions, open questions, highlights, conflicts) + missing artifacts + run phases below;
- **One settings group**: the existing settings page, Workflow group (9 items). An unset phase switch means follow the preset;
- **Precedence**: built-in defaults <- global settings <- project `.sage/state.json`.

## Presets

| preset | discovery routes | tech plan | prototype |
|---|---|---|---|
| `base` | internal + users | off | off |
| `software` | + tech-form | off | off |
| `internal-platform` | + policy | on | off |
| `tool` | discovery off | off | off |

Unknown phases, routes, artifacts or skill references fail loudly with the legal values listed, never fall back silently.

## Engine: 12 roles / 9 phases

Delivery uses the expert-team pipeline (`clarify -> research -> design -> spec-review -> plan approval -> implement -> review -> test -> deliver`) with pm / architect / researcher / ui / backend / frontend / dba / sec / reviewer / qa / devops / docs.

Run artifacts live in `<workspace>/team/<run-id>/`; front-stage artifacts live in `tasks/`, `research/` and `docs/`.

## Quality

- **99 test files** (`npm run test:all`, zero dependencies, no install needed) plus a **176-entry mutation catalog**;
- Gates check structure; quality is signed off by a human. Coverage is never rendered as "quality passed".

## Upstream

Sage is a fork of [expert-team](https://github.com/yangdcm/dsh-expert-team); its MIT license and engine design are kept, with the front workflow added on top. Upstream engine fixes are sent back where practical.

## License

MIT
