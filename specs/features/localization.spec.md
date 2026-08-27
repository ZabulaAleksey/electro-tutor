# SPEC: production-контракт локализации RU/UK

Статус: Действует

Версия: 1.0

## Цель

Production artifact «Потенциала» должен публиковать эквивалентные русские и
украинские маршруты. Общий UI, metadata, ошибки и accessible names получают
текст из одного проверяемого locale catalog; учебный MDX-контент остаётся в
парных authored-документах.

## Контракт

- Поддерживаются только route/data codes `ru` и `uk`; fallback для неизвестного
  входного кода — `ru`, но неизвестная локаль не публикуется как маршрут.
- `/` перенаправляет на `/ru/` как default locale.
- Каждый semantic route имеет `canonical`, alternate для `ru` и `uk` и
  `x-default`, указывающий на русскую default-версию.
- Переключатель языка сохраняет semantic path, versioned query и hash.
- Locale catalogs имеют одинаковое дерево непустых ключей. Одинаковые значения
  запрещены, кроме явно перечисленных инвариантов.
- Числа, даты и длительности форматируются через locale-aware helpers. Числа в
  versioned engineering share/readout сохраняют десятичную точку как часть
  стабильного URL/state-контракта.
- Парность учебных материалов проверяется отдельным lesson publication
  contract; формулы и авторский MDX не переносятся в UI catalog.

## Технический glossary

Следующие значения являются языково-инвариантными и не считаются пропущенным
переводом: `Cal.com`, `E-mail`, `Telegram`, `LinkedIn`, `LaTeX`, `RU / UA`,
обозначения `I`, `R`, `Z`, `E`, математические символы `∞`, `∠`, `Ω`, `°`, а
также единицы `A`, `V`, `W`. Термины на естественном языке, включая названия
оси, величины, действия, ошибки и aria-labels, обязаны иметь RU/UK-пару.

## Acceptance criteria

1. Build-time validator отклоняет missing/extra/empty/untranslated keys.
2. Все production RU/UK pages содержат корректные `html[lang]`, metadata,
   canonical и hreflang targets, существующие в artifact.
3. Общая оболочка, страницы, classroom и circular diagram получают строки из
   locale catalog; component-specific authored lesson text может оставаться
   рядом с component при типизированных RU/UK-парах.
4. Unit tests покрывают parity, fallback и locale formatting.
5. Chromium E2E покрывает route matrix и переключение языка с query/hash.

## Non-goals

- новые локали, машинный перевод и новый content model;
- base-path portability, production-домен, CI/deploy;
- изменение формул и содержания опубликованного урока.
