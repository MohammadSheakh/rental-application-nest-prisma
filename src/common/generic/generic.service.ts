import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Model, FilterQuery, UpdateQuery, QueryOptions, Types } from 'mongoose';
import { PaginateOptions, PaginateResult } from '../../types/paginate';
import { IBaseEntity, IBaseService } from '../base/base.entity';

/**
 * Generic Service
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - class GenericService extends GenericService<Model, Document>
 * - Manual model injection in constructor
 * - Direct Mongoose calls
 * 
 * NestJS Pattern:
 * - @Injectable() decorator
 * - Generic type parameters <TModel, TDocument>
 * - @InjectModel for Mongoose model injection
 * - Type-safe CRUD operations
 * 
 * Key Benefits:
 * ✅ Reusable across all modules
 * ✅ Type-safe (TypeScript generics)
 * ✅ Consistent CRUD operations
 * ✅ Easy to extend
 * ✅ DRY principle
 * 
 * Usage Example:
 * ```typescript
 * @Injectable()
 * export class UserService extends GenericService<typeof User, UserDocument> {
 *   constructor(
 *     @InjectModel('User') userModel: Model<UserDocument>,
 *   ) {
 *     super(userModel);
 *   }
 * 
 *   // Add custom methods here
 *   async findByEmail(email: string) {
 *     return this.model.findOne({ email }).exec();
 *   }
 * }
 * ```
 */
@Injectable()
export class GenericService<
  TModel extends Model<TDocument>,
  TDocument extends IBaseEntity,
> implements IBaseService<TDocument>
{
  protected model: TModel;

  constructor(model: TModel) {
    this.model = model;
  }

  /**
   * Find by ID
   */
  async findById(
    id: string,
    populateOptions?: any,
    select?: string,
  ): Promise<TDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    let query = this.model.findById(id);

    if (select) {
      query = query.select(select);
    }

    if (populateOptions) {
      query = query.populate(populateOptions);
    }

    return query.lean().exec();
  }

  /**
   * Find all (no pagination)
   */
  async findAll(
    filters?: FilterQuery<TDocument>,
    populateOptions?: any,
    select?: string,
  ): Promise<TDocument[]> {
    let query = this.model.find(filters);

    if (select) {
      query = query.select(select);
    }

    if (populateOptions) {
      query = query.populate(populateOptions);
    }

    return query.lean().exec();
  }

  /**
   * Find all with pagination
   */
  async findAllWithPagination(
    filters: FilterQuery<TDocument>,
    options: PaginateOptions,
    populateOptions?: any,
    select?: string,
  ): Promise<PaginateResult<TDocument>> {
    let query = this.model.find(filters);

    if (select) {
      query = query.select(select);
    }

    if (populateOptions) {
      query = query.populate(populateOptions);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 10;
    const sortBy = options.sortBy || '-createdAt';

    query = query.sort(sortBy).skip((page - 1) * limit).limit(limit);

    const [docs, total] = await Promise.all([
      query.lean().exec(),
      this.model.countDocuments(filters).exec(),
    ]);

    return {
      docs,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    } as PaginateResult<TDocument>;
  }

  /**
   * Create new document
   */
  async create(data: Partial<TDocument>): Promise<TDocument> {
    return this.model.create(data);
  }

  /**
   * Update by ID
   */
  async updateById(
    id: string,
    data: UpdateQuery<TDocument>,
    options?: QueryOptions,
  ): Promise<TDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    return this.model
      .findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
        ...options,
      })
      .lean()
      .exec();
  }

  /**
   * Delete by ID (hard delete)
   */
  async deleteById(id: string): Promise<TDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const result = await this.model.findByIdAndDelete(id).lean().exec();

    if (!result) {
      throw new NotFoundException('Document not found');
    }

    return result;
  }

  /**
   * Soft delete by ID
   * Sets isDeleted = true instead of removing
   */
  async softDeleteById(id: string): Promise<TDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    return this.model
      .findByIdAndUpdate(
        id,
        {
          isDeleted: true,
          deletedAt: new Date(),
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
  }

  /**
   * Count documents
   */
  async count(filters?: FilterQuery<TDocument>): Promise<number> {
    return this.model.countDocuments(filters).exec();
  }

  /**
   * Check if document exists
   */
  async exists(filters?: FilterQuery<TDocument>): Promise<boolean> {
    const count = await this.count(filters);
    return count > 0;
  }
}
