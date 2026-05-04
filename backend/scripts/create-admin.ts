/**
 * Run once to create the initial admin user.
 * Usage: npm run create-admin
 * Or:    ADMIN_EMAIL=hr@yourco.com ADMIN_PASSWORD=SecurePass@1 ADMIN_NAME="HR Admin" npm run create-admin
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email    = process.env.ADMIN_EMAIL    || 'vijuadmin@imocha.io';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const name     = process.env.ADMIN_NAME     || 'HR Admin';

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where:  { email },
    update: { password: hashed, name },
    create: { email, password: hashed, name, role: 'ADMIN' },
  });

  console.log('✅ Admin user ready:', user.email);
  console.log('   Role:', user.role);
  console.log('   Login at your Talent Hub frontend URL');
}

main()
  .catch((e) => { console.error('❌ Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
