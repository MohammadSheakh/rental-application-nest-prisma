router.route('/paginate').get(
  auth(TRole.admin, TRole.patient),
  validateFiltersForQuery(optionValidationChecking(['_id', 
    'orderRelatedTo', // only one option available .. which is product
    'userId', // who place the order
    'status', // pending-processing-confirmed-completed-failed-refunded-cancelled
    'finalAmount', 
    'paymentMethod',
    'paymentTransactionId',
    'paymentStatus', // unpaid-paid-refunded
    'isDeleted',
    ...paginationOptions])),
    setQueryOptions({
        populate: [
          { path: 'userId', select: 'name', /* populate: { path : ""} */ },
        ],
        select: '-isDeleted  -updatedAt -__v' //-createdAt
      }),
  controller.getAllWithPaginationV2

  