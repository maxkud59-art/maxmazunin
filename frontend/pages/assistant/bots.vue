<template>
  <div class="bots-page">
    <!-- ─── LIST VIEW ─────────────────────────────────────────────── -->
    <template v-if="!editorBot">
      <div class="page-header">
        <h1 class="page-title">Боты</h1>
        <div class="header-actions">
          <label class="toggle-archived">
            <input type="checkbox" v-model="showArchived" @change="loadBots" />
            Показать архив
          </label>
          <button class="btn-primary" @click="openCreateDialog">+ Создать бота</button>
        </div>
      </div>

      <div v-if="loading" class="state-loading"><span class="spinner"></span></div>

      <div v-else-if="!bots.length" class="empty-state">
        <div class="empty-icon">🤖</div>
        <p>Ботов нет. Создайте первого!</p>
      </div>

      <div v-else class="bot-grid">
        <div v-for="bot in bots" :key="bot.id" class="bot-card" :class="{ archived: bot.archived, enabled: bot.enabled }">
          <div class="bot-card-header">
            <span class="type-badge" :class="bot.type.toLowerCase()">{{ bot.type === 'RULE' ? 'Правило' : 'Сценарий' }}</span>
            <div class="bot-status" :class="bot.enabled ? 'active' : 'inactive'">
              {{ bot.enabled ? 'Активен' : 'Выключен' }}
            </div>
          </div>
          <div class="bot-name">{{ bot.name }}</div>
          <div class="bot-meta">
            <span>{{ bot.steps.length }} блоков</span>
            <span v-if="bot._count">· {{ bot._count.logs }} срабатываний</span>
          </div>
          <div class="bot-actions">
            <button class="btn-sm" @click="openEditor(bot)">✏️ Редактор</button>
            <button class="btn-sm" @click="toggleEnabled(bot)">{{ bot.enabled ? '⏸ Выкл' : '▶ Вкл' }}</button>
            <button class="btn-sm" @click="duplicateBot(bot.id)">📋 Копия</button>
            <button class="btn-sm btn-danger" @click="archiveBot(bot)">{{ bot.archived ? '↩ Восст.' : '🗑 Архив' }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ─── EDITOR VIEW ───────────────────────────────────────────── -->
    <template v-else>
      <div class="editor-header">
        <button class="back-btn" @click="closeEditor">← Боты</button>
        <input v-model="editorBot.name" class="editor-name-input" @blur="saveBotName" />
        <span class="type-badge" :class="editorBot.type.toLowerCase()">{{ editorBot.type === 'RULE' ? 'Правило' : 'Сценарий' }}</span>
        <div class="enabled-toggle">
          <label class="toggle-label">
            <span>{{ editorBot.enabled ? 'Активен' : 'Выключен' }}</span>
            <input type="checkbox" :checked="editorBot.enabled" @change="toggleEnabled(editorBot)" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="editor-body">
        <!-- Left: step chain -->
        <div class="step-chain">
          <div class="chain-title">Блоки</div>

          <div v-if="!editorBot.steps.length" class="chain-empty">Добавьте блок ↓</div>

          <draggable-list
            v-else
            :items="sortedSteps"
            @reorder="onReorder"
          >
            <template #item="{ item: step }">
              <div
                class="step-block"
                :class="[stepClass(step.type), { selected: selectedStep?.id === step.id }]"
                @click="selectStep(step)"
              >
                <div class="step-type-icon">{{ stepIcon(step.type) }}</div>
                <div class="step-info">
                  <span class="step-type-label">{{ stepLabel(step.type) }}</span>
                  <span class="step-summary">{{ stepSummary(step) }}</span>
                </div>
                <div class="step-ctrl">
                  <button class="step-up" @click.stop="moveStep(step, -1)" title="Выше">↑</button>
                  <button class="step-dn" @click.stop="moveStep(step, 1)" title="Ниже">↓</button>
                  <button class="step-del" @click.stop="deleteStep(step)" title="Удалить">✕</button>
                </div>
              </div>
              <!-- connector arrow -->
              <div v-if="step.nextStepId || true" class="step-connector">↓</div>
            </template>
          </draggable-list>

          <!-- Add block palette -->
          <div class="palette">
            <div class="palette-title">Добавить блок</div>
            <div class="palette-grid">
              <button v-for="pt in palette" :key="pt.type" class="palette-btn" :class="pt.color" @click="addStep(pt.type)">
                {{ pt.icon }} {{ pt.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right: config panel -->
        <div class="config-panel">
          <div v-if="!selectedStep" class="config-empty">
            <div>Выберите блок слева для настройки</div>
          </div>
          <template v-else>
            <div class="config-header">
              <span class="config-title">{{ stepLabel(selectedStep.type) }}</span>
              <button class="config-save-btn" @click="saveStep">💾 Сохранить</button>
            </div>
            <div class="config-body">
              <!-- TRIGGER config -->
              <template v-if="selectedStep.type === 'TRIGGER'">
                <div class="cfg-row">
                  <label class="cfg-label">Событие</label>
                  <select v-model="cfg.event" class="cfg-select">
                    <option value="message_new">Новое сообщение</option>
                    <option value="message_event">Нажата кнопка (callback)</option>
                    <option value="message_allow">Пользователь разрешил сообщения</option>
                    <option value="message_deny">Пользователь запретил сообщения</option>
                  </select>
                </div>
                <template v-if="cfg.event === 'message_new'">
                  <div class="cfg-row">
                    <label class="cfg-label">Направление</label>
                    <select v-model="cfg.filter.direction" class="cfg-select">
                      <option value="IN">Входящее (от клиента)</option>
                      <option value="OUT">Исходящее (от группы)</option>
                      <option value="BOTH">Любое</option>
                    </select>
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-label">Любое из слов (через запятую)</label>
                    <input v-model="filterWords.any" class="cfg-input" placeholder="привет, здравствуйте" />
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-label">Все слова (через запятую)</label>
                    <input v-model="filterWords.all" class="cfg-input" placeholder="заказ, оплата" />
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-label">Точное совпадение</label>
                    <input v-model="cfg.filter.exact" class="cfg-input" placeholder="привет" />
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-label">Регулярное выражение</label>
                    <input v-model="cfg.filter.regex" class="cfg-input" placeholder="^\d{10}$" />
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-check">
                      <input type="checkbox" v-model="cfg.filter.hasAttachment" />
                      Только с вложением
                    </label>
                  </div>
                  <div class="cfg-row">
                    <label class="cfg-label">Команда /start с параметром</label>
                    <input v-model="cfg.filter.startParam" class="cfg-input" placeholder="ref123 (оставить пусто = любой /start)" />
                  </div>
                </template>
                <template v-if="cfg.event === 'message_event'">
                  <div class="cfg-row">
                    <label class="cfg-label">Payload кнопки (JSON или строка)</label>
                    <input v-model="cfg.filter.payload" class="cfg-input" placeholder='{"step":"start"}' />
                  </div>
                </template>
                <template v-if="cfg.event === 'message_allow'">
                  <div class="cfg-row">
                    <label class="cfg-label">Метка источника ref (пусто = любая)</label>
                    <input v-model="cfg.filter.refParam" class="cfg-input" placeholder="vk_ads_campaign1" />
                  </div>
                </template>
              </template>

              <!-- SEND_MESSAGE config -->
              <template v-else-if="selectedStep.type === 'SEND_MESSAGE'">
                <div class="cfg-row">
                  <label class="cfg-label">Текст сообщения</label>
                  <div class="var-hints">
                    <span v-for="v in varHints" :key="v" class="var-chip" @click="insertVar(v)">{{ v }}</span>
                  </div>
                  <textarea v-model="cfg.text" class="cfg-textarea" rows="5" placeholder="Привет, [Имя]! Ваш заказ готов."></textarea>
                </div>
                <div class="cfg-row">
                  <label class="cfg-label">Вложение (метка VK)</label>
                  <input v-model="cfg.attachment" class="cfg-input" placeholder="photo-123_456 или [photo-123_456]" />
                  <span class="cfg-hint">Формат: photo{owner}_{id}, video{owner}_{id}, doc{owner}_{id}</span>
                </div>

                <!-- Keyboard builder -->
                <div class="cfg-row">
                  <label class="cfg-label">Клавиатура VK</label>
                  <div class="kb-options">
                    <label class="cfg-check"><input type="checkbox" v-model="kb.enabled" /> Добавить клавиатуру</label>
                    <template v-if="kb.enabled">
                      <label class="cfg-check"><input type="checkbox" v-model="kb.inline" /> Inline (внутри сообщения)</label>
                      <label class="cfg-check" v-if="!kb.inline"><input type="checkbox" v-model="kb.one_time" /> Скрыть после нажатия</label>
                    </template>
                  </div>
                  <template v-if="kb.enabled">
                    <div v-for="(row, ri) in kb.buttons" :key="ri" class="kb-row">
                      <div class="kb-row-header">
                        <span class="kb-row-label">Ряд {{ ri + 1 }}</span>
                        <button class="kb-del-row" @click="removeKbRow(ri)">✕ Ряд</button>
                      </div>
                      <div v-for="(btn, bi) in row" :key="bi" class="kb-btn-editor">
                        <input v-model="btn.label" class="kb-btn-label" placeholder="Текст кнопки" />
                        <select v-model="btn.type" class="kb-btn-type">
                          <option value="text">Текст</option>
                          <option value="callback">Callback</option>
                          <option value="open_link">Ссылка</option>
                        </select>
                        <select v-if="btn.type !== 'open_link'" v-model="btn.color" class="kb-btn-color">
                          <option value="primary">Синяя</option>
                          <option value="secondary">Белая</option>
                          <option value="positive">Зелёная</option>
                          <option value="negative">Красная</option>
                        </select>
                        <input v-if="btn.type === 'open_link'" v-model="btn.link" class="kb-btn-link" placeholder="https://..." />
                        <input v-else v-model="btn.payload" class="kb-btn-payload" placeholder='payload: {"step":"next"}' />
                        <button class="kb-del-btn" @click="removeKbBtn(ri, bi)">✕</button>
                      </div>
                      <button class="kb-add-btn" @click="addKbBtn(ri)">+ Кнопка</button>
                    </div>
                    <button class="kb-add-row" @click="addKbRow">+ Ряд</button>

                    <!-- Preview -->
                    <div v-if="kb.buttons.some(r => r.length)" class="kb-preview">
                      <div class="kb-preview-label">Предпросмотр:</div>
                      <div class="kb-preview-body" :class="{ 'kb-inline': kb.inline }">
                        <div v-for="(row, ri) in kb.buttons" :key="ri" class="kb-preview-row">
                          <span
                            v-for="(btn, bi) in row" :key="bi"
                            class="kb-preview-btn"
                            :class="`kb-color-${btn.color || 'secondary'}`"
                          >{{ btn.label || '…' }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </template>

              <!-- SET_CRM_STATUS config -->
              <template v-else-if="selectedStep.type === 'SET_CRM_STATUS'">
                <div class="cfg-row">
                  <label class="cfg-label">CRM-статус</label>
                  <select v-model="cfg.statusId" class="cfg-select">
                    <option value="">— не менять —</option>
                    <option v-for="s in crmStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
              </template>

              <!-- SET_TAGS config -->
              <template v-else-if="selectedStep.type === 'SET_TAGS'">
                <div class="cfg-row">
                  <label class="cfg-label">Добавить теги</label>
                  <div class="tag-selector">
                    <label v-for="t in tags" :key="t.id" class="tag-check">
                      <input type="checkbox" :value="t.id" v-model="cfg.add" />
                      <span class="tag-dot" :style="{ background: t.color }"></span>{{ t.name }}
                    </label>
                  </div>
                </div>
                <div class="cfg-row">
                  <label class="cfg-label">Убрать теги</label>
                  <div class="tag-selector">
                    <label v-for="t in tags" :key="t.id" class="tag-check">
                      <input type="checkbox" :value="t.id" v-model="cfg.remove" />
                      <span class="tag-dot" :style="{ background: t.color }"></span>{{ t.name }}
                    </label>
                  </div>
                </div>
              </template>

              <!-- SET_ORDER_STATUS config -->
              <template v-else-if="selectedStep.type === 'SET_ORDER_STATUS'">
                <div class="cfg-row">
                  <label class="cfg-label">Статус заказа</label>
                  <select v-model="cfg.statusId" class="cfg-select">
                    <option value="">— не менять —</option>
                    <option v-for="s in orderStatuses" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
              </template>

              <!-- DELAY config -->
              <template v-else-if="selectedStep.type === 'DELAY'">
                <div class="cfg-row cfg-inline">
                  <label class="cfg-label">Задержка</label>
                  <input v-model.number="cfg.value" type="number" min="1" class="cfg-input-sm" />
                  <select v-model="cfg.unit" class="cfg-select-sm">
                    <option value="minutes">мин</option>
                    <option value="hours">ч</option>
                    <option value="days">дн</option>
                  </select>
                </div>
              </template>

              <!-- CONDITION config -->
              <template v-else-if="selectedStep.type === 'CONDITION'">
                <div class="cfg-row">
                  <label class="cfg-label">Тип условия</label>
                  <select v-model="cfg.type" class="cfg-select">
                    <option value="message_contains">Сообщение содержит</option>
                    <option value="button_clicked">Нажата кнопка с payload</option>
                    <option value="has_tag">Есть тег</option>
                    <option value="crm_status">CRM-статус</option>
                    <option value="field_value">Значение поля</option>
                  </select>
                </div>
                <div class="cfg-row">
                  <label class="cfg-label">Значение</label>
                  <input v-model="cfg.value" class="cfg-input" placeholder="Введите значение для проверки" />
                </div>
                <div class="cfg-row">
                  <label class="cfg-label">Ветки (True / False)</label>
                  <div v-for="(branch, bi) in cfg.branches" :key="bi" class="branch-row">
                    <span class="branch-label">{{ branch.label || 'Ветка ' + (bi + 1) }}</span>
                    <input v-model="branch.condition" class="cfg-input-sm" placeholder="yes / no / value" />
                    <select v-model="branch.stepId" class="cfg-select-sm">
                      <option value="">— завершить —</option>
                      <option v-for="s in editorBot.steps.filter(x => x.id !== selectedStep!.id)" :key="s.id" :value="s.id">
                        {{ stepLabel(s.type) }}: {{ stepSummary(s).slice(0, 25) }}
                      </option>
                    </select>
                    <label class="cfg-check"><input type="checkbox" v-model="branch.isDefault" /> По умолч.</label>
                    <button class="kb-del-btn" @click="cfg.branches.splice(bi, 1)">✕</button>
                  </div>
                  <button class="kb-add-btn" @click="cfg.branches = [...(cfg.branches || []), { condition: '', stepId: '', label: '' }]">+ Ветка</button>
                </div>
              </template>

              <!-- EXTRACT_FIELD config -->
              <template v-else-if="selectedStep.type === 'EXTRACT_FIELD'">
                <div class="cfg-row">
                  <label class="cfg-label">Поле для сохранения</label>
                  <select v-model="cfg.field" class="cfg-select">
                    <option value="phone">Телефон</option>
                    <option value="email">Email</option>
                    <option value="promoCode">Промо-код</option>
                    <option value="startParam">/start параметр</option>
                    <option value="custom">Кастомное поле (vars)</option>
                  </select>
                </div>
                <div class="cfg-row">
                  <label class="cfg-label">Регулярка (необязательно)</label>
                  <input v-model="cfg.regex" class="cfg-input" placeholder="(\+?7\d{10})" />
                </div>
                <div v-if="cfg.field === 'custom'" class="cfg-row">
                  <label class="cfg-label">Имя переменной</label>
                  <input v-model="cfg.varName" class="cfg-input" placeholder="myVar" />
                </div>
              </template>

              <!-- SET_REMINDER config -->
              <template v-else-if="selectedStep.type === 'SET_REMINDER'">
                <div class="cfg-row cfg-inline">
                  <label class="cfg-label">Напомнить через</label>
                  <input v-model.number="cfg.days" type="number" min="1" class="cfg-input-sm" />
                  <span>дн.</span>
                </div>
              </template>

              <!-- NOTIFY_MANAGER config -->
              <template v-else-if="selectedStep.type === 'NOTIFY_MANAGER'">
                <div class="cfg-row">
                  <label class="cfg-label">Текст уведомления</label>
                  <textarea v-model="cfg.message" class="cfg-textarea" rows="3" placeholder="Клиент [Имя] изменил статус заказа"></textarea>
                </div>
              </template>

              <!-- GOTO_STEP config -->
              <template v-else-if="selectedStep.type === 'GOTO_STEP'">
                <div class="cfg-row">
                  <label class="cfg-label">Перейти к блоку</label>
                  <select v-model="cfg.stepId" class="cfg-select">
                    <option value="">— выберите блок —</option>
                    <option v-for="s in editorBot.steps.filter(x => x.id !== selectedStep!.id)" :key="s.id" :value="s.id">
                      {{ stepLabel(s.type) }}: {{ stepSummary(s).slice(0, 30) }}
                    </option>
                  </select>
                </div>
              </template>

              <!-- Blocks with no config -->
              <template v-else-if="['END_SCENARIO','UNSUBSCRIBE','MARK_IMPORTANT','LOG_STAT','ASSIGN_MANAGER'].includes(selectedStep.type)">
                <div class="cfg-no-config">Этот блок не требует настройки.</div>
                <div v-if="selectedStep.type === 'ASSIGN_MANAGER'" class="cfg-row">
                  <label class="cfg-label">ID менеджера (VK User)</label>
                  <input v-model="cfg.managerId" class="cfg-input" placeholder="userId" />
                </div>
              </template>
            </div>

            <!-- nextStepId selector for linear flow -->
            <div v-if="!['CONDITION','GOTO_STEP','END_SCENARIO','UNSUBSCRIBE'].includes(selectedStep.type)" class="cfg-next">
              <label class="cfg-label">Следующий блок (для сценариев)</label>
              <select v-model="nextStepIdEdit" class="cfg-select">
                <option value="">— автоматически (по позиции) —</option>
                <option v-for="s in editorBot.steps.filter(x => x.id !== selectedStep!.id)" :key="s.id" :value="s.id">
                  {{ stepLabel(s.type) }}: {{ stepSummary(s).slice(0, 30) }}
                </option>
              </select>
            </div>
          </template>

          <!-- Log viewer -->
          <div v-if="editorBot && logs.length" class="log-panel">
            <div class="log-title">Последние срабатывания ({{ logs.length }})</div>
            <div v-for="log in logs" :key="log.id" class="log-row">
              <span class="log-time">{{ fmtTime(log.createdAt) }}</span>
              <span class="log-event">{{ log.event }}</span>
              <span class="log-action">{{ log.action }}</span>
              <span class="log-result">{{ log.result }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ─── CREATE DIALOG ─────────────────────────────────────────── -->
    <div v-if="createDialog" class="modal-overlay" @click.self="createDialog = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3 class="modal-title">Новый бот</h3>
          <button class="modal-close" @click="createDialog = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label class="form-label">Название</label>
            <input v-model="createForm.name" class="form-input" placeholder="Мой первый бот" autofocus />
          </div>
          <div class="form-row">
            <label class="form-label">Тип</label>
            <div class="type-selector">
              <button
                v-for="t in [{ v: 'RULE', l: 'Правило', d: 'Условия → Действия. Срабатывает на событие.' }, { v: 'SCENARIO', l: 'Сценарий', d: 'Цепочка шагов с задержками и ветвлением.' }]"
                :key="t.v"
                class="type-option"
                :class="{ selected: createForm.type === t.v }"
                @click="createForm.type = t.v as any"
              >
                <strong>{{ t.l }}</strong>
                <small>{{ t.d }}</small>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="createDialog = false">Отмена</button>
          <button class="btn-primary" :disabled="creating || !createForm.name.trim()" @click="createBot">
            <span v-if="creating" class="spinner-sm"></span>{{ creating ? '...' : 'Создать и открыть' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { Bot, BotStep, BotStepType, BotType, BotLog } from '~/composables/useBotsModule';

const api = useBotsModule();
const dirApi = useAssistantModule();

const loading = ref(false);
const bots = ref<Bot[]>([]);
const showArchived = ref(false);

// Editor state
const editorBot = ref<Bot | null>(null);
const selectedStep = ref<BotStep | null>(null);
const cfg = ref<Record<string, any>>({});
const nextStepIdEdit = ref<string>('');
const logs = ref<BotLog[]>([]);

// Create dialog
const createDialog = ref(false);
const creating = ref(false);
const createForm = ref<{ name: string; type: BotType }>({ name: '', type: 'RULE' });

// Directory data for selects
const crmStatuses = ref<any[]>([]);
const tags = ref<any[]>([]);
const orderStatuses = ref<any[]>([]);

// Keyboard builder state
const kb = ref<{ enabled: boolean; inline: boolean; one_time: boolean; buttons: any[][] }>({
  enabled: false, inline: false, one_time: false, buttons: [],
});

// Filter words helpers (convert array ↔ string)
const filterWords = ref({ any: '', all: '' });

const varHints = ['[Имя]', '[Фамилия]', '[Телефон]', '[Город]', '[Статус]', '[startParam]'];

onMounted(() => {
  loadBots();
  loadDirectories();
});

async function loadBots() {
  loading.value = true;
  try { bots.value = await api.listBots(showArchived.value); } catch { } finally { loading.value = false; }
}

async function loadDirectories() {
  try {
    [crmStatuses.value, tags.value, orderStatuses.value] = await Promise.all([
      dirApi.listCrmStatuses(),
      dirApi.listTags(),
      dirApi.listOrderStatuses(),
    ]);
  } catch { }
}

// ─── List actions ────────────────────────────────────────────────────────────

function openCreateDialog() {
  createForm.value = { name: '', type: 'RULE' };
  createDialog.value = true;
}

async function createBot() {
  if (!createForm.value.name.trim()) return;
  creating.value = true;
  try {
    const bot = await api.createBot(createForm.value.name.trim(), createForm.value.type);
    bots.value.unshift(bot);
    createDialog.value = false;
    openEditor(bot);
  } catch { } finally { creating.value = false; }
}

async function toggleEnabled(bot: Bot) {
  const updated = await api.updateBot(bot.id, { enabled: !bot.enabled });
  Object.assign(bot, updated);
  if (editorBot.value?.id === bot.id) Object.assign(editorBot.value, updated);
}

async function duplicateBot(id: string) {
  const copy = await api.duplicateBot(id);
  bots.value.unshift(copy);
}

async function archiveBot(bot: Bot) {
  if (!bot.archived && !confirm(`Архивировать бота «${bot.name}»?`)) return;
  await api.updateBot(bot.id, { archived: !bot.archived });
  await loadBots();
}

// ─── Editor ──────────────────────────────────────────────────────────────────

async function openEditor(bot: Bot) {
  const full = await api.getBot(bot.id);
  editorBot.value = full;
  selectedStep.value = null;
  logs.value = await api.getLogs(bot.id, 30).catch(() => []);
}

function closeEditor() {
  editorBot.value = null;
  selectedStep.value = null;
  loadBots();
}

async function saveBotName() {
  if (!editorBot.value) return;
  await api.updateBot(editorBot.value.id, { name: editorBot.value.name });
}

const sortedSteps = computed(() =>
  editorBot.value ? [...editorBot.value.steps].sort((a, b) => a.position - b.position) : []
);

function selectStep(step: BotStep) {
  selectedStep.value = step;
  cfg.value = JSON.parse(JSON.stringify(step.config ?? {}));
  nextStepIdEdit.value = step.nextStepId ?? '';
  // Sync filter words
  if (step.type === 'TRIGGER') {
    if (!cfg.value.filter) cfg.value.filter = {};
    if (!cfg.value.event) cfg.value.event = 'message_new';
    if (!cfg.value.filter.direction) cfg.value.filter.direction = 'IN';
    filterWords.value.any = (cfg.value.filter.anyWords ?? []).join(', ');
    filterWords.value.all = (cfg.value.filter.allWords ?? []).join(', ');
  }
  // Sync keyboard
  if (step.type === 'SEND_MESSAGE') {
    const savedKb = cfg.value.keyboard;
    if (savedKb) {
      kb.value = { enabled: true, inline: savedKb.inline ?? false, one_time: savedKb.one_time ?? false, buttons: savedKb.buttons ?? [] };
    } else {
      kb.value = { enabled: false, inline: false, one_time: false, buttons: [] };
    }
    if (!cfg.value.add) cfg.value.add = [];
    if (!cfg.value.remove) cfg.value.remove = [];
  }
  if (step.type === 'SET_TAGS') {
    if (!cfg.value.add) cfg.value.add = [];
    if (!cfg.value.remove) cfg.value.remove = [];
  }
  if (step.type === 'CONDITION') {
    if (!cfg.value.branches) cfg.value.branches = [{ condition: 'yes', stepId: '', label: 'Да' }, { condition: 'no', stepId: '', label: 'Нет', isDefault: true }];
  }
  if (step.type === 'DELAY') {
    if (!cfg.value.value) cfg.value.value = 1;
    if (!cfg.value.unit) cfg.value.unit = 'minutes';
  }
}

async function saveStep() {
  if (!selectedStep.value || !editorBot.value) return;
  let finalCfg = { ...cfg.value };

  // Sync filter words
  if (selectedStep.value.type === 'TRIGGER') {
    if (!finalCfg.filter) finalCfg.filter = {};
    finalCfg.filter.anyWords = filterWords.value.any ? filterWords.value.any.split(',').map((w) => w.trim()).filter(Boolean) : [];
    finalCfg.filter.allWords = filterWords.value.all ? filterWords.value.all.split(',').map((w) => w.trim()).filter(Boolean) : [];
  }
  // Build keyboard
  if (selectedStep.value.type === 'SEND_MESSAGE') {
    if (kb.value.enabled && kb.value.buttons.some((r) => r.length)) {
      finalCfg.keyboard = {
        one_time: kb.value.one_time,
        inline: kb.value.inline,
        buttons: kb.value.buttons.map((row) =>
          row.map((btn) => ({
            action: {
              type: btn.type || 'text',
              label: btn.label || '…',
              ...(btn.type === 'open_link' ? { link: btn.link } : { payload: btn.payload || '{}' }),
            },
            color: btn.color || 'secondary',
          }))
        ),
      };
    } else {
      delete finalCfg.keyboard;
    }
  }

  const updated = await api.updateStep(editorBot.value.id, selectedStep.value.id, {
    config: finalCfg,
    nextStepId: nextStepIdEdit.value || null,
  });
  // Update in local list
  const idx = editorBot.value.steps.findIndex((s) => s.id === selectedStep.value!.id);
  if (idx !== -1) editorBot.value.steps[idx] = updated;
  selectedStep.value = updated;
}

async function addStep(type: BotStepType) {
  if (!editorBot.value) return;
  const step = await api.createStep(editorBot.value.id, { type });
  editorBot.value.steps.push(step);
  selectStep(step);
}

async function deleteStep(step: BotStep) {
  if (!editorBot.value) return;
  if (!confirm(`Удалить блок «${stepLabel(step.type)}»?`)) return;
  await api.deleteStep(editorBot.value.id, step.id);
  editorBot.value.steps = editorBot.value.steps.filter((s) => s.id !== step.id);
  if (selectedStep.value?.id === step.id) selectedStep.value = null;
}

async function moveStep(step: BotStep, dir: -1 | 1) {
  if (!editorBot.value) return;
  const sorted = [...editorBot.value.steps].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((s) => s.id === step.id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= sorted.length) return;
  // Swap positions
  const a = sorted[idx];
  const b = sorted[newIdx];
  [a.position, b.position] = [b.position, a.position];
  await api.reorderSteps(editorBot.value.id, sorted.map((s) => s.id));
  editorBot.value.steps = sorted;
}

async function onReorder(ids: string[]) {
  if (!editorBot.value) return;
  await api.reorderSteps(editorBot.value.id, ids);
  const map = new Map(editorBot.value.steps.map((s) => [s.id, s]));
  ids.forEach((id, i) => { const s = map.get(id); if (s) s.position = i; });
}

// ─── Keyboard builder ─────────────────────────────────────────────────────────

function addKbRow() { kb.value.buttons.push([]); }
function removeKbRow(ri: number) { kb.value.buttons.splice(ri, 1); }
function addKbBtn(ri: number) { kb.value.buttons[ri].push({ type: 'text', label: '', color: 'secondary', payload: '{}' }); }
function removeKbBtn(ri: number, bi: number) { kb.value.buttons[ri].splice(bi, 1); }

// ─── Variable insertion ───────────────────────────────────────────────────────

function insertVar(v: string) {
  cfg.value.text = (cfg.value.text ?? '') + v;
}

// ─── Step metadata ────────────────────────────────────────────────────────────

function stepLabel(type: BotStepType) {
  const m: Record<string, string> = {
    TRIGGER: 'Триггер', SEND_MESSAGE: 'Отправить сообщение', SET_CRM_STATUS: 'Статус CRM',
    SET_TAGS: 'Теги', SET_ORDER_STATUS: 'Статус заказа', MARK_IMPORTANT: 'Отметить важным',
    EXTRACT_FIELD: 'Читать из сообщения', SET_REMINDER: 'Напоминание', ASSIGN_MANAGER: 'Назначить менеджера',
    NOTIFY_MANAGER: 'Уведомить менеджера', LOG_STAT: 'Фиксировать статистику',
    CONDITION: 'Условие / ветвление', DELAY: 'Задержка', END_SCENARIO: 'Завершить сценарий',
    UNSUBSCRIBE: 'Отписать', GOTO_STEP: 'Перейти к блоку',
  };
  return m[type] ?? type;
}

function stepIcon(type: BotStepType) {
  const m: Record<string, string> = {
    TRIGGER: '⚡', SEND_MESSAGE: '💬', SET_CRM_STATUS: '🏷', SET_TAGS: '🔖',
    SET_ORDER_STATUS: '📦', MARK_IMPORTANT: '⭐', EXTRACT_FIELD: '🔍',
    SET_REMINDER: '⏰', ASSIGN_MANAGER: '👤', NOTIFY_MANAGER: '🔔',
    LOG_STAT: '📊', CONDITION: '🔀', DELAY: '⏳', END_SCENARIO: '🏁',
    UNSUBSCRIBE: '🚫', GOTO_STEP: '↩',
  };
  return m[type] ?? '▪';
}

function stepClass(type: BotStepType) {
  if (type === 'TRIGGER') return 'step-trigger';
  if (type === 'SEND_MESSAGE') return 'step-message';
  if (['SET_CRM_STATUS', 'SET_TAGS', 'SET_ORDER_STATUS', 'MARK_IMPORTANT', 'ASSIGN_MANAGER'].includes(type)) return 'step-crm';
  if (['CONDITION', 'GOTO_STEP'].includes(type)) return 'step-branch';
  if (['DELAY', 'SET_REMINDER'].includes(type)) return 'step-delay';
  if (['END_SCENARIO', 'UNSUBSCRIBE'].includes(type)) return 'step-end';
  return 'step-misc';
}

function stepSummary(step: BotStep): string {
  const c = step.config as any;
  if (!c) return '';
  if (step.type === 'TRIGGER') return c.event ?? '';
  if (step.type === 'SEND_MESSAGE') return (c.text ?? '').slice(0, 40);
  if (step.type === 'SET_CRM_STATUS') return c.statusId ? (crmStatuses.value.find((s) => s.id === c.statusId)?.name ?? c.statusId) : '';
  if (step.type === 'DELAY') return c.value ? `${c.value} ${c.unit}` : '';
  if (step.type === 'CONDITION') return c.type ?? '';
  if (step.type === 'EXTRACT_FIELD') return c.field ?? '';
  if (step.type === 'GOTO_STEP') return c.stepId ? 'к блоку' : '';
  return '';
}

const palette = [
  { type: 'TRIGGER' as BotStepType, icon: '⚡', label: 'Триггер', color: 'pal-trigger' },
  { type: 'SEND_MESSAGE' as BotStepType, icon: '💬', label: 'Сообщение', color: 'pal-msg' },
  { type: 'SET_CRM_STATUS' as BotStepType, icon: '🏷', label: 'CRM-статус', color: 'pal-crm' },
  { type: 'SET_TAGS' as BotStepType, icon: '🔖', label: 'Теги', color: 'pal-crm' },
  { type: 'SET_ORDER_STATUS' as BotStepType, icon: '📦', label: 'Статус заказа', color: 'pal-crm' },
  { type: 'CONDITION' as BotStepType, icon: '🔀', label: 'Условие', color: 'pal-branch' },
  { type: 'DELAY' as BotStepType, icon: '⏳', label: 'Задержка', color: 'pal-delay' },
  { type: 'EXTRACT_FIELD' as BotStepType, icon: '🔍', label: 'Читать поле', color: 'pal-misc' },
  { type: 'SET_REMINDER' as BotStepType, icon: '⏰', label: 'Напоминание', color: 'pal-delay' },
  { type: 'NOTIFY_MANAGER' as BotStepType, icon: '🔔', label: 'Уведомить', color: 'pal-misc' },
  { type: 'MARK_IMPORTANT' as BotStepType, icon: '⭐', label: 'Важный', color: 'pal-crm' },
  { type: 'END_SCENARIO' as BotStepType, icon: '🏁', label: 'Завершить', color: 'pal-end' },
  { type: 'UNSUBSCRIBE' as BotStepType, icon: '🚫', label: 'Отписать', color: 'pal-end' },
  { type: 'GOTO_STEP' as BotStepType, icon: '↩', label: 'Перейти', color: 'pal-branch' },
  { type: 'LOG_STAT' as BotStepType, icon: '📊', label: 'Статистика', color: 'pal-misc' },
  { type: 'ASSIGN_MANAGER' as BotStepType, icon: '👤', label: 'Менеджер', color: 'pal-crm' },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── Inline draggable-list component ─────────────────────────────────────────
// Simple ordered list without native DnD for SSR compatibility
defineComponent({ name: 'DraggableList' });
</script>

<!-- Fake component registration for SSR -->
<script lang="ts">
import { defineComponent } from 'vue';
const DraggableList = defineComponent({
  name: 'DraggableList',
  props: { items: { type: Array, default: () => [] } },
  emits: ['reorder'],
  template: `<div><template v-for="item in items"><slot name="item" :item="item" /></template></div>`,
});
export default { components: { DraggableList } };
</script>

<style scoped>
/* ─── Page ───────────────────────────────────────────────────────── */
.bots-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #f5f6fa; }

/* ─── Header ─────────────────────────────────────────────────────── */
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 8px; flex-shrink: 0; }
.page-title { font-size: 20px; font-weight: 700; color: #1e293b; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.toggle-archived { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; cursor: pointer; }

/* ─── Bot grid ───────────────────────────────────────────────────── */
.bot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 16px 20px; overflow-y: auto; }
.bot-card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border: 1px solid #e2e8f0; transition: box-shadow 0.15s; }
.bot-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.bot-card.archived { opacity: 0.55; }
.bot-card.enabled { border-left: 3px solid #10b981; }
.bot-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.bot-name { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 4px; }
.bot-meta { font-size: 12px; color: #94a3b8; margin-bottom: 12px; display: flex; gap: 6px; }
.bot-status { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
.bot-status.active { background: #dcfce7; color: #166534; }
.bot-status.inactive { background: #f1f5f9; color: #64748b; }
.type-badge { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 700; text-transform: uppercase; }
.type-badge.rule { background: #ede9fe; color: #7c3aed; }
.type-badge.scenario { background: #dbeafe; color: #1d4ed8; }
.bot-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.btn-sm { font-size: 11px; padding: 4px 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; cursor: pointer; white-space: nowrap; }
.btn-sm:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-sm.btn-danger:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

/* ─── Editor header ──────────────────────────────────────────────── */
.editor-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
.back-btn { background: none; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 600; white-space: nowrap; }
.back-btn:hover { text-decoration: underline; }
.editor-name-input { flex: 1; font-size: 16px; font-weight: 700; color: #1e293b; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; }
.editor-name-input:focus { border-color: #6366f1; outline: none; }
.enabled-toggle { margin-left: auto; }
.toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: #64748b; }
.toggle-label input { display: none; }
.toggle-slider { display: block; width: 36px; height: 20px; border-radius: 20px; background: #cbd5e1; position: relative; transition: background 0.2s; }
.toggle-label input:checked + .toggle-slider { background: #10b981; }
.toggle-slider::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
.toggle-label input:checked + .toggle-slider::after { left: 18px; }

/* ─── Editor body ────────────────────────────────────────────────── */
.editor-body { flex: 1; display: flex; overflow: hidden; }

/* ─── Step chain ─────────────────────────────────────────────────── */
.step-chain { width: 300px; flex-shrink: 0; border-right: 1px solid #e2e8f0; background: #f8fafc; display: flex; flex-direction: column; overflow-y: auto; padding: 12px; }
.chain-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
.chain-empty { font-size: 13px; color: #94a3b8; text-align: center; padding: 20px 0; }

.step-block { display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 8px; padding: 8px 10px; border: 2px solid transparent; cursor: pointer; margin-bottom: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.step-block.selected { border-color: #6366f1; }
.step-block.step-trigger { border-left: 4px solid #f59e0b; }
.step-block.step-message { border-left: 4px solid #6366f1; }
.step-block.step-crm { border-left: 4px solid #10b981; }
.step-block.step-branch { border-left: 4px solid #ef4444; }
.step-block.step-delay { border-left: 4px solid #8b5cf6; }
.step-block.step-end { border-left: 4px solid #64748b; }
.step-block.step-misc { border-left: 4px solid #94a3b8; }
.step-type-icon { font-size: 16px; flex-shrink: 0; }
.step-info { flex: 1; min-width: 0; }
.step-type-label { display: block; font-size: 12px; font-weight: 600; color: #1e293b; }
.step-summary { display: block; font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step-ctrl { display: flex; gap: 2px; }
.step-up, .step-dn, .step-del { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; color: #94a3b8; }
.step-up:hover, .step-dn:hover { color: #6366f1; background: #ede9fe; }
.step-del:hover { color: #ef4444; background: #fef2f2; }

.step-connector { text-align: center; font-size: 14px; color: #cbd5e1; margin: 2px 0; line-height: 1; }

/* ─── Palette ────────────────────────────────────────────────────── */
.palette { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
.palette-title { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
.palette-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.palette-btn { font-size: 11px; padding: 5px 6px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.palette-btn:hover { background: #f8fafc; }
.pal-trigger { border-color: #fde68a; background: #fffbeb; }
.pal-msg { border-color: #c7d2fe; background: #eef2ff; }
.pal-crm { border-color: #a7f3d0; background: #ecfdf5; }
.pal-branch { border-color: #fca5a5; background: #fff1f2; }
.pal-delay { border-color: #ddd6fe; background: #f5f3ff; }
.pal-end { border-color: #cbd5e1; background: #f8fafc; }
.pal-misc { border-color: #e2e8f0; background: #fff; }

/* ─── Config panel ───────────────────────────────────────────────── */
.config-panel { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.config-empty { margin: auto; text-align: center; color: #94a3b8; font-size: 14px; }
.config-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; }
.config-title { font-size: 15px; font-weight: 700; color: #1e293b; }
.config-save-btn { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.config-save-btn:hover { background: #4f46e5; }
.config-body { display: flex; flex-direction: column; gap: 14px; }
.config-no-config { font-size: 13px; color: #94a3b8; padding: 8px 0; }

.cfg-row { display: flex; flex-direction: column; gap: 5px; }
.cfg-label { font-size: 12px; color: #64748b; font-weight: 500; }
.cfg-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; }
.cfg-input:focus { border-color: #6366f1; }
.cfg-input-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; width: 80px; }
.cfg-select { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; }
.cfg-select-sm { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; width: 120px; }
.cfg-textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; resize: vertical; font-family: inherit; }
.cfg-textarea:focus { border-color: #6366f1; }
.cfg-check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; cursor: pointer; }
.cfg-hint { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.cfg-inline { flex-direction: row; align-items: center; }

.var-hints { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.var-chip { font-size: 11px; padding: 2px 7px; border-radius: 12px; background: #ede9fe; color: #7c3aed; cursor: pointer; }
.var-chip:hover { background: #ddd6fe; }

/* ─── Keyboard builder ───────────────────────────────────────────── */
.kb-options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.kb-row { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 6px; }
.kb-row-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.kb-row-label { font-size: 12px; color: #64748b; font-weight: 600; }
.kb-del-row { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 11px; }
.kb-btn-editor { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.kb-btn-label { flex: 1; min-width: 80px; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 7px; font-size: 12px; }
.kb-btn-type, .kb-btn-color { border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 7px; font-size: 12px; }
.kb-btn-payload, .kb-btn-link { flex: 1; min-width: 100px; border: 1px solid #d1d5db; border-radius: 6px; padding: 4px 7px; font-size: 12px; }
.kb-del-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; }
.kb-del-btn:hover { color: #ef4444; }
.kb-add-btn { font-size: 11px; color: #6366f1; background: none; border: 1px dashed #c7d2fe; border-radius: 6px; padding: 4px 10px; cursor: pointer; margin-top: 4px; }
.kb-add-row { width: 100%; font-size: 12px; color: #6366f1; background: none; border: 1px dashed #c7d2fe; border-radius: 8px; padding: 6px; cursor: pointer; margin-top: 4px; }

.kb-preview { margin-top: 10px; padding: 10px; background: #f0f4f8; border-radius: 8px; }
.kb-preview-label { font-size: 11px; color: #64748b; margin-bottom: 6px; }
.kb-preview-body { display: inline-block; }
.kb-preview-body.kb-inline { display: inline-flex; flex-direction: column; gap: 4px; }
.kb-preview-row { display: flex; gap: 4px; margin-bottom: 4px; }
.kb-preview-btn { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.kb-color-primary { background: #5181b8; color: #fff; }
.kb-color-secondary { background: #e8ecf0; color: #2c2d2e; }
.kb-color-positive { background: #4bb34b; color: #fff; }
.kb-color-negative { background: #e64646; color: #fff; }

/* ─── Tag selector ───────────────────────────────────────────────── */
.tag-selector { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-check { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 8px; }
.tag-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ─── Branch config ──────────────────────────────────────────────── */
.branch-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px; background: #f8fafc; border-radius: 6px; margin-bottom: 4px; }
.branch-label { font-size: 12px; font-weight: 600; color: #374151; min-width: 40px; }

/* ─── Next step selector ─────────────────────────────────────────── */
.cfg-next { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 5px; }

/* ─── Log panel ──────────────────────────────────────────────────── */
.log-panel { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.log-title { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
.log-row { display: flex; gap: 8px; font-size: 11px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
.log-time { color: #94a3b8; white-space: nowrap; }
.log-event { color: #6366f1; font-weight: 600; }
.log-action { color: #374151; }
.log-result { color: #64748b; font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }

/* ─── Shared ─────────────────────────────────────────────────────── */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 8px; color: #94a3b8; }
.empty-icon { font-size: 48px; }
.state-loading { display: flex; justify-content: center; padding: 48px; }
.spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 12px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
.modal-sm { max-width: 440px; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
.modal-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid #e5e7eb; }
.form-row { display: flex; flex-direction: column; gap: 5px; }
.form-label { font-size: 12px; color: #64748b; font-weight: 500; }
.form-input { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; }
.form-input:focus { border-color: #6366f1; }

.type-selector { display: flex; gap: 8px; }
.type-option { flex: 1; border: 2px solid #e2e8f0; border-radius: 8px; padding: 10px; cursor: pointer; text-align: left; background: #fff; display: flex; flex-direction: column; gap: 4px; }
.type-option strong { font-size: 13px; color: #1e293b; }
.type-option small { font-size: 11px; color: #64748b; }
.type-option.selected { border-color: #6366f1; background: #eef2ff; }
.type-option.selected strong { color: #4f46e5; }

.btn-primary { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style>
