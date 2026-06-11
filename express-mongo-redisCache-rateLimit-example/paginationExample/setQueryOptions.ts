//@ts-ignore
import { Request, Response, NextFunction } from 'express';

export const setQueryOptions = (config: { populate?: any; select?: string }) => {
    return (req: Request, res: Response, next: NextFunction) => {
        req.queryOptions = config;
        next();
    };
};