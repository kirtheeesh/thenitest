import { z } from "zod";

export const insertEmployeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  floor: z.number().min(1).max(4),
});

export const insertTransactionSchema = z.object({
  entryNo: z.string().min(1),
  entryDate: z.coerce.date(),
  cashier: z.string().min(1),
  floor: z.number().min(1).max(4),
  billAmt: z.number().min(0),
  cusMob: z.string().optional(),
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
