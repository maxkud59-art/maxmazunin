<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import { getUsers } from '~/app/api/generated/users/users';

definePageMeta({ middleware: ['auth', 'admin'] });

type UserRow = { id: string; email: string; role: string; createdAt: string };

const users = ref<UserRow[]>([]);
const loadError = ref('');

async function loadUsers() {
  const { usersControllerFindAll } = getUsers();
  try {
    users.value = (await usersControllerFindAll()) as UserRow[];
  } catch (e: any) {
    loadError.value = e?.response?.data?.message ?? 'Ошибка загрузки';
  }
}

onMounted(loadUsers);

// Форма создания
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
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b px-6 py-4 flex items-center gap-4">
      <NuxtLink to="/" class="text-sm text-muted-foreground hover:underline">← Назад</NuxtLink>
      <span class="font-bold">Управление пользователями</span>
      <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">ADMIN</span>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-10 space-y-10">
      <!-- Список -->
      <section>
        <h2 class="font-semibold mb-4">Пользователи ({{ users.length }})</h2>
        <p v-if="loadError" class="text-destructive text-sm">{{ loadError }}</p>
        <div class="rounded-xl border bg-card overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="text-left px-4 py-2.5 font-medium">Email</th>
                <th class="text-left px-4 py-2.5 font-medium">Роль</th>
                <th class="text-left px-4 py-2.5 font-medium">Создан</th>
                <th class="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in users" :key="u.id"
                class="border-t hover:bg-muted/30 transition-colors"
              >
                <td class="px-4 py-2.5">{{ u.email }}</td>
                <td class="px-4 py-2.5">
                  <span
                    class="text-xs px-2 py-0.5 rounded font-medium"
                    :class="u.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-secondary-foreground'"
                  >{{ u.role }}</span>
                </td>
                <td class="px-4 py-2.5 text-muted-foreground">{{ new Date(u.createdAt).toLocaleDateString('ru') }}</td>
                <td class="px-4 py-2.5 text-right">
                  <button
                    class="text-xs text-destructive hover:underline"
                    @click="onDelete(u.id)"
                  >Удалить</button>
                </td>
              </tr>
              <tr v-if="users.length === 0">
                <td colspan="4" class="px-4 py-6 text-center text-muted-foreground">Нет пользователей</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Форма создания -->
      <section>
        <h2 class="font-semibold mb-4">Добавить пользователя</h2>
        <div class="rounded-xl border bg-card shadow p-6">
          <form class="space-y-4" @submit="onCreate">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Email</label>
                <input
                  v-model="email" v-bind="emailAttrs" type="email" placeholder="user@example.com"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="{ 'border-destructive': errors.email }"
                />
                <p v-if="errors.email" class="text-destructive text-xs mt-1">{{ errors.email }}</p>
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">Пароль</label>
                <input
                  v-model="password" v-bind="passwordAttrs" type="password" placeholder="••••••••"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :class="{ 'border-destructive': errors.password }"
                />
                <p v-if="errors.password" class="text-destructive text-xs mt-1">{{ errors.password }}</p>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Роль</label>
                <select
                  v-model="role" v-bind="roleAttrs"
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div class="mt-5">
                <button
                  type="submit" :disabled="isSubmitting"
                  class="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {{ isSubmitting ? 'Создаём…' : 'Создать' }}
                </button>
              </div>
            </div>

            <p v-if="createError" class="text-destructive text-sm bg-destructive/10 rounded p-2">
              {{ createError }}
            </p>
          </form>
        </div>
      </section>
    </main>
  </div>
</template>
