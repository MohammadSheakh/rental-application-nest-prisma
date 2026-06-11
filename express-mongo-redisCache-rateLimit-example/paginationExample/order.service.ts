async getAllWithPagination(
    filters: any, // Partial<INotification> // FixMe : fix type
    options: PaginateOptions,
    populateOptions ?: any,
    select ? : string | string[]
) {
    const result = await this.model.paginate(filters, options, populateOptions, select);

    return result;
}