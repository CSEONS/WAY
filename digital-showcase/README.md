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

Запишите результат `openssl rand -hex 32` в `JWT_SECRET` (без него backend в production не запустится), задайте уникальные `ADMIN_EMAIL` и `ADMIN_PASSWORD` (минимум 12 символов), а в `PUBLIC_ORIGIN` укажите публичный origin без завершающего `/`. Первый администратор создаётся только при пустой базе; дальше пароль меняется в разделе «Аккаунт», а изменение переменных его не трогает. Если пароль администратора утерян, впишите новый в `ADMIN_PASSWORD` и выполните:

```bash
docker compose exec backend npm run admin:reset-password
```

Схема базы обновляется сама при запуске backend: применённые изменения записываются в таблицу `schema_migrations`.

Для HTTPS рекомендуется разместить этот Compose за Caddy, Traefik или Nginx хоста с Let's Encrypt. Если TLS-терминатор слушает порт 80, задайте свободный локальный `HTTP_PORT` и проксируйте на него. Открывать наружу порт backend не требуется.

## Обновление

```bash
git pull --ff-only
docker compose up -d --build --remove-orphans
docker image prune -f
```

## Резервное копирование

Backend делает копии сам, каждую ночь в `BACKUP_HOUR` (по умолчанию 04:00 по `TZ`):

- копия базы снимается на ходу (SQLite online backup), проверяется открытием и сжимается в `data/backups` — хранятся последние `BACKUP_KEEP_LOCAL` штук;
- если заполнены `BACKUP_S3_*`, копия уходит в объектное хранилище (Yandex Object Storage, Timeweb и другие S3-совместимые) вместе с новыми фото; копии базы там хранятся `BACKUP_KEEP_DAYS` дней, фото — все;
- 1-го числа каждого месяца последняя копия из хранилища скачивается и открывается, как при восстановлении; результат приходит в Telegram;
- неудачная копия — сообщение в Telegram. Состояние копий и кнопка «Сделать копию сейчас» — на главной странице админки.

Без S3 копии лежат на том же сервере: от поломки диска или VPS они не спасут. Сделать копию вручную:

```bash
docker compose exec backend npm run backup
```

### Восстановление

```bash
docker compose stop backend
# последняя копия из хранилища + недостающие фото
docker compose run --rm backend npm run backup:restore -- --latest --photos
# или локальная копия с сервера
docker compose run --rm backend npm run backup:restore -- /app/data/backups/database-2026-10-01T01-00-00Z.sqlite.gz
docker compose start backend
```

Текущая база перед восстановлением сохраняется рядом как `database.sqlite.before-restore-<время>`.

## Мониторинг

- Ошибки 500, неудачные копии и падения backend приходят в Telegram (`TELEGRAM_BOT_TOKEN` и `TELEGRAM_ALERT_CHAT_ID` или `TELEGRAM_CHAT_ID`); одинаковые сообщения — не чаще раза в 10 минут.
- `GET /api/health` отвечает 200, пока база работает, и 503, если нет. Поставьте на `https://ваш-домен/api/health` внешний мониторинг доступности (UptimeRobot, Яндекс Мониторинг и т. п.) с оповещением — он заметит, если сервер недоступен целиком.
- Вход в админку и кабинет: не больше 10 неверных паролей за 15 минут с одного адреса.

## Локальная проверка

```bash
cd backend && npm ci && npm test && npm run build
cd ../frontend && npm ci && npm run lint:css && npm run build
cd .. && docker compose config
```

То же самое при каждом push выполняет GitHub Actions (`.github/workflows/ci.yml` в корне репозитория), плюс собирает Docker-образы и проверяет, что backend из образа запускается.

AI-вызовы по изображениям, голосу и массовая группировка требуют `OPENAI_API_KEY`. Без ключа остаётся локальная эвристическая генерация одиночного текстового черновика; окончательные данные всегда подтверждает владелец.

Оптимизация изображений настраивается переменными `IMAGE_UPLOAD_MAX_BYTES`, `AI_IMAGE_MAX_DIMENSION`, `AI_IMAGE_QUALITY`, `PRODUCT_IMAGE_MAX_DIMENSION`, `PRODUCT_IMAGE_QUALITY` и `PRODUCT_IMAGE_MAX_BYTES`. Значения по умолчанию сохраняют товарные изображения в WebP размером до 2048×2048 и 10 МБ, а в AI отправляют копии до 512×512. Браузер уменьшает фото до 2048 px ещё перед отправкой, поэтому nginx принимает запросы до 60 МБ — этого хватает на пачку из 40 фото.
