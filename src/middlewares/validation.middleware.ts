import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod/v4";
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues,
      });
      return;
    }

    req.params = result.data as any;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues,
      });
      return;
    }

    req.query = result.data as any;
    next();
  };
}
