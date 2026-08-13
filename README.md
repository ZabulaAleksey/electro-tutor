# Потенциал

`electro-tutor` — русско-украинская образовательная платформа по электротехнике
на Astro с MDX-уроками, формулами KaTeX, React-интерактивом и
PWA-возможностями. Технические коды локалей — `ru` и `uk`.

## Быстрый старт

Требования: Node.js `>=22.12.0`, npm 10+.

```bash
npm install
npm run dev
```

Локальный сайт: `http://localhost:4321`.

На Windows при запрете запуска `npm.ps1` используй `npm.cmd run dev` и
аналогично для остальных npm-команд.

## Проверки

```bash
npm run check
npm run lint
npm run build
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

Полный протокол находится в `prompts/STAGED_PROMPTS.md`.

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
