# Frozen V18 workspace

V18 is frozen for testing. All future application improvements belong in ../V19 only.
V18 testing URL: https://albertborkovski-cmd.github.io/finansu-harmonija-v18/.
Dropdown contract: selection must not change trigger height or shift surrounding content. Keep selected labels on one truncated line; menus overlay content. Close on outside pointer and Escape using useDropdownDismiss (or equivalent existing behavior), keeping multi-select menus open when toggling options inside.
Dropdown selection style: every value option reserves an 18px left checkbox with 6px corners; selected fill/border #007EA7, white check (12px, stroke 2.5), selected row #E5EDF9. Keep single-select fields single-select. Reuse SearchableSelect / MultiSelectField / GeneralLedgerAccountSelect / SystemAddFilters; use capture-phase useDropdownDismiss with an additional menu ref for portals. A full-width option row must use role=option or aria-pressed + data-static-selection, never role=checkbox (reserved for the small checkbox control).
V18 local URL: http://127.0.0.1:5199/.
V17 is frozen at commit 33258134b61c6b780851c080f12724774a1935b7 (tag v17).
Never modify V17 or earlier repositories or add them as V18 remotes.
V17 testing: https://albertborkovski-cmd.github.io/finansu-harmonija-v17/.
Table scrolling rule: data rows scroll inside a bounded viewport and column headers stay visible. Use the shared HorizontalTableScrollbar / useFrozenTableHeaders contract for system tables.
Table row actions: always the final non-resizable column after every visible data column. With spare width, align actions to the table viewport's right edge using the shared system-table-row-actions class; when columns overflow, actions follow the final column and scroll with the table (never sticky/fixed over data). Headers and rows must share the same layout. Grid tables use a flexible final action track with a fixed minimum width.
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
Persisted-record lifecycle: never physically delete a referenced/assigned record. Use src/lib/recordLifecycle.ts and recheck at action time, including bulk actions. Linked records become inactive and retain all relationships/history; only unlinked records may be deleted. Render inactive list rows with data-record-inactive and use the shared DeleteButtons linked/inactive props (Power instead of Trash). Preserve inactive flags on edit, import, reload and default-data merging. Keep stricter protected system-role and accounting-history rules. Unsaved form rows and unlink-only actions are not record deletion.
