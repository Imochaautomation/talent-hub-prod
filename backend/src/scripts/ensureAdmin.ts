import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'vijuadmin@imocha.io').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const name = (process.env.ADMIN_NAME || 'HR Admin').trim();

  if (!password) {
    logger.warn('[Admin] ADMIN_PASSWORD is not set; skipping admin account upsert.');
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashed,
      name,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      email,
      password: hashed,
      name,
      role: 'ADMIN',
      isActive: true,
    },
  });

  logger.info(`[Admin] Admin account ready: ${user.email}`);
}

ensureAdmin()
  .catch((error) => {
    logger.error('[Admin] Failed to ensure admin account:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
