import { Injectable, OnModuleInit } from '@nestjs/common';

const { PrismaClient } = require('@prisma/client');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  [key: string]: any;

  async onModuleInit() {
    await this.$connect()
      .then(() => console.log('Connected to DB'))
      .catch((err) => console.log(err));
  }
  
}
