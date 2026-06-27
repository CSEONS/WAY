# Digital Showcase

Full-stack сервис цифровых витрин магазинов одежды. Это не интернет-магазин: в проекте нет корзины, заказов, онлайн-оплаты, доставки и регистрации посетителя. Посетитель только смотрит товары физического магазина и контакты.

## Технологии

- Frontend: React, TypeScript, Vite, React Router, Axios, CSS.
- Backend: Node.js, Express, TypeScript, controllers/routes/services/middleware, SQLite, JWT, bcrypt, multer.
- Инфраструктура: Docker Compose, Nginx, volumes для SQLite и uploads.

## Структура

```txt
digital-showcase/
  frontend/
  backend/
  nginx/
  docker-compose.yml
  README.md
```

## Локальный запуск

Backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend будет доступен на `http://localhost:5173`, backend на `http://localhost:4000`.

## Запуск через Docker Compose

```bash
docker compose up --build
```

После запуска откройте `http://localhost`.

## Тестовый администратор

При первом запуске создается администратор:

```txt
email: admin@example.com
password: admin123
role: ADMIN
```

После первого входа замените пароль через API или пересоздайте администратора с безопасным паролем.

## Основные команды

```bash
npm run dev
npm run build
npm start
```

## Как создать владельца

1. Войдите на `/login` под администратором.
2. Откройте `/admin`.
3. В форме "Создать владельца" укажите имя, email или телефон и пароль.

Владелец не может зарегистрироваться самостоятельно.

## Как создать магазин

1. В админке выберите владельца.
2. Укажите название и `slug`, например `gehi-style`.
3. Укажите дату окончания подписки или позже нажмите `+30 дней`.

Публичная ссылка будет иметь вид `/m/gehi-style`.

## Как продлить подписку

В списке магазинов в админке нажмите `+30 дней`. API-эндпоинт:

```http
POST /api/admin/stores/:id/extend-subscription
Content-Type: application/json

{ "days": 30 }
```

Если магазин выключен или подписка истекла, публичная витрина вернет:

```json
{ "message": "Магазин временно недоступен" }
```

## Как загрузить товар

1. Войдите владельцем.
2. Откройте `/dashboard/products/new`.
3. Заполните название, описание, цену или текст цены, категорию, размеры, цвета, статус и видимость.
4. Прикрепите изображение в формате jpg, jpeg, png или webp до 5 MB.

Скрытый товар (`isVisible = false`) не отображается на публичной витрине.

## API

Auth:

```txt
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
```

Admin:

```txt
GET /api/admin/owners
POST /api/admin/owners
GET /api/admin/owners/:id
PATCH /api/admin/owners/:id
DELETE /api/admin/owners/:id
GET /api/admin/stores
POST /api/admin/stores
GET /api/admin/stores/:id
PATCH /api/admin/stores/:id
DELETE /api/admin/stores/:id
POST /api/admin/stores/:id/extend-subscription
POST /api/admin/stores/:id/disable
POST /api/admin/stores/:id/enable
```

Owner:

```txt
GET /api/owner/store
PATCH /api/owner/store
GET /api/owner/products
POST /api/owner/products
GET /api/owner/products/:id
PATCH /api/owner/products/:id
DELETE /api/owner/products/:id
POST /api/owner/products/:id/images
DELETE /api/owner/products/:id/images/:imageId
```

Public:

```txt
GET /api/public/stores/:slug
GET /api/public/stores/:slug/products
GET /api/public/stores/:slug/products/:productId
```

## Переменные окружения

Backend:

```env
PORT=4000
JWT_SECRET=change_me
DATABASE_URL=file:/app/data/database.sqlite
UPLOAD_DIR=/app/uploads
CORS_ORIGIN=http://localhost
```

Frontend:

```env
VITE_API_URL=/api
```
