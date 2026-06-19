<script setup lang="ts">
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import { getAuth } from '~/app/api/generated/auth/auth';
import { useAuthStore } from '~/stores/auth';

definePageMeta({ layout: false });

const schema = toTypedSchema(
  z.object({
    email: z.string().email('Некорректный email'),
    password: z.string().min(6, 'Минимум 6 символов'),
  }),
);

const { handleSubmit, defineField, errors, isSubmitting } = useForm({ validationSchema: schema });
const [email, emailAttrs] = defineField('email');
const [password, passwordAttrs] = defineField('password');

const auth = useAuthStore();
const router = useRouter();
const serverError = ref('');

const onSubmit = handleSubmit(async (values) => {
  serverError.value = '';
  const { authControllerLogin } = getAuth();
  try {
    const res = await authControllerLogin({ email: values.email, password: values.password });
    auth.setToken(res.accessToken!);

    // Загружаем профиль чтобы знать роль
    const { authControllerMe } = getAuth();
    const me = await authControllerMe();
    auth.setUser({ id: me.id!, email: me.email!, role: me.role as 'ADMIN' | 'USER' });

    router.push('/');
  } catch (e: any) {
    serverError.value = e?.response?.data?.message ?? 'Ошибка входа. Проверьте данные.';
  }
});
</script>

<template>
  <div class="min-h-screen bg-background flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold tracking-tight">maxmazunin.ru</h1>
        <p class="text-muted-foreground mt-1 text-sm">Личный кабинет</p>
      </div>

      <div class="rounded-xl border bg-card shadow p-6">
        <form class="space-y-4" @submit="onSubmit">
          <div>
            <label class="text-sm font-medium block mb-1.5" for="email">Email</label>
            <input
              id="email" v-model="email" v-bind="emailAttrs"
              type="email" autocomplete="email" placeholder="admin@maxmazunin.ru"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="{ 'border-destructive': errors.email }"
            />
            <p v-if="errors.email" class="text-destructive text-xs mt-1">{{ errors.email }}</p>
          </div>

          <div>
            <label class="text-sm font-medium block mb-1.5" for="password">Пароль</label>
            <input
              id="password" v-model="password" v-bind="passwordAttrs"
              type="password" autocomplete="current-password" placeholder="••••••••"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="{ 'border-destructive': errors.password }"
            />
            <p v-if="errors.password" class="text-destructive text-xs mt-1">{{ errors.password }}</p>
          </div>

          <p v-if="serverError" class="text-destructive text-sm bg-destructive/10 rounded p-2.5">
            {{ serverError }}
          </p>

          <button
            type="submit" :disabled="isSubmitting"
            class="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ isSubmitting ? 'Входим…' : 'Войти' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
