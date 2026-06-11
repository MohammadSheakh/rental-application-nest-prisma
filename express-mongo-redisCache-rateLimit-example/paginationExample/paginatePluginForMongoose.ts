//@ts-ignore
import { FilterQuery, Schema } from 'mongoose';
//@ts-ignore
import { PaginateOptions, PaginateResult } from '../../types/paginate';

// Plugin function for pagination 
const paginate = <T>(schema: Schema<T>) => {
    schema.statics.paginate = async function (
        filter: FilterQuery<T>,
        options: PaginateOptions,
        populateOptions?: string[] | PopulateOption[], // any,
        dontWantToInclude?: string | string[]
    ): Promise<PaginateResult<T>> {
        const limit = options.limit ?? 10; // ?? 10 //  Number.MAX_SAFE_INTEGER
        const page = options.page ?? 1;
        const skip = (page - 1) * limit;
        const sort = options.sortBy ?? 'createdAt';
        const countPromise = this.countDocuments(filter).exec();
        let query = this.find(filter).select(dontWantToInclude).sort(sort).skip(skip).limit(limit);
        // TODO : This gives us exact Match .. we have to add partial match ..

        if (populateOptions && populateOptions.length > 0) {

            // Check if it's the old format (array of strings)
            if (typeof populateOptions[0] === 'string') {
                // Old format: ['attachments', 'siteId']
                populateOptions.forEach(field => {
                    query = query.populate(field as string);
                });
            } else {
                // New format: [{path: 'attachments', select: 'filename'}, ...]
                populateOptions.forEach(option => {
                    query = query.populate(option);
                });
            }
        }

        // if (options.populate) {
        //   query = query.populate(options.populate);
        // }

        const [totalResults, results] = await Promise.all([
            countPromise,
            query.exec(),
        ]);

        return {
            results,
            page,
            limit,
            totalPages: Math.ceil(totalResults / limit),
            totalResults,
        };
    };
};

// Updated type definitions
interface PopulateOption {
    path: string;
    select?: string;
    model?: string;
    populate?: PopulateOption | PopulateOption[];
}

type PopulateOptions = string[] | PopulateOption[];

interface PaginateOptions {
    limit?: number;
    page?: number;
    sortBy?: string;
    populate?: string | PopulateOption | PopulateOption[]; // Keep existing populate for backward compatibility
}


export default paginate;

