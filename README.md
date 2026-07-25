# Потенциал

Двуязычный интерактивный учебник по электротехнике на React и TypeScript.

## Запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
npm run preview
```

## GitHub Pages

Workflow находится в `.github/workflows/deploy.yml`. После публикации репозитория:

1. Откройте `Settings → Pages`.
2. В `Source` выберите `GitHub Actions`.
3. Отправьте изменения в ветку `main`.

`vite.config.ts` использует относительный `base`, поэтому сборка работает как в корневом домене, так и в подпапке репозитория.
