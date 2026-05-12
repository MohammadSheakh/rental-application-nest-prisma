import { PrismaClient } from '@app/database/prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

import { seedRoles } from './seeds/role.seed';
import { seedUsers } from './seeds/user.seed';
import { seedCategories } from './seeds/category.seed';
import { seedItems } from './seeds/item.seed';

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Foundation: Roles
  await seedRoles(prisma);

  // 2. Identity: Users
  await seedUsers(prisma);

  // 3. Catalog: Categories
  await seedCategories(prisma);

  // 4. Products: Items
  await seedItems(prisma);

  console.log('✨ Seed process completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
