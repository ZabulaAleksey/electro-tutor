# ElectroTutor language switcher UI

## Scope

The shared Astro shell exposes an icon-only `Languages` control. Existing published
routes remain RU/UK. The locale registry reserves `en` for future content without
creating unpublished English routes. Switching preserves the current semantic path,
query and hash through the existing locale route helper.

## Acceptance

- 44px trigger with accessible A/文-equivalent SVG, no text abbreviation or flag.
- Menu opens below the trigger, supports RU, UK and reserved EN, active checkmark,
  Escape, arrows, Home/End, Tab and outside pointer dismissal.
- Existing RU/UK route navigation and math values are unchanged; unsupported EN falls
  back to the current route rather than exposing hidden content.
- Preference is persisted by the route URL; browser refresh retains the selected locale.
