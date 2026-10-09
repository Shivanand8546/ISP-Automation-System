import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error('Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD first.');
  }
  if (password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existingAdmin) {
    throw new Error('A super administrator already exists; bootstrap is only for an empty admin setup.');
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('That email is already registered.');
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log(`Created initial administrator: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Failed to create initial administrator.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });