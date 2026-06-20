/**
 * Создаёт первого ADMIN из переменных окружения и назначает ему GEN_DIRECTOR в мессенджере.
 * Запуск: npm run admin:create
 * Требует: ADMIN_EMAIL и ADMIN_PASSWORD в .env
 * Опционально: GENDIR_EMAIL (если отличается от ADMIN_EMAIL)
 */
import { PrismaClient, Role, MessengerRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL и ADMIN_PASSWORD должны быть заданы в .env');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, passwordHash, role: Role.ADMIN },
    });
    console.log(`✓ Администратор ${email} создан.`);
  } else {
    console.log(`Администратор ${email} уже существует.`);
  }

  // Назначить GEN_DIRECTOR для GENDIR_EMAIL (или ADMIN_EMAIL)
  const gendirEmail = process.env.GENDIR_EMAIL?.trim() || email;
  const updated = await prisma.user.updateMany({
    where: { email: gendirEmail, messengerRole: { not: MessengerRole.GEN_DIRECTOR } },
    data: {
      messengerRole: MessengerRole.GEN_DIRECTOR,
      firstName: (await prisma.user.findUnique({ where: { email: gendirEmail }, select: { firstName: true } }))?.firstName ?? 'Admin',
      lastName: (await prisma.user.findUnique({ where: { email: gendirEmail }, select: { lastName: true } }))?.lastName ?? 'User',
    },
  });
  if (updated.count > 0) {
    console.log(`✓ ${gendirEmail} → GEN_DIRECTOR`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
