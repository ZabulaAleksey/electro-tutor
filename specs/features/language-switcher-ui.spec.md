# ElectroTutor language switcher UI

## Scope

The shared Astro shell exposes an icon-only `Languages` control. Existing published
routes remain RU/UK. The locale registry reserves `en` for future content without
creating unpublished English routes. Switching preserves the current semantic path,
query and hash through the existing locale route helper.

## Acceptance

- 44px trigger with accessible A/文-equivalent SVG, no text abbreviation or flag.
- Menu opens below the trigger, exposes only published RU/UK, active checkmark,
  Escape, arrows, Home/End, Tab and outside pointer dismissal.
- Existing RU/UK route navigation and math values are unchanged; EN is type-level only
  until content is published. The Russian-only public MVP keeps its existing hidden-route boundary.
- Preference is persisted in localStorage, restored at neutral root entry in full builds;
  explicit locale URLs always win. Missing/blocked storage keeps Russian default.
- Real worker busy states in transmission labs use a compact themed indeterminate
  operation panel. No server stages, percentages or changes to equations/calculation logic.
- Existing browser route assertions remain; tests open the new menu before selecting a locale.
- Verify light/dark at 320/375/768/1440, keyboard, dismissal, route/query/hash, storage,
  full-build local tests and public-MVP artifact containment. No production publication.
