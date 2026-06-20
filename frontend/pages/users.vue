<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import { getUsers } from '~/app/api/generated/users/users';
import type { UserResponse, MessengerRole } from '~/app/api/generated/maxmazuninRuPersonalCabinetAPI.schemas';

definePageMeta({ middleware: ['auth', 'admin'] });

const users = ref<UserResponse[]>([]);
const loadError = ref('');

async function loadUsers() {
  const { usersControllerFindAll } = getUsers();
  try {
    users.value = (await usersControllerFindAll()) as UserResponse[];
  } catch (e: any) {
    loadError.value = e?.response?.data?.message ?? 'Ошибка загрузки';
  }
}

onMounted(loadUsers);

// ─── Create form ─────────────────────────────────────────────────────────────

const schema = toTypedSchema(
  z.object({
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Минимум 6 символов'),
    role: z.enum(['ADMIN', 'USER']),
  }),
);

const { handleSubmit, defineField, errors, isSubmitting, resetForm } = useForm({
  validationSchema: schema,
  initialValues: { role: 'USER' },
});

const [email, emailAttrs] = defineField('email');
const [password, passwordAttrs] = defineField('password');
const [role, roleAttrs] = defineField('role');

const createError = ref('');

const onCreate = handleSubmit(async (values) => {
  createError.value = '';
  const { usersControllerCreate } = getUsers();
  try {
    await usersControllerCreate({ email: values.email, password: values.password, role: values.role });
    resetForm();
    await loadUsers();
  } catch (e: any) {
    createError.value = e?.response?.data?.message ?? 'Ошибка создания';
  }
});

async function onDelete(id: string) {
  if (!confirm('Удалить пользователя?')) return;
  const { usersControllerRemove } = getUsers();
  try {
    await usersControllerRemove(id);
    await loadUsers();
  } catch (e: any) {
    alert(e?.response?.data?.message ?? 'Ошибка удаления');
  }
}

// ─── Edit profile modal ───────────────────────────────────────────────────────

const editingUser = ref<UserResponse | null>(null);
const editForm = reactive({
  firstName: '',
  lastName: '',
  nickname: '',
  jobTitle: '',
  messengerRole: '' as string,
  avatarUrl: '',
});
const editError = ref('');
const editSaving = ref(false);

const MESSENGER_ROLES: MessengerRole[] = [
  'GEN_DIRECTOR','COMMERCIAL_DIRECTOR','SALES_DIRECTOR','ROP',
  'MANAGER','DESIGN_DIRECTOR','DESIGNER','PRODUCTION_HEAD',
  'ASSEMBLER','PROGRAMMER','ACCOUNTANT','OTHER',
] as MessengerRole[];

function openEdit(u: UserResponse) {
  editingUser.value = u;
  editForm.firstName = u.firstName ?? '';
  editForm.lastName = u.lastName ?? '';
  editForm.nickname = u.nickname ?? '';
  editForm.jobTitle = u.jobTitle ?? '';
  editForm.messengerRole = u.messengerRole ?? 'OTHER';
  editForm.avatarUrl = u.avatarUrl ?? '';
  editError.value = '';
}

async function saveEdit() {
  if (!editingUser.value) return;
  editSaving.value = true;
  editError.value = '';
  try {
    const { usersControllerUpdateProfile } = getUsers();
    await usersControllerUpdateProfile(editingUser.value.id!, {
      firstName: editForm.firstName || undefined,
      lastName: editForm.lastName || undefined,
      nickname: editForm.nickname || undefined,
      jobTitle: editForm.jobTitle || undefined,
      messengerRole: (editForm.messengerRole as MessengerRole) || undefined,
      avatarUrl: editForm.avatarUrl || undefined,
    });
    editingUser.value = null;
    await loadUsers();
  } catch (e: any) {
    editError.value = e?.response?.data?.message ?? 'Ошибка сохранения';
  } finally {
    editSaving.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-background overflow-x-hidden">
    <header class="border-b px-4 py-3 flex items-center gap-3">
      <NuxtLink to="/" class="text-sm text-muted-foreground hover:underline shrink-0">← Назад</NuxtLink>
      <span class="font-bold truncate">Управление пользователями</span>
      <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium shrink-0">ADMIN</span>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <!-- Список -->
      <section>
        <h2 class="font-semibold mb-4">Пользователи ({{ users.length }})</h2>
        <p v-if="loadError" class="text-destructive text-sm">{{ loadError }}</p>

        <!-- Desktop table -->
        <div class="hidden md:block rounded-xl border bg-card overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="text-left px-3 py-2.5 font-medium">Email</th>
                <th class="text-left px-3 py-2.5 font-medium">Имя</th>
                <th class="text-left px-3 py-2.5 font-medium">@никнейм</th>
                <th class="text-left px-3 py-2.5 font-medium">Роль</th>
                <th class="text-left px-3 py-2.5 font-medium">Должность</th>
                <th class="text-left px-3 py-2.5 font-medium">Создан</th>
                <th class="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in users" :key="u.id"
                class="border-t hover:bg-muted/30 transition-colors"
              >
                <td class="px-3 py-2.5 truncate max-w-[160px]">{{ u.email }}</td>
                <td class="px-3 py-2.5 truncate max-w-[120px]">{{ u.firstName }} {{ u.lastName }}</td>
                <td class="px-3 py-2.5 text-muted-foreground">{{ u.nickname ? `@${u.nickname}` : '—' }}</td>
                <td class="px-3 py-2.5">
                  <span class="text-xs px-1.5 py-0.5 rounded font-medium" :class="u.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-secondary-foreground'">{{ u.role }}</span>
                </td>
                <td class="px-3 py-2.5 text-xs text-muted-foreground">{{ u.messengerRole ?? '—' }}</td>
                <td class="px-3 py-2.5 text-muted-foreground text-xs">{{ new Date(u.createdAt!).toLocaleDateString('ru') }}</td>
                <td class="px-3 py-2.5 text-right space-x-2">
                  <button class="text-xs text-primary hover:underline" @click="openEdit(u)">Изменить</button>
                  <button class="text-xs text-destructive hover:underline" @click="onDelete(u.id!)">Удалить</button>
                </td>
              </tr>
              <tr v-if="users.length === 0">
                <td colspan="7" class="px-4 py-6 text-center text-muted-foreground">Нет пользователей</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden space-y-2">
          <div v-if="users.length === 0" class="text-sm text-muted-foreground text-center py-6">Нет пользователей</div>
          <div
            v-for="u in users" :key="u.id"
            class="border rounded-xl bg-card p-4 space-y-1"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-sm truncate">{{ u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.email }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0" :class="u.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-secondary-foreground'">{{ u.role }}</span>
            </div>
            <div class="text-xs text-muted-foreground truncate">{{ u.email }}</div>
            <div v-if="u.nickname" class="text-xs text-muted-foreground">@{{ u.nickname }}</div>
            <div v-if="u.messengerRole" class="text-xs text-muted-foreground">{{ u.messengerRole }}</div>
            <div class="flex gap-3 pt-1">
              <button class="text-xs text-primary hover:underline" @click="openEdit(u)">Изменить</button>
              <button class="text-xs text-destructive hover:underline" @click="onDelete(u.id!)">Удалить</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Форма создания -->
      <section>
        <h2 class="font-semibold mb-4">Добавить пользователя</h2>
        <div class="rounded-xl border bg-card shadow p-5">
          <form class="space-y-4" @submit="onCreate">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Email</label>
                <input v-model="email" v-bind="emailAttrs" type="email" placeholder="user@example.com"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="{ 'border-destructive': errors.email }" />
                <p v-if="errors.email" class="text-destructive text-xs mt-1">{{ errors.email }}</p>
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">Пароль</label>
                <input v-model="password" v-bind="passwordAttrs" type="password" placeholder="••••••••"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="{ 'border-destructive': errors.password }" />
                <p v-if="errors.password" class="text-destructive text-xs mt-1">{{ errors.password }}</p>
              </div>
            </div>
            <div class="flex items-end gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Роль</label>
                <select v-model="role" v-bind="roleAttrs"
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <button type="submit" :disabled="isSubmitting"
                class="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50">
                {{ isSubmitting ? 'Создаём…' : 'Создать' }}
              </button>
            </div>
            <p v-if="createError" class="text-destructive text-sm bg-destructive/10 rounded p-2">{{ createError }}</p>
          </form>
        </div>
      </section>
    </main>

    <!-- ─── Edit modal ─────────────────────────────────────────────────────── -->
    <div v-if="editingUser" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="editingUser = null">
      <div class="bg-background rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h2 class="text-lg font-bold">Редактировать профиль</h2>
        <p class="text-xs text-muted-foreground truncate">{{ editingUser.email }}</p>

        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-xs font-medium block mb-1">Имя</label>
              <input v-model="editForm.firstName" placeholder="Иван"
                class="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label class="text-xs font-medium block mb-1">Фамилия</label>
              <input v-model="editForm.lastName" placeholder="Петров"
                class="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div>
            <label class="text-xs font-medium block mb-1">Никнейм</label>
            <div class="flex items-center">
              <span class="px-3 py-2 border border-r-0 rounded-l-lg bg-muted text-sm">@</span>
              <input v-model="editForm.nickname" placeholder="ivan_petrov"
                class="flex-1 border rounded-r-lg px-3 py-2 text-sm bg-background" />
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">Латиница, цифры, ._-</p>
          </div>
          <div>
            <label class="text-xs font-medium block mb-1">Должность (текст)</label>
            <input v-model="editForm.jobTitle" placeholder="Менеджер"
              class="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
          <div>
            <label class="text-xs font-medium block mb-1">Роль в мессенджере</label>
            <select v-model="editForm.messengerRole"
              class="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option v-for="r in MESSENGER_ROLES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium block mb-1">URL аватарки</label>
            <input v-model="editForm.avatarUrl" placeholder="https://..."
              class="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
        </div>

        <p v-if="editError" class="text-sm text-destructive">{{ editError }}</p>

        <div class="flex gap-2">
          <button class="flex-1 py-2 rounded-xl border text-sm" @click="editingUser = null">Отмена</button>
          <button class="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            :disabled="editSaving" @click="saveEdit">
            {{ editSaving ? 'Сохраняем…' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
