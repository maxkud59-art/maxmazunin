# Известные проблемы и фиксы

## 2026-06-23 | CRM: второй Prisma-клиент не найден после сборки (`Cannot find module`)

**Симптом:** Backend запускается, CrmModule инициализируется, но сразу крашится: `Error: Cannot find module '../generated/crm-client'`.

**Причина:** `nest build` кладёт JS в `dist/src/crm/prisma-crm.service.js`. Из этого пути `../generated/crm-client` резолвится как `dist/src/generated/crm-client`, которого не существует. Сам клиент был сгенерирован в `src/generated/crm-client`.

**Фикс:** Генерировать клиент в `node_modules`, а не в `src/`:
```prisma
generator crmClient {
  provider = "prisma-client-js"
  output   = "../node_modules/@prisma/crm-client"
}
```
Импорт в коде: `import { PrismaClient } from '@prisma/crm-client'`. Путь не зависит от структуры dist.

---

## 2026-06-23 | cabinet DB: `migrate deploy` падает с «relation does not exist» на чистой БД

**Симптом:** На свежей локальной базе `cabinet` команда `npx prisma migrate deploy` падает с ошибкой `relation "Campaign" does not exist`.

**Причина:** Миграции в `prisma/migrations/` — только incremental (добавляют колонки в уже существующие таблицы). Базовая схема применялась через `db push` на проде; здесь она не применялась.

**Фикс (для локального разворачивания):**
1. `npx prisma db push --accept-data-loss` — создаёт все таблицы из текущей схемы.
2. `npx prisma migrate resolve --applied 20260620_add_vk_messenger`
3. `npx prisma migrate resolve --applied 20260621_campaign_audience_archived`
После этого `migrate status` покажет all applied.

---

## 2026-06-21 | VK Ads: пустой список кабинетов / «Готово: 0 снимков»

**Симптом:** На странице `/vk-ads` выпадающий список кабинетов пуст, кнопка «Обновить сейчас» показывает «Готово: 0 снимков», статистика не появляется.

**Причина:** Таблица `VkCabinet` пуста (синхронизация не выполнялась) или задан неправильный токен.

**Два типа токенов VK — это РАЗНЫЕ системы:**

| Токен | Переменная | Где получить | Права |
|-------|-----------|-------------|-------|
| Рекламный (VK Ads) | `VK_ADS_TOKEN` | ads.vk.com → Настройки → API | `ads` |
| Сообщества (мессенджер) | `VK_GROUP_TOKEN` | vk.com → Управление сообществом → API | `messages` |

Токен сообщества (`VK_GROUP_TOKEN`) **не работает** для рекламной статистики и наоборот.

**Фикс:**
1. Получить токен на [ads.vk.com](https://ads.vk.com) → Настройки → Доступ по API → Создать токен (галка **«Рекламные кампании»**).
2. Добавить в `.env` на сервере: `VK_ADS_TOKEN=<токен>`.
3. Перезапустить: `pm2 restart cabinet-backend`.
4. На странице `/vk-ads` нажать **«🔑 Проверить токен»** — должно показать "действителен, доступно аккаунтов: N".
5. Нажать **«⟳ Синхр. кабинеты»** (кнопка видна только для ADMIN) — система загрузит аккаунты из VK API.
6. Нажать **«↻ Обновить сейчас»** — начнётся сбор статистики.

**Что изменено в коде (2026-06-21):**
- Введена переменная `VK_ADS_TOKEN` (fallback на `VK_ACCESS_TOKEN` для обратной совместимости).
- `VkAdsClientService.listAccounts()` — загружает аккаунты из VK API.
- `VkAdsService.syncAccounts()` — upsert аккаунтов в `VkCabinet` по `externalAccountId`.
- `POST /api/vk-ads/sync-accounts` (ADMIN) — endpoint синхронизации.
- `getStatistics()` теперь принимает `accountId` и передаёт в API-запросы.
- `checkTokenHealth()` использует `listAccounts()` — 0 аккаунтов → предупреждение о правах.
- Frontend: баннер «Кабинеты не найдены» + кнопка «Синхр. кабинеты» (ADMIN).

---

## 2026-06-21 | Мессенджер: сообщения не уходят — VK_GROUP_TOKEN пустой

**Симптом:** Из мессенджера (/assistant/messenger) нажать «Отправить» — сообщение не уходит. В логах PM2 нет явных ошибок VK. `VK_TOKEN_LEN=0`.

**Причина:** `VK_GROUP_TOKEN` не задан в `.env` на сервере. `VkMessengerClient.configured` = false, при попытке отправки VK возвращает error_code 5 (auth) → backend бросал 500, frontend глотал через `console.error` — пользователь не видел ошибки.

**Фикс:**
1. Получить токен сообщества VK с правом `messages`:
   - VK → Управление сообществом → Настройки → Работа с API → Ключи доступа → Создать ключ.
   - Галка: **Сообщения сообщества**.
2. `nano /home/deploy/maxmazunin/.env` → добавить/заменить: `VK_GROUP_TOKEN=<токен>`.
3. `pm2 restart cabinet-backend` (env читается при старте).
4. В мессенджере нажать «⚙️ Проверить токен» или послать тестовое сообщение.

**Что исправлено в коде (2026-06-21):**
- `AssistantService.sendMessage()`: проверяет `!configured` → бросает `BadRequestException` с читаемым текстом вместо 500.
- Все VK-ошибки логируются через `logger.error` перед пробросом → видны в `pm2 logs cabinet-backend`.
- `messenger.vue`: ошибка отправки показывается под полем ввода (красный текст) — не тихий fail.

**Токен хранится в .env, не коммитить!**

---

## 2026-06-21 | Боты: Long Poll «longpoll for this group is not enabled»

**Симптом:** `VkBotLongPollService` логирует: `VK getLongPollServer: One of the parameters specified was missing or invalid: longpoll for this group is not enabled`. Повторяется с exp back-off (3s→6s→12s→…→60s).

**Причина:** В настройках сообщества VK нужно явно включить Long Poll API.

**Фикс:**
1. Открыть VK → Управление сообществом → Настройки → Работа с API → Long Poll API.
2. Включить «Длинные опросы (Long Poll API)», версия 5.199.
3. Поставить галки на события: `Новое сообщение`, `Нажатие на callback-кнопку`, `Разрешение/запрет сообщений`.
4. Сохранить. Long Poll начнёт работать без рестарта backend (следующий retry сработает успешно).

**Примечание:** Long Poll работает только если `VK_GROUP_TOKEN` и `VK_GROUP_ID` заданы в `.env`. Если не заданы — сервис выводит WARN и отключается.

---

## 2026-06-20 | КРИТИЧНО: `--force-reset` или `migrate reset` уничтожает все данные

**Симптом:** После деплоя исчезли все пользователи (включая админа), проекты книг, фотографии — БД пуста.

**Причина:** Команды `npx prisma db push --force-reset`, `npx prisma migrate reset` или `npx prisma migrate dev` на проде полностью удаляют схему и пересоздают её с нуля, стирая все данные.

**Фикс:**
- НИКОГДА не использовать `--force-reset`, `migrate reset`, `migrate dev` в проде.
- Для обновления схемы: только `npx prisma db push --accept-data-loss` (без --force-reset).
- Перед любой операцией со схемой: `bash scripts/backup-db.sh`.
- Если данные уже потеряны и бэкапа нет — пользователей восстановить невозможно.
- Перевыпустить админа: задать ADMIN_EMAIL + ADMIN_PASSWORD в .env → `npm run admin:create`.

**Правило:** Все миграции — только аддитивные (ADD COLUMN, CREATE TABLE). DROP TABLE, DROP COLUMN — только по явному указанию владельца с обязательным бэкапом.

---

## 2026-06-20 | Book Layout: Nuxt routing conflict — book-layout.vue + book-layout/ directory

**Симптом:** Кнопка «Открыть» на списке проектов не открывала редактор (белый экран / ничего). Кнопки размера в модалке визуально не реагировали на клик.

**Причина:** В Nuxt 3 если одновременно существуют `pages/book-layout.vue` и `pages/book-layout/` директория, то `book-layout.vue` становится PARENT LAYOUT для всех дочерних маршрутов. Без `<NuxtPage />` внутри дочерние роуты (`[id].vue`, `share/`) никогда не рендерятся.

**Фикс:** Удалить `pages/book-layout.vue`, создать `pages/book-layout/index.vue` с тем же содержимым. Теперь все три маршрута работают независимо: `/book-layout` → index.vue, `/book-layout/:id` → [id].vue, `/book-layout/share/:token` → share/[token].vue.

---


## 2026-06-19 | uploads/ не персистируется в prod

**Симптом:** После пересборки Docker-контейнера бэкенда загруженные файлы (вложения мессенджера) исчезают.

**Причина:** `uploads/` создаётся в `main.ts` при старте, но `docker-compose.prod.yml` не монтирует его как named volume — данные живут внутри контейнера.

**Фикс:** Добавить в `docker-compose.prod.yml`:
```yaml
backend:
  volumes:
    - uploads_data:/app/uploads

volumes:
  uploads_data:
```
И убедиться, что nginx раздаёт `/uploads/` как статику или проксирует на backend.

---

## TBD | Кэш ассетов Nuxt (/_nuxt/*)

**Симптом:** После деплоя браузер отображает старые JS/CSS бандлы.

**Причина:** nginx не устанавливает правильные `Cache-Control` заголовки для `/_nuxt/*` (нужен `immutable`) и HTML (нужен `no-cache`).

**Фикс:** См. раздел "Кэш ассетов Nuxt" в [deploy.md](deploy.md).

---

## TBD | certbot не перезагружает nginx после продления

**Симптом:** После продления Let's Encrypt сертификата nginx может работать со старым сертификатом до следующего рестарта.

**Причина:** certbot-контейнер делает `certbot renew`, но не вызывает `nginx -s reload`.

**Фикс (не реализован):** Добавить хост-cron или post-hook в certbot для `docker compose exec nginx nginx -s reload`.

---

## 500 "Importing a module script failed" (TBD)

**Симптом:** Браузер получает 500 с текстом "Importing a module script failed" при загрузке страницы.

**Причина:** TBD — вероятно связано с кэшем ассетов или неверным MIME-type для JS.

**Фикс:** TBD — проверить заголовки ответа nginx для `/_nuxt/*.js`.

---

## 2026-06-20 | Messenger: сообщения от других отображались как свои (isMine bug)

**Симптом:** Все сообщения в чате у получателя выровнены вправо (как свои), unreadCount не растёт.

**Причина:** Gateway эмитил `message:new` с `isMine: true` (sender-relative) всем клиентам в комнате.

**Фикс:** Gateway стрипает `isMine` перед бродкастом. Клиент вычисляет `isMine = sender.id === auth.user.id`.

---

## 2026-06-20 | Messenger: история чата не грузится если WS опередил REST

**Симптом:** При клике на чат с новым WS-сообщением история не загружается (видно только 1 WS-сообщение).

**Причина:** `addMessage` создавал `messages[chatId] = [msg]` → при selectChat `messages[chatId].length === 1` → `loadMessages` не вызывался.

**Фикс:** Добавлен `loadedChats: Record<string, boolean>` в store. `loadMessages` устанавливает флаг после REST. При selectChat грузим только если `!loadedChats[chatId]`.

---

## 2026-06-20 | Book Layout: uploadPhoto хранил размеры thumbnail вместо оригинала

**Симптом:** `BookPhoto.width/height` возвращали 600 (ширину thumbnail) вместо реальных пикселей фото.

**Причина:** Сервис читал `{ width, height }` из результата `sharp.resize(600).toFile()` — это размеры ресайзнутого файла.

**Фикс:** Читать `sharp(file.path).metadata()` ДО вызова resize. `{ width, height }` берётся из `meta`, не из `info`.

---

## 2026-06-20 | enhance-service: torchvision.transforms.functional_tensor удалён в torchvision≥0.17

**Симптом:** `Real-ESRGAN failed (No module named 'torchvision.transforms.functional_tensor')`.

**Причина:** `basicsr/realesrgan/gfpgan` импортирует `from torchvision.transforms.functional_tensor import rgb_to_grayscale`, но этот внутренний модуль удалён в torchvision ≥ 0.17.

**Фикс:** В начале `main.py` добавлен compatibility shim — создаём фиктивный модуль `torchvision.transforms.functional_tensor` с нужными функциями из `torchvision.transforms.functional`.

---

## 2026-06-20 | enhance-service: GFPGAN вызывает OOM на сервере с 1.9GB RAM без swap

**Симптом:** enhance-service падает через ~12с при GFPGAN-инференсе (Connection reset by peer / PM2 restart).

**Причина:** GFPGAN v1.4 + facexlib (face detection 105MB + parsing 82MB) требуют peak RAM ~700MB поверх уже загруженного PyTorch (~300MB). Суммарно ~1.7-1.9GB на сервере с 1.9GB total и без swap → OOM kill.

**Фикс:** `ENABLE_GFPGAN=false` (default). Real-ESRGAN достаточно для улучшения качества печати. GFPGAN включить при апгрейде до ≥3GB RAM или добавлении swap (2GB).

---

## 2026-06-20 | Book Layout: Prisma client устарел после добавления полей в schema.prisma

**Симптом:** `npm run build` падает с `Property 'enhancedKey' does not exist on type '...'` даже после rsync schema.prisma.

**Причина:** Prisma client генерируется из схемы при `prisma generate`. Если сделать только rsync схемы и сразу build — старый клиент в `node_modules` не знает о новых полях.

**Фикс:** Перед `npm run build` запустить `npx prisma db push --accept-data-loss` (он автоматически делает generate) или `npx prisma generate`.

---

## 2026-06-20 | VK-токен истёк — диагностика и замена

**Симптом:** Страница `/vk-ads` показывает баннер «VK-токен недействителен или истёк», статистика не обновляется, в логах backend: `Poll "..." ТОКЕН НЕДЕЙСТВИТЕЛЕН: ...`.

**Причина:** Токены VK Ads имеют ограниченный срок жизни (обычно 24ч–365 дн. в зависимости от типа). После истечения VK возвращает ошибку UNAUTHORIZED.

**Как обновить токен:**
1. Получить новый токен на [ads.vk.com](https://ads.vk.com) (в разделе API / приложения).
2. На сервере: `nano /home/deploy/maxmazunin/.env` → изменить `VK_ACCESS_TOKEN=<новый_токен>`.
3. Перезапустить backend: `pm2 restart cabinet-backend` (env-файл читается при старте).
4. Проверить: на странице `/vk-ads` нажать кнопку «🔑 Проверить токен» — должна появиться галочка.

**Важно:** `.env` НЕ перезаписывается при деплое (rsync только `src/` и `frontend/`). Токен сохраняется между деплоями.

**Диагностика без UI:** `curl -H "Authorization: Bearer <jwt>" https://maxmazunin.ru/api/vk-ads/token-health`

---

## VK midnight reset — детекция

**Симптом:** В час после 00:00 МСК дельта расхода показывает 0 или отрицательное значение.

**Причина:** VK Ads обнуляет накопленные счётчики в 21:00 UTC (= 00:00 МСК). Базовый снимок содержит больше, чем конечный снимок нового дня.

**Фикс (реализован):** В `computeHourForCabinet()`: если `end.spend < baseline.spend` → isMidnightReset = true, дельта = end.spend (весь расход нового часа).

---

## 2026-06-21 | Performance: сайт не открывается с телефона — OOM без swap

**Симптом:** С мобильного «Превышено время ожидания ответа от сайта». При нагрузке (запросы к enhance-service) backend падает на несколько секунд. VK poll endpoint возвращал 504.

**Причина:**
1. **Нет swap (0B)** — при инференсе Real-ESRGAN enhance-service спайкает с ~306MB до ~450-500MB. Total RAM: backend(116) + frontend(65) + enhance(500) + postgres(28) ≈ 710MB, headroom заканчивался → Linux убивал backend → PM2 рестартовал его → nginx получал `Connection refused` 1-3 секунды → таймаут на телефоне.
2. **nginx default `proxy_read_timeout 60s`** — VK Ads poll (30+ API-вызовов, 7000+ кампаний) занимал >60s → nginx обрывал соединение с 504.
3. **ENABLE_GFPGAN не был явно задан в `.env`** — enhance-service грузил GFPGAN-зависимости (~250MB), хотя в коде default = false. Baseline был 554MB вместо 306MB.

**Фиксы (применены 2026-06-21):**
1. Добавлен swap 2GB (`/swapfile`, в `/etc/fstab`, `vm.swappiness=10`).
2. `ENABLE_GFPGAN=false` явно добавлен в `/home/deploy/maxmazunin/.env` + передан через `pm2 restart --update-env`. Baseline enhance-service: 554MB → 306MB.
3. PM2 `max_memory_restart 600M` на enhance-service — если вырастет выше, PM2 перезапустит его до OOM.
4. nginx `proxy_read_timeout 300s; proxy_send_timeout 300s;` для location `/api/`.

**Проверка:**
```bash
free -h                    # Swap: 2.0Gi
pm2 show enhance-service   # max memory restart: 629145600
```

---

## 2026-06-21 | enhance-service: OOM при GFPGAN + ESRGAN одновременно

**Симптом:** При `ENABLE_GFPGAN=true` enhance-service убивается PM2 или Linux OOM killer через ~90с.

**Причина:** ESRGAN модель (~200MB RSS) остаётся в памяти, пока GFPGAN загружает свои модели (GFPGANv1.4=333MB + facexlib detection=111MB + parsing=80MB = ~524MB). Итого пик: 300(base) + 200(ESRGAN) + 524(GFPGAN) ≈ 1024MB + PyTorch workspace → >1200MB.

**Фикс (2026-06-21):**
1. **Порядок**: GFPGAN запускается ПЕРВЫМ на оригинальном изображении (пока ESRGAN не загружен). После GFPGAN: `del restorer; gc.collect(); ctypes.CDLL('libc.so.6').malloc_trim(0)` — возвращает страницы malloc-аллокатора OS. Затем ESRGAN загружается.
2. PM2 `max_memory_restart 1500M` (пик ~1140MB при втором ESRGAN проходе на 1562×2560px).
3. 2GB swap обязателен.

**Второй gotcha — GIL блокировка во время torch.load:**  
`torch.load` держит Python GIL несколько секунд → FastAPI не может ответить на `/enhance/status` → NestJS получает timeout. Фикс: увеличить `getJobStatus` axios timeout с 5_000 до 30_000ms.

---

## 2026-06-21 | enhance-service: NestJS Backend использует SharpEnhanceClient вместо AiEnhanceClient

**Симптом:** Улучшение возвращает результат за <15 секунд, output 896×1200 (такой же размер, как input).

**Причина:** `createEnhanceClient()` вызывается в конструкторе `BookLayoutService`. Если enhance-service не успел запуститься к моменту старта backend, factory возвращает `SharpEnhanceClient` и кэширует его. Последующие вызовы используют кэшированный SharpEnhanceClient.

**Фикс:** В `getEnhanceClient()` проверять `instanceof AiEnhanceClient`. Если текущий клиент не AI — повторно вызывать `createEnhanceClient()`. Так backend обновляется до AI клиента при следующем запросе после рестарта enhance-service.

---

## 2026-06-20 | Тревелбук: «Ошибка запуска генерации» при клике «Сгенерировать»

**Симптом:** UI Тревелбука открывается, поля заполняются, но клик «Сгенерировать» → мгновенная ошибка «Ошибка запуска генерации». Сервисы работают, маршруты зарегистрированы.

**Причина:** В `[id].vue` composable хранился в переменной `apiCalls = useBookLayout()`, но функции `tbGenerate`, `tbPollStatus`, `tbApply` вызывали `api.startCoverGeneration`, `api.getCoverStatus`, `api.applyCoverResult` — `api` не определён, TypeError поглощался catch-блоком, и отображался fallback-текст ошибки.

**Диагностика:** Сообщение «Ошибка запуска генерации» — это именно fallback (`e?.data?.message ?? 'Ошибка...'`), то есть `e.data.message` undefined → не HTTP-ошибка с JSON-телом, а локальный JS TypeError.

**Фикс:** В `[id].vue` строки 340, 357, 380 — заменить `api.` → `apiCalls.`.

## 2026-06-27 | CRM: краш backend при отсутствии CRM_DATABASE_URL на сервере

**Симптом:** `cabinet-backend` статус `errored`, в логах: `PrismaClientConstructorValidationError: Invalid value undefined for datasource "db"`. Backend не стартует, health check 502.

**Причина:** `PrismaCrmService extends PrismaClient` вызывает `super({ datasources: { db: { url: undefined } } })` — Prisma бросает исключение в конструкторе когда `CRM_DATABASE_URL` не задан в `.env`.

**Фикс:** `PrismaCrmService` использует `process.env.DATABASE_URL` как fallback в конструкторе. Добавлен флаг `configured: boolean`. `$connect`/`$disconnect` вызываются только при `configured=true`. `CrmService` методы возвращают пустые результаты когда `!configured`.

**Правило:** Любой модуль с опциональной внешней зависимостью (вторая БД, внешний API) должен проверять наличие env-переменной и деградировать gracefully, а не падать при старте.

## 2026-06-27 | Frontend: @apply в scoped-стилях не работает в Tailwind 4

**Симптом:** `npm run build` на сервере падает с `Cannot apply unknown utility class 'border-gray-300'. Are you using CSS modules or similar and missing @reference?`

**Причина:** В Tailwind 4 `@apply` в `<style scoped>` (Vue SFC) работает в контексте CSS-модулей, где Tailwind-классы по умолчанию недоступны.

**Фикс:** Добавить `@reference "tailwindcss";` первой строкой в каждом `<style scoped>` блоке, который использует `@apply`.

```vue
<style scoped>
@reference "tailwindcss";
.btn-primary { @apply bg-indigo-600 text-white ...; }
</style>
```

**Файлы:** `pages/audience.vue`, `pages/experiments/index.vue`, `pages/experiments/[id].vue`, `pages/analytics/funnel.vue`.
