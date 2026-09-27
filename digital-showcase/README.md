# Digital Showcase

Цифровые витрины для магазинов одежды: у каждого магазина каталог по ссылке `https://ваш-домен/m/магазин` с фото, ценами, размерами и наличием, а покупатель пишет продавцу в WhatsApp. Владелец ведёт витрину с телефона (в том числе с ИИ по фото и голосу), администратор подключает магазины, принимает оплату и видит, кому нужна помощь.

Подробнее: [план развития](docs/ROADMAP.md), [зачем это всё](docs/MOTIVATION.md), [архитектура](docs/SYSTEM_ARCHITECTURE.md).

## Из чего состоит

| Сервис | Что делает |
|---|---|
| `nginx` | Принимает HTTP/HTTPS, выбирает сертификат для домена, отдаёт `/api` и `/uploads` бэкенду, остальное — фронтенду. Ботам мессенджеров на ссылках `/m/…` отдаёт превью с фото. |
| `frontend` | React-приложение: лендинг, витрины, кабинет владельца, админка. |
| `backend` | Express API. База SQLite (better-sqlite3, режим WAL) и фото — в Docker volumes `backend_data` и `backend_uploads`. |
| `certbot` | Необязательный: продлевает сертификат Let's Encrypt, если он используется. |

## Развёртывание на VPS

Нужны Linux VPS с Docker Engine и Compose plugin, а для работы по домену — A-запись домена на IP сервера.

```bash
git clone <repository-url> way
cd way/digital-showcase
cp .env.example .env
openssl rand -hex 32   # → JWT_SECRET
nano .env
docker compose up -d --build
docker compose ps
curl -k --fail https://127.0.0.1/api/health
```

В `.env` обязательно:

- `JWT_SECRET` — результат `openssl rand -hex 32`. Без него backend не запустится;
- `ADMIN_EMAIL` и `ADMIN_PASSWORD` (минимум 12 символов) — первый администратор. Создаётся только при пустой базе; дальше пароль меняется в разделе «Аккаунт», а изменение переменных его не трогает;
- `PUBLIC_ORIGIN` — адрес сайта без `/` в конце, например `https://example.ru`;
- `SITE_DOMAIN` — домен сайта (см. ниже).

Остальные настройки (ИИ, Telegram, резервные копии, контакты поддержки) описаны прямо в `.env.example`.

### Домен и сертификат

Сертификат для `SITE_DOMAIN` nginx выбирает при запуске, первым найденный:

1. Купленный: положите `nginx/paid-cert/<домен>.crt` (сертификат вместе с цепочкой) и `nginx/paid-cert/<домен>.key`. Если такая пара одна, `SITE_DOMAIN` можно не задавать — домен возьмётся из имени файла. При продлении замените файлы и выполните `docker compose restart nginx`.
2. Let's Encrypt: задайте `LE_DOMAIN` равным `SITE_DOMAIN`, запустите стек и получите сертификат:
   ```bash
   docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot -d example.ru --email you@example.ru --agree-tos --no-eff-email
   docker compose restart nginx
   ```
   Дальше сервис `certbot` продлевает его сам.
3. Самоподписанный — если нет ни того, ни другого. Сайт работает, но браузер предупреждает. По IP сервера сайт всегда открывается с самоподписанным сертификатом (имя в нём — `SSL_DOMAIN`).

### Первые шаги после запуска

1. Войдите на `/login` с `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Создайте демо-магазин, на который ведёт кнопка «Посмотреть пример» на главной:
   ```bash
   docker compose exec -u node backend npm run demo:seed
   ```
   Кнопки «Написать» в нём ведут на ваши `SUPPORT_WHATSAPP` / `SUPPORT_PHONE`. Поправить товары можно через админку → «Владельцы» → «Демо-магазин» → «Войти как владелец».
3. Впишите свои цены и контакты для лендинга в [`frontend/src/components/landing/config.ts`](frontend/src/components/landing/config.ts), реквизиты для оферты и политики конфиденциальности (`/offer`, `/privacy`) — в [`frontend/src/pages/legal/config.ts`](frontend/src/pages/legal/config.ts), ссылки на видеоинструкции для владельцев (кнопка «Помощь» в кабинете) — в [`frontend/src/components/help/config.ts`](frontend/src/components/help/config.ts). Затем пересоберите: `docker compose up -d --build frontend`. Тексты оферты и политики — шаблоны: покажите их юристу.
4. Подключайте магазины через админку → «Подключить магазин».

## Обновление

```bash
git pull --ff-only
docker compose up -d --build --remove-orphans
docker image prune -f
```

Схема базы обновляется сама при запуске backend: изменения применяются по одному и записываются в таблицу `schema_migrations`.

## Полезные команды

```bash
docker compose exec -u node backend npm run backup                  # сделать резервную копию сейчас
docker compose exec -u node backend npm run admin:reset-password    # пароль админа из ADMIN_PASSWORD, если забыли
docker compose exec -u node backend npm run demo:seed               # демо-магазин /m/demo
docker compose logs -f backend                                      # журнал backend
```

## Резервное копирование

Backend делает копии сам, каждую ночь в `BACKUP_HOUR` (по умолчанию 04:00 по `TZ`):

- копия базы снимается на ходу (SQLite online backup), проверяется открытием и сжимается в `data/backups` — хранятся последние `BACKUP_KEEP_LOCAL` штук;
- если заполнены `BACKUP_S3_*`, копия уходит в объектное хранилище (Yandex Object Storage, Timeweb и другие S3-совместимые) вместе с новыми фото; копии базы там хранятся `BACKUP_KEEP_DAYS` дней, фото — все;
- 1-го числа каждого месяца последняя копия из хранилища скачивается и открывается, как при восстановлении; результат приходит в Telegram;
- неудачная копия — сообщение в Telegram. Состояние копий и кнопка «Сделать копию сейчас» — на главной странице админки.

Без S3 копии лежат на том же сервере: от поломки диска или VPS они не спасут.

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

## Мониторинг и безопасность

- Ошибки 500, неудачные копии и падения backend приходят в Telegram (`TELEGRAM_BOT_TOKEN` и `TELEGRAM_ALERT_CHAT_ID` или `TELEGRAM_CHAT_ID`); одинаковые сообщения — не чаще раза в 10 минут.
- `GET /api/health` отвечает 200, пока база работает, и 503, если нет. Поставьте на `https://ваш-домен/api/health` внешний мониторинг доступности (UptimeRobot, Яндекс Мониторинг и т. п.) — он заметит, если сервер недоступен целиком.
- Вход в админку и кабинет: не больше 10 неверных паролей за 15 минут с одного адреса.
- Backend работает не от root; страницы приложения отдаются с Content-Security-Policy (только свои скрипты и запросы).

## Локальная разработка

Нужен Node.js 22.

```bash
# в .env в корне: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
cd backend && npm ci && npm run dev      # http://localhost:4000
cd frontend && npm ci && npm run dev     # http://localhost:5173, /api проксируется на backend
```

Каталог компонентов интерфейса — `http://localhost:5173/dev/ui` (только в режиме разработки), правила стилей — [STYLE_GUIDE.md](frontend/src/styles/STYLE_GUIDE.md).

Проверки перед коммитом:

```bash
cd backend && npm test && npm run build
cd ../frontend && npm run lint:css && npm run build
```

То же самое при каждом push выполняет GitHub Actions (`.github/workflows/ci.yml` в корне репозитория), плюс собирает Docker-образы, проверяет `docker-compose.yml` и что backend из образа запускается.

## ИИ и фото

ИИ-черновики по фото, голосу и массовая группировка требуют `AI_API_KEY`. Без ключа остаётся простой черновик по тексту; окончательные данные всегда подтверждает владелец. Лимит ИИ-карточек в месяц — `AI_MONTHLY_LIMIT` (или свой у магазина в админке).

Провайдер меняется в `.env` без правки кода: подходит любой совместимый с OpenAI — сама OpenAI (`AI_API_STYLE=responses`) или любой с Chat Completions: OpenRouter, Yandex AI Studio, DeepSeek, локальный сервер (`AI_API_STYLE=chat`, свой `AI_BASE_URL` и `AI_MODEL`). Распознавание голоса можно отправить к другому провайдеру (`AI_TRANSCRIBE_*`) или отключить. После смены — админка → «ИИ-провайдер» → «Проверить». Старые переменные `OPENAI_*` продолжают работать.

Фото товаров сохраняются в WebP до 2048×2048 и 10 МБ, плюс уменьшенные копии 400 и 800 px для витрины; в ИИ уходят копии до 512×512. Браузер уменьшает фото до 2048 px ещё перед отправкой, поэтому nginx принимает запросы до 60 МБ — этого хватает на пачку из 40 фото. Настройки: `IMAGE_UPLOAD_MAX_BYTES`, `AI_IMAGE_MAX_DIMENSION`, `AI_IMAGE_QUALITY`, `PRODUCT_IMAGE_MAX_DIMENSION`, `PRODUCT_IMAGE_QUALITY`, `PRODUCT_IMAGE_MAX_BYTES`.
