import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaginateOptions, PaginateResult } from '../shared/types/paginate';

type PrismaDelegate<TRecord = any> = {
  findUnique(args: any): Promise<TRecord | null>;
  findFirst(args: any): Promise<TRecord | null>;
  findMany(args: any): Promise<TRecord[]>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<TRecord>;
  update(args: any): Promise<TRecord>;
  delete(args: any): Promise<TRecord>;
};

/**
 * Generic Prisma CRUD service.
 *
 * Pass a Prisma model delegate, for example `prisma.user`, from a feature service:
 *
 * ```ts
 * export class UserService extends GenericService {
 *   constructor(prisma: PrismaService) {
 *     super(prisma.user);
 *   }
 * }
 * ```
 */
@Injectable()
export class GenericService<TDelegate = any, TRecord = any> {
  protected delegate: PrismaDelegate<TRecord>;
  protected model: any;
  protected defaultSelect?: Record<string, boolean>;

  constructor(delegate: TDelegate, defaultSelect?: Record<string, boolean>) {
    this.delegate = delegate as PrismaDelegate<TRecord>;
    // Backward-compatible alias while older modules are migrated away from Mongoose.
    this.model = delegate;
    this.defaultSelect = defaultSelect;
  }

  async findById(
    id: string,
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Promise<TRecord | null> {
    this.validateId(id);

    return this.delegate.findUnique({
      where: { id },
      ...this.buildProjection(include, select),
    });
  }

  async findAll(
    filters: Record<string, any> = {},
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Promise<TRecord[]> {
    return this.delegate.findMany({
      where: this.cleanFilters(filters),
      ...this.buildProjection(include, select),
    });
  }

  async findAllWithPagination(
    filters: Record<string, any> = {},
    options: PaginateOptions,
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Promise<PaginateResult<TRecord>> {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const where = this.cleanFilters(filters);
    const orderBy = this.parseSort(options.sortBy);

    const [docs, total] = await Promise.all([
      this.delegate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        ...this.buildProjection(include, select),
      }),
      this.delegate.count({ where }),
    ]);

    return {
      docs,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Record<string, any>): Promise<TRecord> {
    return this.delegate.create({
      data,
      ...this.buildProjection(),
    });
  }

  async updateById(id: string, data: Record<string, any>): Promise<TRecord | null> {
    this.validateId(id);

    try {
      return await this.delegate.update({
        where: { id },
        data,
        ...this.buildProjection(),
      });
    } catch (error) {
      this.throwNotFoundOnMissingRecord(error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<TRecord> {
    this.validateId(id);

    try {
      return await this.delegate.delete({ where: { id } });
    } catch (error) {
      this.throwNotFoundOnMissingRecord(error);
      throw error;
    }
  }

  async softDeleteById(id: string): Promise<TRecord | null> {
    return this.updateById(id, {
      isDeleted: true,
      deletedAt: new Date(),
    });
  }

  async count(filters: Record<string, any> = {}): Promise<number> {
    return this.delegate.count({ where: this.cleanFilters(filters) });
  }

  async exists(filters: Record<string, any> = {}): Promise<boolean> {
    const count = await this.count(filters);
    return count > 0;
  }

  protected buildProjection(
    include?: Record<string, any>,
    select?: Record<string, boolean>,
  ): Record<string, any> {
    if (include) {
      return { include };
    }

    if (select) {
      return { select };
    }

    if (this.defaultSelect) {
      return { select: this.defaultSelect };
    }

    return {};
  }

  protected cleanFilters(filters: Record<string, any>): Record<string, any> {
    const controlKeys = new Set(['page', 'limit', 'sortBy', 'include', 'populate', 'select']);
    return Object.fromEntries(
      Object.entries(filters).filter((entry) => {
        const [key, value] = entry;
        return !controlKeys.has(key) && value !== undefined && value !== '';
      }),
    );
  }

  protected parseSort(sortBy?: string): Record<string, 'asc' | 'desc'> | undefined {
    if (!sortBy) {
      return { createdAt: 'desc' };
    }

    if (sortBy.startsWith('-')) {
      return { [sortBy.slice(1)]: 'desc' };
    }

    return { [sortBy]: 'asc' };
  }

  protected validateId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('Invalid ID');
    }
  }

  protected throwNotFoundOnMissingRecord(error: any): void {
    if (error?.code === 'P2025') {
      throw new NotFoundException('Record not found');
    }
  }
}
