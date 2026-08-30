import { z } from 'zod';
import { paginationSchema } from '../../common/http';
import {
  dateStringSchema,
  emailSchema,
  optionalTrimmedString,
  phoneSchema,
  requiredTrimmedString,
} from '../../common/validate';

export const leaveRequestSchema = z
  .object({
    leaveTypeId: requiredTrimmedString(1, 40),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    halfDayStart: z.boolean().default(false),
    halfDayEnd: z.boolean().default(false),
    reason: z
      .string()
      .trim()
      .min(3, 'Add a short reason so your manager has context')
      .max(500, 'Please keep the reason under 500 characters'),
    handoverNotes: optionalTrimmedString(1000),
    attachmentUrl: z.string().trim().url().max(1000).optional(),
    /** HR may file leave on behalf of an employee; employees may only file their own. */
    employeeId: optionalTrimmedString(40),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  });

export const leavePreviewSchema = z
  .object({
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    halfDayStart: z.boolean().default(false),
    halfDayEnd: z.boolean().default(false),
    employeeId: optionalTrimmedString(40),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  });

export const documentRequestSchema = z.object({
  documentType: z.enum([
    'EMPLOYMENT_CERTIFICATE',
    'SALARY_CERTIFICATE',
    'EXPERIENCE_LETTER',
    'NOC_TRAVEL',
    'VISA_LETTER',
    'BANK_ACCOUNT_LETTER',
  ]),
  purpose: z
    .string()
    .trim()
    .min(3, 'Tell us what the document is for')
    .max(300, 'Please keep the purpose under 300 characters'),
  addressedTo: optionalTrimmedString(160),
  includeSalary: z.boolean().default(false),
  language: z.enum(['EN', 'AR']).default('EN'),
  employeeId: optionalTrimmedString(40),
});

/**
 * The only fields an employee may propose changing about themselves.
 *
 * Everything that determines pay, position or entitlement - job title, salary,
 * legal entity, manager, employment status - is deliberately absent. Those are
 * HR decisions, not self-service edits, and leaving them out of the schema means
 * they cannot be smuggled in through this endpoint.
 */
export const profileChangeSchema = z
  .object({
    preferredName: optionalTrimmedString(80),
    personalEmail: emailSchema.optional(),
    phone: phoneSchema.optional(),
    addressLine: optionalTrimmedString(200),
    city: optionalTrimmedString(80),
    country: optionalTrimmedString(80),
    emergencyContactName: optionalTrimmedString(120),
    emergencyContactPhone: phoneSchema.optional(),
    emergencyContactRelation: optionalTrimmedString(60),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Propose at least one change',
  });

export const profileChangeRequestSchema = z.object({
  changes: profileChangeSchema,
  reason: optionalTrimmedString(500),
});

export const requestQuerySchema = paginationSchema.extend({
  type: z.enum(['LEAVE', 'DOCUMENT', 'PROFILE_CHANGE']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employeeId: optionalTrimmedString(40),
  legalEntityId: optionalTrimmedString(40),
  departmentId: optionalTrimmedString(40),
  /** Restricts the list to the caller's own direct reports. */
  myTeamOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  q: optionalTrimmedString(120),
  sortBy: z.enum(['submittedAt', 'status', 'type']).default('submittedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const decisionSchema = z.object({
  note: optionalTrimmedString(500),
  /** Optional link to the issued letter when approving a document request. */
  documentUrl: z.string().trim().url().max(1000).optional(),
});

export const rejectionSchema = z.object({
  note: z
    .string()
    .trim()
    .min(3, 'Explain why this request was not approved - the employee sees this')
    .max(500, 'Please keep the note under 500 characters'),
});

export const cancelSchema = z.object({
  note: optionalTrimmedString(500),
});

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type LeavePreviewInput = z.infer<typeof leavePreviewSchema>;
export type DocumentRequestInput = z.infer<typeof documentRequestSchema>;
export type ProfileChangeRequestInput = z.infer<typeof profileChangeRequestSchema>;
export type RequestQuery = z.infer<typeof requestQuerySchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type RejectionInput = z.infer<typeof rejectionSchema>;
