# PSP Platform

Монорепозиторий из двух частей:

- `psp-backend` — Express + Prisma + PostgreSQL
- `psp-admin-ui` — Vite + React

## Локальный запуск

### Backend

```bash
cd psp-backend
npx prisma migrate dev
npx prisma generate
npm run dev
```

### Frontend

```bash
cd psp-admin-ui
npm run dev
```

## GitHub

В корне уже подготовлен обычный git-репозиторий. Дальше:

```bash
git add .
git commit -m "Initial PSP platform"
git branch -M main
git remote add origin https://github.com/<your-name>/<your-repo>.git
git push -u origin main
```

## Деплой

### Frontend: Vercel

Проект для Vercel: `psp-admin-ui`

Переменные окружения:

- `VITE_API_BASE_URL=https://<your-render-backend>.onrender.com`

Если используешь SPA-роутинг, `vercel.json` уже добавлен.

### Backend: Render

В корне уже лежит `render.yaml`.

Нужно:

1. Создать новый Render Blueprint из GitHub-репозитория
2. Подтвердить создание:
   - `psp-backend` web service
   - `psp-db` Postgres database
3. После первого деплоя проверить `/health`
4. Обновить значения:
   - `CHECKOUT_BASE_URL`
   - `ALLOWED_ORIGINS`
   - `UPSTREAM_WEBHOOK_URL`

## Важные env переменные backend

Смотри шаблон в `psp-backend/.env.example`.

Минимально нужны:

- `DATABASE_URL`
- `CARD_ENC_KEY`
- `WEBHOOK_SECRET`
- `MERCHANT_PORTAL_SECRET`
- `PSP_ADMIN_SECRET`

## Рекомендуемый порядок

1. Запушить код в GitHub
2. Поднять backend и Postgres на Render
3. Получить URL backend
4. Поднять frontend на Vercel с `VITE_API_BASE_URL`
5. Вернуться в Render и обновить:
   - `CHECKOUT_BASE_URL`
   - `ALLOWED_ORIGINS`
   - `UPSTREAM_WEBHOOK_URL`
