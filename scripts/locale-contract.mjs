export function flattenLocale(value, prefix = "") {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object" && !Array.isArray(nested)
      ? flattenLocale(nested, path)
      : [[path, nested]];
  });
}

export function validateLocaleCatalogs(catalogs, approvedIdenticalKeys = new Set()) {
  const languages = Object.keys(catalogs);
  if (languages.length < 2) return ["at least two locale catalogs are required"];
  const [referenceLanguage, ...comparedLanguages] = languages;
  const entries = Object.fromEntries(languages.map((language) => [language, new Map(flattenLocale(catalogs[language]))]));
  const expected = [...entries[referenceLanguage].keys()].sort();
  const errors = [];

  for (const language of comparedLanguages) {
    for (const key of expected.filter((key) => !entries[language].has(key))) errors.push(`${language}: missing key ${key}`);
    for (const key of [...entries[language].keys()].filter((key) => !entries[referenceLanguage].has(key))) errors.push(`${language}: extra key ${key}`);
  }
  for (const language of languages) {
    for (const [key, value] of entries[language]) {
      if (typeof value !== "string" || value.trim() === "") errors.push(`${language}: empty/non-string key ${key}`);
    }
  }
  for (const language of comparedLanguages) {
    for (const key of expected) {
      if (entries[referenceLanguage].get(key) === entries[language].get(key) && !approvedIdenticalKeys.has(key)) {
        errors.push(`untranslated key ${key}; add a translation or explicitly approve the identical term`);
      }
    }
  }
  return errors;
}
