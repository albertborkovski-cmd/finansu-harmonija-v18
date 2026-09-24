# Frozen V17 release

V17 is frozen for testing (tag v17). Do not make further application changes here.
All future improvements belong in ../V18 only. Read ../V18/AGENTS.md before editing.
V17 testing: https://albertborkovski-cmd.github.io/finansu-harmonija-v17/.
Table scrolling rule: data rows scroll inside a bounded viewport and column headers stay visible. Use the shared HorizontalTableScrollbar / useFrozenTableHeaders contract for system tables.
Table selection rule: select-all affects every eligible filtered record, not only loaded rows. Store explicit stable record IDs. Search, filtering and clearing filters must preserve selection. Deselect-all removes only filtered IDs; use src/lib/tableSelection.ts for this behavior.
V17 runs at http://127.0.0.1:5198/.
V17 was created from frozen V16 commit 1aef121a0c750afc28cf87735c808dafcbb64d21 (tag v16).
V16 and earlier versions are frozen. Never modify them or add their repositories as V17 remotes.
V16 testing: https://albertborkovski-cmd.github.io/finansu-harmonija-v16/.
V16 runs at http://127.0.0.1:5197/.
V16 was created from frozen V15 commit 0f2280d63a4c95c40e319905d4128ec5605dd903 (tag v15).
V15 is frozen. Do not make application changes in V15 or earlier versions.
V15 testing: https://albertborkovski-cmd.github.io/finansu-harmonija-v15/.
V14 is frozen at bb4385c, tag v14: https://albertborkovski-cmd.github.io/finansu-harmonija-v14/.
V13 is frozen at commit fa07b75, tag v13, and published at https://albertborkovski-cmd.github.io/finansu-harmonija-v13/.
Do not add V15 or earlier GitHub repositories as V16 remotes. Never push V16 changes to frozen repositories.
Local .env, .meso-shared-data.json, node_modules, and build output remain untracked.
