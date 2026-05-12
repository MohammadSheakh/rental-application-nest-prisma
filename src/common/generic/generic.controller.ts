import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseObjectIdPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { PaginateOptions } from '../../types/paginate';
import { IBaseEntity } from '../base/base.entity';
import { GenericService } from '../generic/generic.service';

/**
 * Generic Controller
 * 
 * 📚 EXPRESS → NESTJS TRANSITION
 * 
 * Express Pattern:
 * - class UserController extends GenericController<typeof User, IUser>
 * - Manual route definitions
 * - req.params.id, req.body, req.query
 * 
 * NestJS Pattern:
 * - Decorators for CRUD operations
 * - Generic type parameters
 * - @Param(), @Body(), @Query() decorators
 * - Automatic response transformation
 * 
 * Key Benefits:
 * ✅ Reusable across all modules
 * ✅ Consistent API structure
 * ✅ Automatic Swagger documentation
 * ✅ Type-safe operations
 * ✅ DRY principle
 * 
 * Usage Example:
 * ```typescript
 * @Controller('users')
 * @ApiTags('Users')
 * export class UserController extends GenericController<typeof User, UserDocument> {
 *   constructor(
 *     private userService: UserService,
 *   ) {
 *     super(userService, 'User');
 *   }
 * 
 *   // Add custom endpoints here
 *   @Get('me')
 *   async getCurrentUser(@User() user: UserPayload) {
 *     return this.userService.findById(user.userId);
 *   }
 * }
 * ```
 */
@Controller()
@ApiTags('Generic')
export class GenericController<
  TModel extends Model<TDocument>,
  TDocument extends IBaseEntity,
> {
  protected modelName: string;

  constructor(
    protected service: GenericService<TModel, TDocument>,
    modelName: string,
  ) {
    this.modelName = modelName;
  }

  /**
   * GET /:id
   * Get document by ID
   */
  @Get(':id')
  @ApiOperation({ summary: `Get ${this.modelName} by ID` })
  @ApiParam({ name: 'id', description: `${this.modelName} ID` })
  @ApiResponse({ status: 200, description: `${this.modelName} retrieved successfully` })
  @ApiResponse({ status: 404, description: `${this.modelName} not found` })
  async getById(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('populate') populate?: string,
    @Query('select') select?: string,
  ) {
    const populateOptions = populate ? this.parsePopulate(populate) : undefined;
    return await this.service.findById(id, populateOptions, select);
  }

  /**
   * GET /
   * Get all documents (no pagination)
   */
  @Get()
  @ApiOperation({ summary: `Get all ${this.modelName}s` })
  @ApiResponse({ status: 200, description: `${this.modelName}s retrieved successfully` })
  async getAll(
    @Query() filters?: any,
    @Query('populate') populate?: string,
    @Query('select') select?: string,
  ) {
    const populateOptions = populate ? this.parsePopulate(populate) : undefined;
    return await this.service.findAll(filters, populateOptions, select);
  }

  /**
   * GET /paginate
   * Get all documents with pagination
   */
  @Get('paginate')
  @ApiOperation({ summary: `Get ${this.modelName}s with pagination` })
  @ApiResponse({ status: 200, description: `${this.modelName}s retrieved successfully` })
  async getAllWithPagination(
    @Query() filters?: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('populate') populate?: string,
    @Query('select') select?: string,
  ) {
    const options: PaginateOptions = {
      page: page || 1,
      limit: limit || 10,
      sortBy: sortBy || '-createdAt',
    };

    const populateOptions = populate ? this.parsePopulate(populate) : undefined;
    return await this.service.findAllWithPagination(
      filters,
      options,
      populateOptions,
      select,
    );
  }

  /**
   * POST /
   * Create new document
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: `Create new ${this.modelName}` })
  @ApiResponse({ status: 201, description: `${this.modelName} created successfully` })
  async create(@Body() data: Partial<TDocument>) {
    return await this.service.create(data);
  }

  /**
   * PUT /:id
   * Update document by ID
   */
  @Put(':id')
  @ApiOperation({ summary: `Update ${this.modelName} by ID` })
  @ApiParam({ name: 'id', description: `${this.modelName} ID` })
  @ApiResponse({ status: 200, description: `${this.modelName} updated successfully` })
  @ApiResponse({ status: 404, description: `${this.modelName} not found` })
  async updateById(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() data: Partial<TDocument>,
  ) {
    return await this.service.updateById(id, data as any);
  }

  /**
   * DELETE /:id
   * Delete document by ID (hard delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: `Delete ${this.modelName} by ID` })
  @ApiParam({ name: 'id', description: `${this.modelName} ID` })
  @ApiResponse({ status: 204, description: `${this.modelName} deleted successfully` })
  @ApiResponse({ status: 404, description: `${this.modelName} not found` })
  async deleteById(@Param('id', ParseObjectIdPipe) id: string) {
    await this.service.deleteById(id);
    return null;
  }

  /**
   * DELETE /:id/soft
   * Soft delete document by ID
   */
  @Delete(':id/soft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: `Soft delete ${this.modelName} by ID` })
  @ApiParam({ name: 'id', description: `${this.modelName} ID` })
  @ApiResponse({ status: 204, description: `${this.modelName} soft deleted successfully` })
  @ApiResponse({ status: 404, description: `${this.modelName} not found` })
  async softDeleteById(@Param('id', ParseObjectIdPipe) id: string) {
    await this.service.softDeleteById(id);
    return null;
  }

  /**
   * GET /count
   * Count documents
   */
  @Get('count')
  @ApiOperation({ summary: `Count ${this.modelName}s` })
  @ApiResponse({ status: 200, description: `${this.modelName} count retrieved` })
  async count(@Query() filters?: any) {
    return await this.service.count(filters);
  }

  /**
   * Parse populate string to array
   * Example: 'createdById,assignedUserIds' => ['createdById', 'assignedUserIds']
   */
  private parsePopulate(populate: string): any[] {
    return populate.split(',').map((field) => ({
      path: field.trim(),
      select: '-__v',
    }));
  }
}
