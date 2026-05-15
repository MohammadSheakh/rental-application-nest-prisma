npx prisma generate

pnpm prisma generate --schema prisma/schema.prisma

// apply your first migration
> pnpm dlx prisma migrate dev --name init

// Now run the following command to generate the Prisma Client:
> pnpm dlx prisma generate


// watch nvidia gpu .. 
watch -n 1 nvidia-smi
