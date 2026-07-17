# Digital Showcase

Цифровая витрина магазинов одежды. Production-запуск состоит из React SPA, Express API и reverse proxy Nginx; данные и загрузки сохраняются в Docker volumes.

## Развёртывание на VPS

Нужны Linux VPS, Docker Engine с Compose plugin и домен, направленный на IP сервера.

```bash
git clone <repository-url> digital-showcase
cd digital-showcase
cp .env.example .env
openssl rand -hex 32
nano .env
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1/api/health
```

Запишите результат `openssl rand -hex 32` в `JWT_SECRET`, задайте уникальные `ADMIN_EMAIL` и `ADMIN_PASSWORD` (минимум 12 символов), а в `PUBLIC_ORIGIN` укажите публичный origin без завершающего `/`. Первый администратор создаётся только при пустой базе; изменение переменных позднее не меняет его пароль.

Для HTTPS рекомендуется разместить этот Compose за Caddy, Traefik или Nginx хоста с Let's Encrypt. Если TLS-терминатор слушает порт 80, задайте свободный локальный `HTTP_PORT` и проксируйте на него. Открывать наружу порт backend не требуется.

## Обновление

```bash
git pull --ff-only
docker compose up -d --build --remove-orphans
docker image prune -f
```

## Резервное копирование

Остановите backend на время консистентного снимка и сохраните оба volume:

```bash
docker compose stop backend
docker run --rm -v digital-showcase_backend_data:/data -v "$PWD":/backup alpine tar czf /backup/backend-data.tgz -C /data .
docker run --rm -v digital-showcase_backend_uploads:/data -v "$PWD":/backup alpine tar czf /backup/backend-uploads.tgz -C /data .
docker compose start backend
```

Имя volume может отличаться, если Compose запущен с другим project name; точные имена показывает `docker volume ls`. Храните копии вне VPS и регулярно проверяйте восстановление.

## Локальная проверка

```bash
cd backend && npm ci && npm run build
cd ../frontend && npm ci && npm run build
cd .. && docker compose config
```

AI-вызовы по изображениям, голосу и массовая группировка требуют `OPENAI_API_KEY`. Без ключа остаётся локальная эвристическая генерация одиночного текстового черновика; окончательные данные всегда подтверждает владелец.

Оптимизация изображений настраивается переменными `IMAGE_UPLOAD_MAX_BYTES`, `AI_IMAGE_MAX_DIMENSION`, `AI_IMAGE_QUALITY`, `PRODUCT_IMAGE_MAX_DIMENSION`, `PRODUCT_IMAGE_QUALITY` и `PRODUCT_IMAGE_MAX_BYTES`. Значения по умолчанию сохраняют товарные изображения в WebP размером до 2048×2048 и 10 МБ, а в AI отправляют копии до 512×512.
