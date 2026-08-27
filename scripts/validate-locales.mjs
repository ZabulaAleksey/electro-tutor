import { readFile } from "node:fs/promises";
import { flattenLocale, validateLocaleCatalogs } from "./locale-contract.mjs";

const localeFiles = { ru: "src/i18n/ru.json", uk: "src/i18n/uk.json" };
const approvedIdenticalKeys = new Set([
  "diagram.magnitude",
  "services.online",
  "topics.many",
  "topics.one",
  "units.ampere",
  "units.ohm",
  "units.degrees",
  "lesson.topic",
]);

const catalogs = Object.fromEntries(await Promise.all(Object.entries(localeFiles).map(async ([language, file]) => [
  language,
  JSON.parse(await readFile(file, "utf8")),
])));
const entries = Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [language, new Map(flattenLocale(catalog))]));
const expected = [...entries.ru.keys()].sort();
const errors = validateLocaleCatalogs(catalogs, approvedIdenticalKeys);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Locale catalogs valid: ${expected.length} paired keys, ${approvedIdenticalKeys.size} approved identical terms/invariants.`);
}
