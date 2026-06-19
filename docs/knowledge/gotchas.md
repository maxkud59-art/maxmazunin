# Известные проблемы и фиксы

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

## VK midnight reset — детекция

**Симптом:** В час после 00:00 МСК дельта расхода показывает 0 или отрицательное значение.

**Причина:** VK Ads обнуляет накопленные счётчики в 21:00 UTC (= 00:00 МСК). Базовый снимок содержит больше, чем конечный снимок нового дня.

**Фикс (реализован):** В `computeHourForCabinet()`: если `end.spend < baseline.spend` → isMidnightReset = true, дельта = end.spend (весь расход нового часа).
