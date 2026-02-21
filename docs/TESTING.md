# Testing

## Built-in self-check
Use the UI self-check/diagnostics (where available) to validate:
- recipe discovery
- deterministic compile (compile twice, diff = 0)
- safe-merge marker validation

## Recommended golden projects
Maintain a few representative projects for regression:
- minimal page + label
- entity_card + tile_card
- thermostat/media/cover cards
- grid/glance cards
- conditional card

For each, enforce:
- compile output stable (byte-identical)
- export preview/diff correct
- export write uses safe-merge markers only

## Manual smoke checklist (before a release)
1. Panel loads with no console errors
2. Drag/drop basic widgets works
3. Inspector edits reflect on canvas
4. Compile tab updates live while editing
5. Export preview shows diff
6. Export writes only inside marker block
7. Recipe manager: import/clone/export/delete works
8. Cards: drop -> wizard -> bindings behave
