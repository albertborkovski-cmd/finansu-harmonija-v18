# Infinite table browser regression

Start `npm run dev` and open `/tests/infinite-table-scroll.html`.
This isolated fixture imports the real table footer/hook and does not access application data.

- Initially: 50 rows and `1–50 from 137`; no page buttons.
- Scroll the inner list to the bottom: 100 rows, with Record 1 retained.
- Scroll to the bottom again: 137 rows, no duplicates and no further loading.
- Filter to 12: 12 rows and `1–12 from 12`.
- Reset: 50 rows, list starts at the top.
- Toggle scroll mode: repeat the same checks with whole-page scrolling.

The normal production build does not include this fixture.

## Row action layout regression

Run `node --test tests/row-action-layout.test.mjs tests/table-action-layout.test.mjs`
to check the shared normal-flow CSS contract, automatic left margin, full-width
flex rows, and flexible final grid tracks. Action cells must not regain sticky,
absolute, fixed, or growing positioning.

Start `npm run dev` and open `/tests/fixtures/table-action-layout.html` for an
isolated browser check using the production stylesheet, without application data
or authentication. The four cases cover narrow and overflowing flex/grid rows.
`#layout-result` reports startup and post-mutation bounds assertions; all checks
must pass after hiding/adding columns, resizing columns and the viewport, and
scrolling to the end. Reset restores fixture-only state.

For automated inspection, `window.tableActionFixture.checkLayout()` returns
`{ passed, failures, measurements }`. Viewports use IDs `flex-narrow-viewport`,
`flex-wide-viewport`, `grid-narrow-viewport`, and `grid-wide-viewport`; replace
`viewport` with `row-actions` or `header-actions` to inspect action cells.

Browser checks for Companies, Notifications & Tasks, Settings → Internal Users,
and OCR tables:

- With spare width, actions align to the viewport right edge after all data columns.
- With overflowing columns, actions follow the last data column and scroll normally.
- Hiding, showing, resizing or reordering data columns moves the action cell with them.
- Horizontal scrolling moves data and action cells together, with no overlay.
- Restore any column preferences changed during testing.
- Toolbar, dialog and form actions retain their original layout.
