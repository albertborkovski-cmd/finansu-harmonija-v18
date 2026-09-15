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

Run `node --test tests/row-action-layout.test.mjs` to check the shared normal-flow
CSS contract and prevent explicit table action wrappers from regaining sticky,
absolute, automatic-margin, or flexible-spacer positioning.

Browser checks for Companies, Notifications & Tasks, Settings → Internal Users,
and OCR tables:

- Actions follow the last visible data column with both narrow and wide tables.
- Hiding, showing, resizing or reordering data columns moves the action cell with them.
- Horizontal scrolling moves data and action cells together, with no overlay.
- Restore any column preferences changed during testing.
- Toolbar, dialog and form actions retain their original layout.
