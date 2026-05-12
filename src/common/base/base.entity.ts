import { Document, Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { PaginateOptions, PaginateResult } from '../../types/paginate';

/**
 * Base Entity Interface
 * All entities should extend this
 */
export interface IBaseEntity extends Document {
  _id: any;
  createdAt?: Date;
  updatedAt?: Date;
  isDeleted?: boolean;
}

/**
 * Base Service Interface
 * Defines common CRUD operations
 */
export interface IBaseService<T extends IBaseEntity> {
  findById(id: string, populateOptions?: any, select?: string): Promise<T | null>;
  findAll(
    filters?: FilterQuery<T>,
    populateOptions?: any,
    select?: string,
  ): Promise<T[]>;
  findAllWithPagination(
    filters: FilterQuery<T>,
    options: PaginateOptions,
    populateOptions?: any,
    select?: string,
  ): Promise<PaginateResult<T>>;
  create(data: Partial<T>): Promise<T>;
  updateById(
    id: string,
    data: UpdateQuery<T>,
    options?: QueryOptions,
  ): Promise<T | null>;
  deleteById(id: string): Promise<T | null>;
  softDeleteById(id: string): Promise<T | null>;
  count(filters?: FilterQuery<T>): Promise<number>;
  exists(filters?: FilterQuery<T>): Promise<boolean>;
}
