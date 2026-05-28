import { z } from "zod";

export const employeeSchema = z.object({
  empCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(20).optional().nullable(),
  designation: z.string().max(100).optional().nullable(),
  departmentId: z.string().optional().nullable(),
  joinDate: z.string().optional().nullable(),
  exitDate: z.string().optional().nullable(),
  empType: z.enum(["permanent", "contract", "daily_wage"]).default("permanent"),
  monthlyWage: z.number().min(0).optional().nullable(),
  dailyWage: z.number().min(0).optional().nullable(),
  hourlyWage: z.number().min(0).optional().nullable(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const attendanceUpsertSchema = z.object({
  date: z.string().min(1),
  rows: z.array(z.object({
    employeeId: z.string().min(1),
    projectId: z.string().optional().nullable(),
    status: z.enum(["P", "A", "HD", "L"]),
    hoursWorked: z.number().min(0).max(24).optional().nullable(),
    remarks: z.string().optional().nullable(),
  })),
});

export const payrollRunSchema = z.object({
  runNumber: z.string().min(1).max(50),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  remarks: z.string().optional().nullable(),
});
