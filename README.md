# Потенциал

`electro-tutor` — русско-украинская образовательная платформа по электротехнике
на Astro с MDX-уроками, формулами KaTeX, React-интерактивом и
PWA-возможностями. Технические коды локалей — `ru` и `uk`.

## Быстрый старт

Требования: Node.js `>=22.12.0`, pnpm `11.23.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Локальный сайт: `http://localhost:4321`.

На Windows при запрете запуска `pnpm.ps1` используй `pnpm.cmd dev` и
аналогично для остальных pnpm-команд.

## Проверки

```bash
pnpm check
pnpm lint
pnpm build
```

Результат production-сборки находится в `dist/` и вручную не редактируется.
Известные проблемы команд зафиксированы в `docs/AI_STATUS.md`.

## Контекст проекта

- требования и критерии приёмки: `specs/README.md`;
- текущее состояние: `docs/AI_STATUS.md`;
- текущий ограниченный этап: `docs/AI_PLAN.md`;
- дорожная карта: `docs/ROADMAP.md`;
- устройство: `docs/ARCHITECTURE.md`;
- дизайн и безопасность: `docs/DESIGN.md`, `docs/SECURITY.md`;
- добавление уроков: `docs/CONTENT_GUIDE.md`.

Чтобы из нового чата выбрать и выполнить один следующий этап, напиши:

```text
Продолжай Electro Tutor
```

Полный протокол находится в `prompts/STAGES.md`.

### Продолжение на другом компьютере

1. Перед переключением убедись, что нужная работа сохранена в commit и отправлена
   в доступный remote; dirty/untracked файлы автоматически не переносятся.
2. Запомни имя рабочей ветки через `git branch --show-current`. На другом
   компьютере сначала проверь `git status --short --branch`, затем выполни
   `git fetch origin`. Переключись через `git switch <branch>`; если локальной
   ветки ещё нет, используй `git switch --track -c <branch> origin/<branch>`.
3. Получи только fast-forward изменения выбранной ветки:

   ```bash
   git pull --ff-only origin <branch>
   ```

   Не применяй reset/clean к неизвестным локальным изменениям.
4. Восстанови зависимости командой `pnpm install --frozen-lockfile`.
5. Выполни `pnpm check:context` и проверь project overlay. В POSIX-shell:

   ```bash
   python ~/.codex/tools/validate_project_overlay.py .
   ```

   В Windows PowerShell:

   ```powershell
   py -3 -B "$HOME/.codex/tools/validate_project_overlay.py" .
   ```

6. Прочитай `docs/AI_STATUS.md` и `docs/AI_PLAN.md`, затем напиши
   `Продолжай Electro Tutor`. Selector из `prompts/STAGES.md` продолжит текущий
   stage либо выберет первый `PLANNED` stage с завершёнными dependencies.

Если `git status` показывает чужую или незавершённую работу, сначала сохрани либо
согласуй её; не выполняй pull поверх конфликтующего dirty worktree.

## Переменные окружения

Скопируй `.env.example` в `.env` и задай нужные публичные значения:

```env
SITE_URL=https://ваш-production-домен
PUBLIC_CALCOM_URL=https://cal.com/ваш-профиль/консультация
```

`SITE_URL` обязателен перед публичным SEO-релизом. Без него сборка использует
резервный `https://electrotutor.example`. `PUBLIC_CALCOM_URL` необязателен: без
него страница услуг показывает локализованный fallback.

## Публикация

- `wrangler.jsonc` описывает Cloudflare Static Assets;
- `.github/workflows/deploy.yml` описывает GitHub Pages;
- основной production-домен и канал ещё требуют решения;
- deploy не выполняется автоматически агентом без явного запроса пользователя.
