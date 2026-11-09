# System Architecture

Документ описывает архитектуру существующего проекта цифровой витрины.

## Общая схема

Browser
↓
React SPA
↓
API client
↓
REST API
↓
Express
↓
Controller
↓
Service
↓
Database / Static files

## Backend

### Обзор

Backend реализован на Express. Сервер принимает HTTP-запросы, проверяет авторизацию и роль, обрабатывает файлы и выполняет бизнес-логику через сервисы.

### Маршруты

- `POST /api/auth/login` — вход пользователя.
- `GET /api/auth/me` — получение данных текущего пользователя.
- `POST /api/auth/logout` — выход.
- `GET /api/admin/owners`, `POST /api/admin/owners`, `GET /api/admin/owners/:id`, `PATCH /api/admin/owners/:id`, `POST /api/admin/owners/:id/change-password`, `DELETE /api/admin/owners/:id` — управление владельцами.
- `GET /api/admin/stores`, `POST /api/admin/stores`, `GET /api/admin/stores/:id`, `PATCH /api/admin/stores/:id`, `DELETE /api/admin/stores/:id` — управление магазинами.
- `POST /api/admin/stores/:id/extend-subscription` — продление подписки.
- `POST /api/admin/stores/:id/disable`, `POST /api/admin/stores/:id/enable`, `POST /api/admin/stores/:id/archive`, `POST /api/admin/stores/:id/restore` — переключение активности магазина.
- `POST /api/admin/stores/:id/enable-ai-form`, `POST /api/admin/stores/:id/disable-ai-form` — управление AI-формой магазина.
- `GET /api/owner/stores`, `GET /api/owner/stores/:storeId`, `PATCH /api/owner/stores/:storeId` — получение и редактирование магазина владельца.
- `POST /api/owner/stores/:storeId/logo` — загрузка и оптимизация логотипа магазина.
- `GET /api/owner/stores/:storeId/analytics` — получение аналитики магазина.
- `GET /api/owner/stores/:storeId/subscription` — «Подписка и оплата»; поле `online` — цена тарифа и сроки для онлайн-оплаты (null — только через администратора).
- `POST /api/owner/stores/:storeId/online-payments` (`months` — тариф или `packageId` — пакет) — платёж в ЮKassa, в ответе `confirmationUrl` для перехода; `POST /api/owner/stores/:storeId/online-payments/:paymentId/check` — статус после возврата из ЮKassa.
- `POST /api/yookassa/notifications` — HTTP-уведомления ЮKassa (`payment.succeeded`, `payment.canceled`), без входа; статус перепроверяется в API ЮKassa.
- `GET /api/push` — ключ сервера для подписки браузера; `POST /api/push/subscriptions` (подписка браузера, `welcome` — сразу «Уведомления включены»), `DELETE /api/push/subscriptions` (`endpoint`), `POST /api/push/test` — уведомления на телефоне владельца. Только владелец и не при входе админа от его имени.
- `GET /api/owner/stores/:storeId/products`, `POST /api/owner/stores/:storeId/products`, `GET /api/owner/stores/:storeId/products/:id`, `PATCH /api/owner/stores/:storeId/products/:id`, `DELETE /api/owner/stores/:storeId/products/:id` — управление товарами владельца.
- `POST /api/owner/stores/:storeId/products/ai-draft` — создание AI-черновика товара по фото, голосу или тексту; хватает любого из них. Только фото присылает «Сгенерировать карточку» в режиме «Авто» (`product-form/aiDraft.ts`). С `field` (`title` / `description` / `category` / `colors`) и `known` (JSON с уже введёнными названием, описанием, категорией) ИИ заполняет одно поле — режим «Вручную + ИИ»; хватает фото или текста в других полях.
- `POST /api/owner/stores/:storeId/products/bulk-ai-draft` — группировка до 40 изображений и создание списка AI-предложений товаров.
- `POST /api/owner/stores/:storeId/products/ai-preview` — «Превью с ИИ»: обложка для витрины по одному фото товара (файл `image` или адрес сохранённого фото `imageUrl`) и настройкам `options` (фон, цвета оформления, надписи, преимущества). Отвечает картинкой `data:image/webp`; в товар она попадает, только когда владелец сохранит товар.
- `POST /api/owner/stores/:storeId/products/:id/images`, `PATCH /api/owner/stores/:storeId/products/:id/images/order`, `DELETE /api/owner/stores/:storeId/products/:id/images/:imageId` — управление изображениями товара.
- `GET /api/owner/store`, `PATCH /api/owner/store`, `GET /api/owner/products`, `POST /api/owner/products/ai-draft`, `POST /api/owner/products`, `GET /api/owner/products/:id`, `PATCH /api/owner/products/:id`, `DELETE /api/owner/products/:id` — альтернативные маршруты с автоматическим выбором магазина владельца.
- `GET /api/public/stores/:slug` — получение публичного магазина.
- `GET /api/public/stores/:slug/products` — получение списка продуктов публичной витрины.
- `GET /api/public/stores/:slug/products/:productId` — получение карточки публичного товара.

### Контроллеры

- `authController.ts` — логин, получение информации о текущем пользователе, выход.
- `adminController.ts` — управление владельцами и магазинами, продление подписки, переключение активности и AI-формы.
- `ownerController.ts` — операции владельца: получение магазина, списка товаров, аналитики, создание/редактирование/удаление товара, загрузка изображений и логотипа, одиночный и массовый AI-черновик.
- `publicController.ts` — публичный доступ к магазину и товарам, проверка доступности подписки и запись просмотров.

### Сервисы

- `authService.ts` — проверка логина, сравнение пароля, генерация JWT, получение пользователя по идентификатору.
- `userService.ts` — CRUD для владельцев, поиск пользователя по логину, получение пользователя по идентификатору.
- `storeService.ts` — CRUD магазинов, получение магазинов владельца, проверка подписки, продление подписки, получение магазина по slug.
- `productService.ts` — CRUD товаров, чтение связанных изображений/размеров/цветов/вариантов, управление изображениями и их порядком.
- `analyticsService.ts` — запись просмотров магазина и товара, вычисление количества просмотров.
- `aiDraftService.ts` — генерация одиночных и массовых предложений товара на основе текста, голосовой записи и оптимизированных изображений через AI API.
- `bulkDraftService.ts` — массовая раскладка в фоне: фото (как загружены) и `job.json` со статусом `RUNNING` / `DONE` / `ERROR` и ответом AI лежат в `data/bulk-drafts/<id>` (не в базе и не в резервных копиях). Страница спрашивает статус каждые несколько секунд с `?watch=1`; если её никто не смотрит, по готовности владельцу уходит уведомление со ссылкой `…/products/bulk?draft=<id>`. При старте сервера незаконченные раскладки становятся ошибкой (с уведомлением), раскладки старше 3 дней удаляются раз в час.
- `aiUsageService.ts` и `aiPrices.ts` — лимит ИИ-карточек в месяц, учёт запросов (токены и модель) и расход в рублях: цены моделей в долларах × курс из «Настроек». Сначала тратится месячный лимит тарифа, потом докупленное в пакетах (`stores.extraPreviews` / `extraFills`; у каждой записи `ai_usage` — `planUnits` и `packageUnits`).
- `openaiUsageService.ts` — траты организации OpenAI по дням (UTC) из официального Usage/Costs API (`GET /v1/organization/costs` — доллары, `GET /v1/organization/usage/completions` — токены и запросы; страницы по `next_page`), ключ `OPENAI_ADMIN_KEY` (Admin-ключ организации), ответы кэшируются на 5 минут. `aiUsageService.spendByDay` отдаёт их админке (`GET /api/admin/ai/spend/days?days=7|30|90`), а без ключа или при ошибке OpenAI — оценку по `ai_usage`.
- `packageService.ts` — пакеты (таблица `packages`): разовые докупки к тарифу — ИИ-превью, карточки с ИИ, услуга администратора. Запросы владельцев и продажи — `package_orders` (REQUESTED → PAID/DONE, DECLINED, CANCELLED) с копией пакета; продажа — запись в `payments` с `packageName` (месяцев 0, дата подписки не меняется), отмена такой оплаты забирает неистраченный остаток. Миграция 12.
- `onlinePaymentService.ts` и `utils/yookassa.ts` — онлайн-оплата тарифа и пакетов владельцем через ЮKassa (ключи `YOOKASSA_*` в `.env`): попытка в `online_payments`, платёж в ЮKassa с переходом на её страницу и возвратом на «Подписка и оплата». Статус всегда читается из API ЮKassa ключом магазина — тело уведомления не принимается на веру. Оплаченная попытка продлевает подписку через `paymentService.acceptPayment` или выдаёт пакет через `packageService.sellPackage` (копия пакета на момент оплаты; открытый запрос на тот же пакет становится этой покупкой) — способ `ONLINE`, ровно один раз, кто бы ни узнал об оплате первым: уведомление ЮKassa, возврат владельца или открытие «Подписки» (ожидающие попытки за сутки переспрашиваются). Чек по 54-ФЗ передаётся в платеже, если `YOOKASSA_RECEIPTS=on`. Миграции 20 и 21.
- `imageModerationService.ts` — проверка фото товаров и логотипов на лица людей и животных (ИИ; тело без лица не считается) и статусы модерации (таблица `image_checks`): покупателям не отдаются только фото «Скрыто»; «На проверке» видны до решения. Решения модератора: «Показывать», «Скрыть фото», «Снять товар» (`products.blockedAt`: товар не виден покупателям при любом переключателе владельца) и «Вернуть на витрину». Каждая находка и каждое решение — уведомление владельцу.
- `subscriptionReminderService.ts` — напоминания об оплате в колокольчик владельца: за неделю и за день до даты оплаты, когда она прошла, в последний день витрины и сразу после закрытия (не позже 3 дней — давно закрытым не пишет). Проверка раз в час днём (9–21, `notificationService.isDaytime`), как у итогов месяца; каждое напоминание — один раз на дату оплаты (`stores.subscriptionReminder`), непрочитанное заменяется следующим (тема `subscription:<storeId>`), продление — «Оплата получена» / «Подписка продлена» — заменяет напоминание. Текст зависит от того, пробный ли период и можно ли оплатить онлайн. Миграция 22.
- `notificationService.ts` — уведомления (колокольчик в шапке, таблица `notifications`): от системы (проверка фото) и от админа (`POST /api/admin/notifications`, одному магазину или всем владельцам). Непрочитанное на ту же тему заменяется новым. Каждое уведомление уходит и на телефоны получателя (`pushService`), не задерживая ответ. API владельца — `GET /api/notifications`, `POST /api/notifications/read`.
- `pushService.ts` — уведомления на телефоне (Web Push): подписки браузеров в `push_subscriptions` (по одной на устройство, адрес push-сервиса и ключи; при входе другого владельца адрес переходит к нему, выход его убирает), ключи VAPID создаются при первом обращении и лежат в `settings` (`pushKeys`). Сообщение шифруется `web-push` и отправляется `fetch`: TTL 3 дня, заголовок `Topic` из темы уведомления, ответ 404/410 удаляет подписку. Принимаются только адреса https на публичном имени — не IP и не имена внутренней сети. Показывает уведомление и открывает страницу по нажатию `frontend/public/sw.js` (регистрируется, только когда владелец включает уведомления; запросы не перехватывает). Миграция 24. Находки «Превью с ИИ» приходят вместе с загрузкой обложки и сразу отправляют товар на проверку. API модерации — `/api/moderation` (`moderatorOnly`, пока только админ).
- `planService.ts` — тарифы (таблица `plans`): цена, описание, пункты, ИИ и его лимит, видимость на лендинге; у магазина `planId`, его `aiFormEnabled` — копия `aiEnabled` тарифа.
- `settingsService.ts` — настройки из админки (таблица `settings`; разделы «Тарифы и цены», «Контакты», «Видеоинструкции», «Реквизиты», «Настройки ИИ»): тарифы, пробный период, модели и лимиты ИИ, курс, контакты, реквизиты, видео. Сохранённое важнее значений из `.env`; публичная часть — `GET /api/public/site`.
- `imageService.ts` — серверная оптимизация, сохранение и удаление изображений товаров и логотипов.

### Middleware

- `authMiddleware.ts` — проверка JWT токена и установка пользователя в запросе.
- `adminOnly` и `ownerOnly` — проверка роли текущего пользователя.
- `upload.ts` — обработка загрузки файлов: изображения товаров и голосовых файлов.

### База данных

- Хранится в файле SQLite через `sql.js`.
- Инициализация и доступ выполняются в `database/db.ts`.
- В таблицах хранятся:
  - `users` — пользователи с ролью `ADMIN` или `OWNER`.
  - `stores` — магазины с `slug`, `isActive`, `aiFormEnabled`, `subscriptionEndsAt`.
  - `products` — товары с `status`, `isVisible`, `category`, `price` и `priceText`.
  - `product_images` — изображения товаров.
  - `product_sizes` — размеры товара.
  - `product_colors` — цвета товара.
  - `product_variants` — сочетания цвета и размера со своей ценой; только у товаров с «Разными ценами для размеров и цветов» (у товара с одной ценой их нет — только `product_sizes` и `product_colors`).
  - `analytics_events` — просмотры магазина и товаров.
- Таблица `stores` поддерживает добавление колонки `aiFormEnabled` при миграции.
- Устаревшая колонка `coverUrl` удаляется при инициализации существующей базы.
- В базе создаётся начальный администратор при первом запуске.

## Frontend

### Страницы

- `HomePage.tsx` — начальная страница.
- `LoginPage.tsx` — авторизация пользователя.
- `DashboardPage.tsx` — панель владельца магазина: выбор магазина, список товаров, аналитика, фильтры.
- `ProductEditorPage.tsx` — форма создания и редактирования товара.
- `SettingsPage.tsx` — редактирование реквизитов магазина владельцем.
- `AdminPage.tsx` — стартовая страница админа.
- `AdminOwnersPage.tsx` — управление владельцами.
- `AdminStoresPage.tsx` — управление магазинами, подписками и AI.
- `PublicStorePage.tsx` — публичная витрина магазина.
- `PublicProductPage.tsx` — карточка публичного товара.

### Маршрутизация

- `AppRoutes.tsx` определяет маршруты SPA.
- `ProtectedRoute.tsx` блокирует доступ на основе роли `OWNER` или `ADMIN`.
- Публичные маршруты доступны без авторизации.
- Владелец получает доступ к `/dashboard`, `/dashboard/stores/:storeId`, `/dashboard/stores/:storeId/products/new`, `/dashboard/stores/:storeId/products/bulk`, `/dashboard/stores/:storeId/products/:id/edit`, `/dashboard/stores/:storeId/settings`.
- Администратор получает доступ к `/admin`, `/admin/owners`, `/admin/stores`.
- Публичная витрина доступна по `/m/:storeSlug` и `/m/:storeSlug/p/:productId`.

### Компоненты

- `ProductForm.tsx` — форма товара с поддержкой AI-режима, голосового ввода, загрузки картинок, цен и категорий; блок «Цена, размеры и цвета» — `product-form/PriceDetails.tsx` (одна цена или переключатель «Разные цены для размеров и цветов»), модель цен — `product-form/simple.ts`.
- `product-form/PreviewGenerator.tsx` — окно «Превью с ИИ» из блока «Фото товара»: выбор фото, фона, цветов оформления, надписей и преимуществ; готовую картинку можно «Сделать обложкой». Выбор оформления запоминается в браузере, чтобы витрина была в одном стиле.
- `bulk/BulkProductCreator.tsx` — содержимое страницы `pages/BulkProductsPage.tsx` (`…/products/bulk`), массовое добавление в три шага: фото (голос и текст по желанию) → «Правильно разложил?» (перенос фото между товарами, объединение, удаление; логика в `bulk/grouping.ts`) → названия и цены. Шаг хранится в адресе (`?step=groups`), поэтому «Назад» в телефоне возвращает на предыдущий шаг. Сохранение уходит в фоновую очередь `state/backgroundJobs.tsx`.
- `ProductCard.tsx` — отображение товара на публичной витрине.
- `ConfirmModal.tsx` — подтверждение опасных действий.
- `EmptyState.tsx` — отображение пустых состояний.
- `Layout.tsx` — общий каркас страниц.
- `QrShareButton.tsx` — отображение QR-кода ссылки.
- `ProtectedRoute.tsx` — защита маршрутов по роли.

### API клиент

- `api/client.ts` — Axios клиент с базовым URL.
- JWT токен сохраняется в `localStorage` и подставляется в заголовок `Authorization`.
- Клиент используется всеми страницами и компонентами для запроса к backend.

## Потоки данных

### Просмотр витрины

Пользователь
↓
`PublicStorePage.tsx`
↓
`api/client.ts`
↓
`GET /api/public/stores/:slug`
↓
`publicController.ts`
↓
`storeService.ts` → `database/db.ts`
↓
Ответ с данными магазина

Пользователь
↓
`PublicStorePage.tsx`
↓
`api/client.ts`
↓
`GET /api/public/stores/:slug/products`
↓
`publicController.ts`
↓
`productService.ts` → `database/db.ts`
↓
Ответ с продуктами

### Добавление товара

Владелец
↓
`ProductEditorPage.tsx`
↓
`ProductForm.tsx`
↓
`api/client.ts`
↓
`POST /api/owner/stores/:storeId/products`
↓
`ownerController.ts`
↓
`productService.ts` → `database/db.ts`
↓
Ответ с созданным товаром

### AI Draft

Владелец
↓
`ProductEditorPage.tsx`
↓
`ProductForm.tsx`
↓
`api/client.ts`
↓
`POST /api/owner/stores/:storeId/products/ai-draft`
↓
`ownerController.ts`
↓
`aiDraftService.ts`
↓
Ответ с предложенными данными товара

### Массовый AI Draft

Владелец → `pages/BulkProductsPage.tsx` → `bulk/BulkProductCreator.tsx` → `api/client.ts` → `POST /api/owner/stores/:storeId/products/bulk-ai-draft` (202, раскладка `RUNNING`) → `ownerController.ts` → `bulkDraftService.ts` сохраняет фото и в фоне вызывает `aiDraftService.ts` / `imageService.ts` → страница спрашивает `GET …/bulk-ai-draft/:id?watch=1`, адрес страницы хранит `?draft=<id>`. Ушёл со страницы — раскладку ведёт панель фоновых задач (`state/backgroundJobs.tsx`, фото остаются в памяти), а по готовности приходит уведомление; открытая заново страница берёт фото из панели или скачивает `GET …/bulk-ai-draft/:id/photos/:index` → владелец поправляет раскладку и ставит цены → `queueProductBatch` в `state/backgroundJobs.tsx`, копия раскладки на сервере удаляется (`DELETE …/bulk-ai-draft/:id`): товары сохраняются по одному существующими маршрутами создания товара и загрузки изображений, владелец при этом уже вернулся в кабинет. Сбой одного товара не останавливает остальные; «Повторить» продолжает с места сбоя и не создаёт дубль.

### Превью с ИИ

Владелец → `PreviewGenerator.tsx` → `POST /api/owner/stores/:storeId/products/ai-preview` → `ownerController.createPreview` (магазин с ИИ, лимит месяца) → `previewImageService.ts` собирает промпт из выбранных пресетов (свободный текст в промпт не попадает, кроме заголовка до 40 символов) → `aiProvider.editImage` → `POST {AI_PREVIEW_BASE_URL}/images/edits` с фото товара → картинка возвращается в форму и становится обложкой → сохраняется вместе с товаром обычной загрузкой фото. Учёт: строка `ai_usage` с видом `PREVIEW`.

### Загрузка изображения товара

Владелец
↓
`ProductForm.tsx`
↓
`api/client.ts`
↓
`POST /api/owner/stores/:storeId/products/:id/images`
↓
`ownerController.ts`
↓
`productService.ts` → `imageService.ts` → `database/db.ts`
↓
Ответ с обновлённым товаром

## Разделение ответственности

### Только Controller

- Проверка наличия обязательных полей запроса.
- Перевод ошибок в HTTP-ответы.
- Ограничение доступа по JWT и роли.
- Выбор магазина владельца и проверка его наличия.
- Вызов сервисов по операциям.

### Только Service

- Реализация CRUD операций с данными.
- Бизнес-логика проверки подписки и активности магазина.
- Управление товарами, изображениями, размерами, цветами, вариантами.
- Генерация одиночного и массового AI-черновика товара.
- Оптимизация и файловый lifecycle изображений.
- Расчёт аналитики просмотров.
- Аутентификация и генерация JWT.

### Только Frontend

- Рендер страниц и компонентов.
- Формирование интерфейса входа, панели владельца, админки, витрины.
- Управление состоянием и формами товара.
- Взаимодействие с API через Axios.
- Голосовой ввод и локальное сохранение черновика.

### Database

- Хранение пользователей, магазинов, продуктов, изображений, размеров, цветов, вариантов и событий аналитики.
- Обеспечение уникальности slug магазина.
- Сохранение состояния подписки и включённого AI.
- Сохранение хеша пароля.

## Архитектурные принципы

- REST API: отдельные HTTP маршруты для `auth`, `admin`, `owner`, `public`.
- JWT авторизация: токен передаётся в заголовке `Authorization`.
- Разделение ролей: `ADMIN` и `OWNER` контролируется middleware.
- Service Layer: бизнес-логика вынесена в сервисы.
- React SPA: frontend как одностраничное приложение.
- Централизованная бизнес-логика на backend, frontend отвечает за представление.
- Файловая база данных: `sql.js` хранит SQLite в файле.
- AI-интеграция: backend обращается к совместимому Responses API и API транскрибации; текстовый одиночный черновик имеет локальный fallback.

## Несоответствия

- В MOTIVATION.md указано добавление товаров в избранное, но в коде нет поддержки избранного.
- В MOTIVATION.md и REQUIREMENTS.md упоминается тарифная модель, но в коде отсутствует отдельная модель тарифов.
- В REQUIREMENTS.md указана подписка как часть системы, но в коде подписка представлена полями магазина, а не отдельной сущностью.
- В проекте `Category` реализована не как отдельная сущность, а как строковый атрибут продукта.
- `AiDraft` не хранится в базе, а создаётся динамически сервисом.
- Аналитика реализована как события просмотра, а не как отдельная модель KPI.
