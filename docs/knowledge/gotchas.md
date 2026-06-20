# Известные проблемы и фиксы

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

## 2026-06-20 | Тревелбук: «Ошибка запуска генерации» при клике «Сгенерировать»

**Симптом:** UI Тревелбука открывается, поля заполняются, но клик «Сгенерировать» → мгновенная ошибка «Ошибка запуска генерации». Сервисы работают, маршруты зарегистрированы.

**Причина:** В `[id].vue` composable хранился в переменной `apiCalls = useBookLayout()`, но функции `tbGenerate`, `tbPollStatus`, `tbApply` вызывали `api.startCoverGeneration`, `api.getCoverStatus`, `api.applyCoverResult` — `api` не определён, TypeError поглощался catch-блоком, и отображался fallback-текст ошибки.

**Диагностика:** Сообщение «Ошибка запуска генерации» — это именно fallback (`e?.data?.message ?? 'Ошибка...'`), то есть `e.data.message` undefined → не HTTP-ошибка с JSON-телом, а локальный JS TypeError.

**Фикс:** В `[id].vue` строки 340, 357, 380 — заменить `api.` → `apiCalls.`.
