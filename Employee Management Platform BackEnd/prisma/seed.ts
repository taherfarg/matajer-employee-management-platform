/**
 * Demo data for the Employee Management Platform.
 *
 * Everything here is fictional. Names, addresses, phone numbers, registration
 * numbers, salaries and email addresses are invented, and the `.demo` domain
 * does not resolve. No real company or personal data is used anywhere.
 *
 * The seed is deterministic - no randomness - so a reset always produces the
 * same database and the numbers quoted in the README stay true.
 *
 * Run with:  npm run db:seed        (or `npm run db:reset` to rebuild first)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import type {
  ContractType,
  DocumentCategory,
  DocumentRequestType,
  EmployeeStatus,
  EmploymentType,
  Gender,
  RequestStatus,
  Role,
  WorkMode,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Passw0rd!23';
const SEED_YEAR = 2026;

/** Parses YYYY-MM-DD as UTC midnight, matching how the API stores calendar dates. */
const d = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** "PROFILE CHANGE" -> "Profile change", for enum values shown to a person. */
const sentenceCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/** Local copy of the working-day rule so the seed produces balances the API agrees with. */
function countWorkingDays(start: Date, end: Date, workWeek: number[], holidays: Set<string>): number {
  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (workWeek.includes(cursor.getUTCDay()) && !holidays.has(key)) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Legal entities - three countries, three different working weeks
// ---------------------------------------------------------------------------

const LEGAL_ENTITIES = [
  {
    code: 'MTJ-AE',
    name: 'Matajer UAE',
    legalName: 'Matajer Retail Technologies FZ-LLC',
    registrationNumber: 'DMCC-DEMO-114233',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    city: 'Dubai',
    addressLine: 'Unit 1904, Demo Tower, Jumeirah Lakes Towers',
    currency: 'AED',
    timezone: 'Asia/Dubai',
    workWeek: [1, 2, 3, 4, 5], // Monday to Friday
    weeklyHours: 40,
    probationMonths: 6,
    noticePeriodDays: 30,
    establishedOn: '2019-02-18',
  },
  {
    code: 'MTJ-SA',
    name: 'Matajer Saudi Arabia',
    legalName: 'Matajer Commerce Solutions Company LLC',
    registrationNumber: 'CR-DEMO-4030992211',
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    city: 'Riyadh',
    addressLine: 'Floor 8, Demo Business Gate, Al Olaya',
    currency: 'SAR',
    timezone: 'Asia/Riyadh',
    workWeek: [0, 1, 2, 3, 4], // Sunday to Thursday
    weeklyHours: 40,
    probationMonths: 3,
    noticePeriodDays: 60,
    establishedOn: '2020-01-12',
  },
  {
    code: 'MTJ-EG',
    name: 'Matajer Egypt',
    legalName: 'Matajer Digital Services LLC',
    registrationNumber: 'CR-DEMO-EG-88120',
    countryCode: 'EG',
    countryName: 'Egypt',
    city: 'Cairo',
    addressLine: 'Building 12, Demo Park, New Cairo',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    workWeek: [0, 1, 2, 3, 4], // Sunday to Thursday
    weeklyHours: 40,
    probationMonths: 3,
    noticePeriodDays: 60,
    establishedOn: '2020-08-30',
  },
] as const;

const DEPARTMENTS = [
  { code: 'EXEC', name: 'Executive', description: 'Company leadership and country management' },
  { code: 'ENG', name: 'Engineering', description: 'Platform, backend, frontend and quality engineering' },
  { code: 'PROD', name: 'Product', description: 'Product management, design and analytics' },
  { code: 'COMM', name: 'Commercial', description: 'Sales, partnerships and solution consulting' },
  { code: 'CS', name: 'Customer Success', description: 'Onboarding, support and account health' },
  { code: 'PPL', name: 'People & Culture', description: 'Talent, HR operations and workplace' },
  { code: 'FIN', name: 'Finance', description: 'Accounting, payroll administration and reporting' },
] as const;

/**
 * Leave policy per country. The differing entitlements are the point: they show
 * the same platform applying different rules per legal entity.
 */
const LEAVE_TYPES = [
  // United Arab Emirates
  { entity: 'MTJ-AE', code: 'ANNUAL', name: 'Annual Leave', days: 30, colour: '#2563eb', notice: 7, halfDay: true },
  { entity: 'MTJ-AE', code: 'SICK', name: 'Sick Leave', days: 15, colour: '#dc2626', notice: 0, halfDay: true, attachment: true },
  { entity: 'MTJ-AE', code: 'MATERNITY', name: 'Maternity Leave', days: 60, colour: '#db2777', notice: 30, halfDay: false, gender: 'FEMALE' as Gender },
  { entity: 'MTJ-AE', code: 'PATERNITY', name: 'Parental Leave', days: 5, colour: '#7c3aed', notice: 7, halfDay: false },
  // Saudi Arabia
  { entity: 'MTJ-SA', code: 'ANNUAL', name: 'Annual Leave', days: 21, colour: '#2563eb', notice: 7, halfDay: true },
  { entity: 'MTJ-SA', code: 'SICK', name: 'Sick Leave', days: 30, colour: '#dc2626', notice: 0, halfDay: true, attachment: true },
  { entity: 'MTJ-SA', code: 'MATERNITY', name: 'Maternity Leave', days: 70, colour: '#db2777', notice: 30, halfDay: false, gender: 'FEMALE' as Gender },
  { entity: 'MTJ-SA', code: 'PATERNITY', name: 'Parental Leave', days: 3, colour: '#7c3aed', notice: 7, halfDay: false },
  // Egypt
  { entity: 'MTJ-EG', code: 'ANNUAL', name: 'Annual Leave', days: 21, colour: '#2563eb', notice: 7, halfDay: true },
  { entity: 'MTJ-EG', code: 'SICK', name: 'Sick Leave', days: 15, colour: '#dc2626', notice: 0, halfDay: true, attachment: true },
  { entity: 'MTJ-EG', code: 'MATERNITY', name: 'Maternity Leave', days: 90, colour: '#db2777', notice: 30, halfDay: false, gender: 'FEMALE' as Gender },
  { entity: 'MTJ-EG', code: 'PATERNITY', name: 'Parental Leave', days: 1, colour: '#7c3aed', notice: 7, halfDay: false },
  // Company-wide
  { entity: null, code: 'UNPAID', name: 'Unpaid Leave', days: 30, colour: '#64748b', notice: 14, halfDay: false, paid: false },
  { entity: null, code: 'COMPASSIONATE', name: 'Compassionate Leave', days: 5, colour: '#0f766e', notice: 0, halfDay: false },
] as const;

/**
 * Public holidays for the seed year.
 *
 * Illustrative demo dates. Islamic holidays move with lunar observation and are
 * confirmed locally each year; a production system would source them from an
 * official calendar per country rather than hard-coding them.
 */
const HOLIDAYS: { entity: string; name: string; date: string }[] = [
  { entity: 'MTJ-AE', name: "New Year's Day", date: '2026-01-01' },
  { entity: 'MTJ-AE', name: 'Eid al-Fitr', date: '2026-03-20' },
  { entity: 'MTJ-AE', name: 'Eid al-Fitr Holiday', date: '2026-03-23' },
  { entity: 'MTJ-AE', name: 'Arafat Day', date: '2026-05-26' },
  { entity: 'MTJ-AE', name: 'Eid al-Adha', date: '2026-05-27' },
  { entity: 'MTJ-AE', name: 'Eid al-Adha Holiday', date: '2026-05-28' },
  { entity: 'MTJ-AE', name: 'Islamic New Year', date: '2026-06-16' },
  { entity: 'MTJ-AE', name: "Prophet's Birthday", date: '2026-08-25' },
  { entity: 'MTJ-AE', name: 'Commemoration Day', date: '2026-12-01' },
  { entity: 'MTJ-AE', name: 'UAE National Day', date: '2026-12-02' },
  { entity: 'MTJ-AE', name: 'UAE National Day Holiday', date: '2026-12-03' },

  { entity: 'MTJ-SA', name: 'Founding Day', date: '2026-02-23' },
  { entity: 'MTJ-SA', name: 'Eid al-Fitr', date: '2026-03-19' },
  { entity: 'MTJ-SA', name: 'Eid al-Fitr Holiday', date: '2026-03-22' },
  { entity: 'MTJ-SA', name: 'Eid al-Fitr Holiday', date: '2026-03-23' },
  { entity: 'MTJ-SA', name: 'Eid al-Adha', date: '2026-05-26' },
  { entity: 'MTJ-SA', name: 'Eid al-Adha Holiday', date: '2026-05-27' },
  { entity: 'MTJ-SA', name: 'Eid al-Adha Holiday', date: '2026-05-28' },
  { entity: 'MTJ-SA', name: 'Saudi National Day', date: '2026-09-23' },

  { entity: 'MTJ-EG', name: 'Coptic Christmas', date: '2026-01-07' },
  { entity: 'MTJ-EG', name: 'Revolution Day', date: '2026-01-25' },
  { entity: 'MTJ-EG', name: 'Eid al-Fitr', date: '2026-03-22' },
  { entity: 'MTJ-EG', name: 'Sinai Liberation Day', date: '2026-04-27' },
  { entity: 'MTJ-EG', name: 'Labour Day', date: '2026-05-01' },
  { entity: 'MTJ-EG', name: 'Eid al-Adha', date: '2026-05-27' },
  { entity: 'MTJ-EG', name: 'Eid al-Adha Holiday', date: '2026-05-28' },
  { entity: 'MTJ-EG', name: 'June 30 Revolution', date: '2026-06-30' },
  { entity: 'MTJ-EG', name: 'Armed Forces Day', date: '2026-10-06' },
];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface SeedEmployee {
  number: string;
  first: string;
  last: string;
  gender: Gender;
  entity: string;
  department: string;
  jobTitle: string;
  managerNumber: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  contractType: ContractType;
  workMode: WorkMode;
  hireDate: string;
  probationEndDate?: string;
  contractEndDate?: string;
  exitDate?: string;
  exitReason?: string;
  dateOfBirth: string;
  nationality: string;
  phone: string;
  city: string;
  country: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  /** Salary history, oldest first. Amounts are in the entity currency. */
  salary: { from: string; base: number; housing?: number; transport?: number; reason: string }[];
  /** Overrides the login email; defaults to the work email. */
  loginEmail?: string;
  role?: Role;
  scopedTo?: string;
}

const EMPLOYEES: SeedEmployee[] = [
  {
    number: 'AE-0001', first: 'Layla', last: 'Hassan', gender: 'FEMALE',
    entity: 'MTJ-AE', department: 'EXEC', jobTitle: 'Chief Executive Officer',
    managerNumber: null, status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'HYBRID',
    hireDate: '2019-03-04', probationEndDate: '2019-09-04',
    dateOfBirth: '1984-07-22', nationality: 'Emirati', phone: '+971 50 100 0001',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Rashid Hassan', emergencyPhone: '+971 50 100 9001', emergencyRelation: 'Spouse',
    salary: [
      { from: '2019-03-04', base: 48000, housing: 12000, transport: 3000, reason: 'Starting compensation' },
      { from: '2022-01-01', base: 56000, housing: 14000, transport: 3000, reason: 'Annual review' },
      { from: '2025-01-01', base: 62000, housing: 15500, transport: 3500, reason: 'Annual review' },
    ],
  },
  {
    number: 'AE-0002', first: 'Omar', last: 'Al-Zaabi', gender: 'MALE',
    entity: 'MTJ-AE', department: 'ENG', jobTitle: 'VP of Engineering',
    managerNumber: 'AE-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'HYBRID',
    hireDate: '2019-09-16', probationEndDate: '2020-03-16',
    dateOfBirth: '1987-11-03', nationality: 'Emirati', phone: '+971 50 100 0002',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Aisha Al-Zaabi', emergencyPhone: '+971 50 100 9002', emergencyRelation: 'Spouse',
    loginEmail: 'manager@matajer.demo', role: 'MANAGER',
    salary: [
      { from: '2019-09-16', base: 32000, housing: 8000, transport: 2500, reason: 'Starting compensation' },
      { from: '2022-04-01', base: 40000, housing: 10000, transport: 2500, reason: 'Promotion to VP of Engineering' },
      { from: '2025-04-01', base: 48000, housing: 12000, transport: 3000, reason: 'Annual review' },
    ],
  },
  {
    number: 'AE-0003', first: 'Priya', last: 'Raman', gender: 'FEMALE',
    entity: 'MTJ-AE', department: 'PPL', jobTitle: 'Head of People & Culture',
    managerNumber: 'AE-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2021-01-11', probationEndDate: '2021-07-11',
    dateOfBirth: '1989-04-15', nationality: 'Indian', phone: '+971 50 100 0003',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Anil Raman', emergencyPhone: '+971 50 100 9003', emergencyRelation: 'Sibling',
    loginEmail: 'admin@matajer.demo', role: 'ADMIN',
    salary: [
      { from: '2021-01-11', base: 26000, housing: 6500, transport: 2000, reason: 'Starting compensation' },
      { from: '2024-01-01', base: 34000, housing: 8500, transport: 2500, reason: 'Promotion to Head of People & Culture' },
    ],
  },
  {
    number: 'AE-0004', first: 'Yusuf', last: 'Karim', gender: 'MALE',
    entity: 'MTJ-AE', department: 'ENG', jobTitle: 'Senior Backend Engineer',
    managerNumber: 'AE-0002', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'REMOTE',
    hireDate: '2022-06-01', probationEndDate: '2022-12-01',
    dateOfBirth: '1993-09-28', nationality: 'Jordanian', phone: '+971 50 100 0004',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Lina Karim', emergencyPhone: '+971 50 100 9004', emergencyRelation: 'Spouse',
    loginEmail: 'employee@matajer.demo', role: 'EMPLOYEE',
    salary: [
      { from: '2022-06-01', base: 21000, housing: 5000, transport: 1500, reason: 'Starting compensation' },
      { from: '2024-07-01', base: 25000, housing: 6000, transport: 1500, reason: 'Promotion to Senior Backend Engineer' },
      { from: '2026-01-01', base: 27500, housing: 6500, transport: 1800, reason: 'Annual review' },
    ],
  },
  {
    number: 'AE-0005', first: 'Noor', last: 'Abdallah', gender: 'FEMALE',
    entity: 'MTJ-AE', department: 'PROD', jobTitle: 'Product Manager',
    managerNumber: 'AE-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'HYBRID',
    hireDate: '2023-02-13', probationEndDate: '2023-08-13',
    dateOfBirth: '1992-01-30', nationality: 'Lebanese', phone: '+971 50 100 0005',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Maya Abdallah', emergencyPhone: '+971 50 100 9005', emergencyRelation: 'Parent',
    salary: [
      { from: '2023-02-13', base: 22000, housing: 5500, transport: 1500, reason: 'Starting compensation' },
      { from: '2025-07-01', base: 26000, housing: 6500, transport: 1800, reason: 'Annual review' },
    ],
  },
  {
    number: 'AE-0006', first: 'Daniel', last: 'Okafor', gender: 'MALE',
    entity: 'MTJ-AE', department: 'FIN', jobTitle: 'Finance Manager',
    managerNumber: 'AE-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2022-11-07', probationEndDate: '2023-05-07',
    dateOfBirth: '1990-06-11', nationality: 'Nigerian', phone: '+971 50 100 0006',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Grace Okafor', emergencyPhone: '+971 50 100 9006', emergencyRelation: 'Spouse',
    salary: [
      { from: '2022-11-07', base: 20000, housing: 5000, transport: 1500, reason: 'Starting compensation' },
      { from: '2025-11-01', base: 24000, housing: 6000, transport: 1800, reason: 'Annual review' },
    ],
  },
  {
    number: 'AE-0007', first: 'Mariam', last: 'Saleh', gender: 'FEMALE',
    entity: 'MTJ-AE', department: 'ENG', jobTitle: 'QA Engineer',
    managerNumber: 'AE-0002', status: 'PROBATION', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2026-03-02', probationEndDate: '2026-09-02',
    dateOfBirth: '1997-12-05', nationality: 'Egyptian', phone: '+971 50 100 0007',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Hoda Saleh', emergencyPhone: '+971 50 100 9007', emergencyRelation: 'Parent',
    salary: [{ from: '2026-03-02', base: 14000, housing: 3500, transport: 1000, reason: 'Starting compensation' }],
  },
  {
    number: 'AE-0008', first: 'Ethan', last: 'Brooks', gender: 'MALE',
    entity: 'MTJ-AE', department: 'COMM', jobTitle: 'Solutions Consultant',
    managerNumber: 'AE-0001', status: 'NOTICE_PERIOD', employmentType: 'FULL_TIME', contractType: 'LIMITED', workMode: 'HYBRID',
    hireDate: '2021-08-23', probationEndDate: '2022-02-23', contractEndDate: '2026-10-31',
    dateOfBirth: '1988-03-19', nationality: 'British', phone: '+971 50 100 0008',
    city: 'Dubai', country: 'United Arab Emirates',
    emergencyName: 'Claire Brooks', emergencyPhone: '+971 50 100 9008', emergencyRelation: 'Spouse',
    salary: [
      { from: '2021-08-23', base: 18000, housing: 4500, transport: 1500, reason: 'Starting compensation' },
      { from: '2024-09-01', base: 22000, housing: 5500, transport: 1800, reason: 'Annual review' },
    ],
  },

  {
    number: 'SA-0001', first: 'Faisal', last: 'Al-Harbi', gender: 'MALE',
    entity: 'MTJ-SA', department: 'EXEC', jobTitle: 'Country Manager, Saudi Arabia',
    managerNumber: 'AE-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2020-02-02', probationEndDate: '2020-05-02',
    dateOfBirth: '1985-05-09', nationality: 'Saudi', phone: '+966 55 200 0001',
    city: 'Riyadh', country: 'Saudi Arabia',
    emergencyName: 'Mona Al-Harbi', emergencyPhone: '+966 55 200 9001', emergencyRelation: 'Spouse',
    salary: [
      { from: '2020-02-02', base: 34000, housing: 8500, transport: 2500, reason: 'Starting compensation' },
      { from: '2024-02-01', base: 45000, housing: 11000, transport: 3000, reason: 'Annual review' },
    ],
  },
  {
    number: 'SA-0002', first: 'Huda', last: 'Al-Qahtani', gender: 'FEMALE',
    entity: 'MTJ-SA', department: 'PPL', jobTitle: 'HR Business Partner',
    managerNumber: 'SA-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2022-04-17', probationEndDate: '2022-07-17',
    dateOfBirth: '1994-02-14', nationality: 'Saudi', phone: '+966 55 200 0002',
    city: 'Riyadh', country: 'Saudi Arabia',
    emergencyName: 'Salem Al-Qahtani', emergencyPhone: '+966 55 200 9002', emergencyRelation: 'Sibling',
    loginEmail: 'hr.ksa@matajer.demo', role: 'HR_ADMIN', scopedTo: 'MTJ-SA',
    salary: [
      { from: '2022-04-17', base: 16000, housing: 4000, transport: 1200, reason: 'Starting compensation' },
      { from: '2025-05-01', base: 21000, housing: 5250, transport: 1500, reason: 'Annual review' },
    ],
  },
  {
    number: 'SA-0003', first: 'Tariq', last: 'Nasser', gender: 'MALE',
    entity: 'MTJ-SA', department: 'ENG', jobTitle: 'Frontend Engineer',
    managerNumber: 'AE-0002', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'REMOTE',
    hireDate: '2023-09-03', probationEndDate: '2023-12-03',
    dateOfBirth: '1995-08-17', nationality: 'Saudi', phone: '+966 55 200 0003',
    city: 'Jeddah', country: 'Saudi Arabia',
    emergencyName: 'Amal Nasser', emergencyPhone: '+966 55 200 9003', emergencyRelation: 'Parent',
    salary: [
      { from: '2023-09-03', base: 16000, housing: 4000, transport: 1200, reason: 'Starting compensation' },
      { from: '2026-01-01', base: 19500, housing: 4875, transport: 1500, reason: 'Annual review' },
    ],
  },
  {
    number: 'SA-0004', first: 'Sara', last: 'Al-Otaibi', gender: 'FEMALE',
    entity: 'MTJ-SA', department: 'CS', jobTitle: 'Customer Success Lead',
    managerNumber: 'SA-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'HYBRID',
    hireDate: '2021-06-20', probationEndDate: '2021-09-20',
    dateOfBirth: '1991-10-02', nationality: 'Saudi', phone: '+966 55 200 0004',
    city: 'Riyadh', country: 'Saudi Arabia',
    emergencyName: 'Nasser Al-Otaibi', emergencyPhone: '+966 55 200 9004', emergencyRelation: 'Spouse',
    salary: [
      { from: '2021-06-20', base: 17000, housing: 4250, transport: 1200, reason: 'Starting compensation' },
      { from: '2025-01-01', base: 23000, housing: 5750, transport: 1500, reason: 'Promotion to Customer Success Lead' },
    ],
  },
  {
    number: 'SA-0005', first: 'Bilal', last: 'Haddad', gender: 'MALE',
    entity: 'MTJ-SA', department: 'COMM', jobTitle: 'Account Executive',
    managerNumber: 'SA-0001', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2024-01-14', probationEndDate: '2024-04-14',
    dateOfBirth: '1996-03-25', nationality: 'Syrian', phone: '+966 55 200 0005',
    city: 'Riyadh', country: 'Saudi Arabia',
    emergencyName: 'Rana Haddad', emergencyPhone: '+966 55 200 9005', emergencyRelation: 'Sibling',
    salary: [{ from: '2024-01-14', base: 17000, housing: 4250, transport: 1500, reason: 'Starting compensation' }],
  },
  {
    number: 'SA-0006', first: 'Reem', last: 'Al-Dosari', gender: 'FEMALE',
    entity: 'MTJ-SA', department: 'PROD', jobTitle: 'Data Analyst',
    managerNumber: 'AE-0005', status: 'PROBATION', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'REMOTE',
    hireDate: '2026-05-10', probationEndDate: '2026-08-10',
    dateOfBirth: '1999-06-30', nationality: 'Saudi', phone: '+966 55 200 0006',
    city: 'Riyadh', country: 'Saudi Arabia',
    emergencyName: 'Khalid Al-Dosari', emergencyPhone: '+966 55 200 9006', emergencyRelation: 'Parent',
    salary: [{ from: '2026-05-10', base: 15000, housing: 3750, transport: 1000, reason: 'Starting compensation' }],
  },

  {
    number: 'EG-0001', first: 'Karim', last: 'Fouad', gender: 'MALE',
    entity: 'MTJ-EG', department: 'ENG', jobTitle: 'Engineering Manager',
    managerNumber: 'AE-0002', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'HYBRID',
    hireDate: '2020-10-04', probationEndDate: '2021-01-04',
    dateOfBirth: '1988-12-19', nationality: 'Egyptian', phone: '+20 100 300 0001',
    city: 'Cairo', country: 'Egypt',
    emergencyName: 'Dalia Fouad', emergencyPhone: '+20 100 300 9001', emergencyRelation: 'Spouse',
    salary: [
      { from: '2020-10-04', base: 78000, housing: 15000, transport: 6000, reason: 'Starting compensation' },
      { from: '2023-11-01', base: 110000, housing: 22000, transport: 8000, reason: 'Promotion to Engineering Manager' },
      { from: '2026-02-01', base: 145000, housing: 29000, transport: 10000, reason: 'Annual review' },
    ],
  },
  {
    number: 'EG-0002', first: 'Nada', last: 'Ibrahim', gender: 'FEMALE',
    entity: 'MTJ-EG', department: 'ENG', jobTitle: 'Backend Engineer',
    managerNumber: 'EG-0001', status: 'ON_LEAVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'REMOTE',
    hireDate: '2023-03-19', probationEndDate: '2023-06-19',
    dateOfBirth: '1996-05-08', nationality: 'Egyptian', phone: '+20 100 300 0002',
    city: 'Alexandria', country: 'Egypt',
    emergencyName: 'Tamer Ibrahim', emergencyPhone: '+20 100 300 9002', emergencyRelation: 'Spouse',
    salary: [
      { from: '2023-03-19', base: 62000, housing: 12000, transport: 5000, reason: 'Starting compensation' },
      { from: '2025-09-01', base: 82000, housing: 16000, transport: 6000, reason: 'Annual review' },
    ],
  },
  {
    number: 'EG-0003', first: 'Mostafa', last: 'Adel', gender: 'MALE',
    entity: 'MTJ-EG', department: 'CS', jobTitle: 'Support Engineer',
    managerNumber: 'SA-0004', status: 'ACTIVE', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2024-07-07', probationEndDate: '2024-10-07',
    dateOfBirth: '1998-01-23', nationality: 'Egyptian', phone: '+20 100 300 0003',
    city: 'Cairo', country: 'Egypt',
    emergencyName: 'Yara Adel', emergencyPhone: '+20 100 300 9003', emergencyRelation: 'Sibling',
    salary: [{ from: '2024-07-07', base: 48000, housing: 9000, transport: 4000, reason: 'Starting compensation' }],
  },
  {
    number: 'EG-0004', first: 'Hana', last: 'Zaki', gender: 'FEMALE',
    entity: 'MTJ-EG', department: 'PPL', jobTitle: 'Talent Acquisition Specialist',
    managerNumber: 'AE-0003', status: 'OFFBOARDED', employmentType: 'FULL_TIME', contractType: 'UNLIMITED', workMode: 'ONSITE',
    hireDate: '2022-09-11', probationEndDate: '2022-12-11',
    exitDate: '2026-06-30', exitReason: 'Resignation - relocating abroad',
    dateOfBirth: '1994-11-11', nationality: 'Egyptian', phone: '+20 100 300 0004',
    city: 'Cairo', country: 'Egypt',
    emergencyName: 'Sherif Zaki', emergencyPhone: '+20 100 300 9004', emergencyRelation: 'Parent',
    salary: [
      { from: '2022-09-11', base: 42000, housing: 8000, transport: 3500, reason: 'Starting compensation' },
      { from: '2025-03-01', base: 55000, housing: 11000, transport: 4500, reason: 'Annual review' },
    ],
  },
];

const DEPARTMENT_HEADS: Record<string, string> = {
  EXEC: 'AE-0001',
  ENG: 'AE-0002',
  PROD: 'AE-0005',
  COMM: 'AE-0008',
  CS: 'SA-0004',
  PPL: 'AE-0003',
  FIN: 'AE-0006',
};

// ---------------------------------------------------------------------------
// Requests - spread across types, statuses and months so the inbox, filters and
// dashboards all have something meaningful to show on first load.
// ---------------------------------------------------------------------------

interface SeedLeaveRequest {
  employee: string;
  leaveCode: string;
  start: string;
  end: string;
  status: RequestStatus;
  reason: string;
  handover?: string;
  decidedBy?: string;
  decisionNote?: string;
  submittedAt: string;
  decidedAt?: string;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

const LEAVE_REQUESTS: SeedLeaveRequest[] = [
  { employee: 'AE-0004', leaveCode: 'ANNUAL', start: '2026-02-16', end: '2026-02-20', status: 'APPROVED', reason: 'Family holiday', handover: 'Payments service handover to Tariq.', decidedBy: 'AE-0002', decisionNote: 'Approved, enjoy the break.', submittedAt: '2026-01-28', decidedAt: '2026-01-29' },
  { employee: 'AE-0004', leaveCode: 'SICK', start: '2026-04-13', end: '2026-04-14', status: 'APPROVED', reason: 'Flu, doctor advised rest', decidedBy: 'AE-0002', submittedAt: '2026-04-13', decidedAt: '2026-04-13' },
  { employee: 'AE-0004', leaveCode: 'ANNUAL', start: '2026-09-14', end: '2026-09-18', status: 'PENDING', reason: 'Personal travel', handover: 'On-call swap agreed with Mariam.', submittedAt: '2026-08-24' },
  { employee: 'AE-0005', leaveCode: 'ANNUAL', start: '2026-03-09', end: '2026-03-13', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'AE-0003', submittedAt: '2026-02-20', decidedAt: '2026-02-21' },
  { employee: 'AE-0005', leaveCode: 'ANNUAL', start: '2026-09-07', end: '2026-09-11', status: 'PENDING', reason: 'Extended weekend with family', submittedAt: '2026-08-26' },
  { employee: 'AE-0006', leaveCode: 'ANNUAL', start: '2026-06-01', end: '2026-06-05', status: 'APPROVED', reason: 'Summer break', decidedBy: 'AE-0003', submittedAt: '2026-05-11', decidedAt: '2026-05-12' },
  { employee: 'AE-0006', leaveCode: 'COMPASSIONATE', start: '2026-07-20', end: '2026-07-21', status: 'APPROVED', reason: 'Bereavement in the family', decidedBy: 'AE-0003', decisionNote: 'Approved. Take the time you need.', submittedAt: '2026-07-19', decidedAt: '2026-07-19' },
  { employee: 'AE-0007', leaveCode: 'SICK', start: '2026-07-06', end: '2026-07-06', status: 'APPROVED', reason: 'Migraine', decidedBy: 'AE-0002', submittedAt: '2026-07-06', decidedAt: '2026-07-07' },
  { employee: 'AE-0007', leaveCode: 'ANNUAL', start: '2026-08-31', end: '2026-09-04', status: 'PENDING', reason: 'Family visit abroad', submittedAt: '2026-08-18' },
  { employee: 'AE-0008', leaveCode: 'ANNUAL', start: '2026-05-04', end: '2026-05-08', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'AE-0003', submittedAt: '2026-04-14', decidedAt: '2026-04-15' },
  { employee: 'AE-0002', leaveCode: 'ANNUAL', start: '2026-08-03', end: '2026-08-07', status: 'APPROVED', reason: 'Summer holiday', decidedBy: 'AE-0003', submittedAt: '2026-07-10', decidedAt: '2026-07-11' },
  { employee: 'AE-0002', leaveCode: 'ANNUAL', start: '2026-12-21', end: '2026-12-24', status: 'PENDING', reason: 'Year-end break', submittedAt: '2026-08-20' },

  { employee: 'SA-0003', leaveCode: 'ANNUAL', start: '2026-02-01', end: '2026-02-05', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'AE-0002', submittedAt: '2026-01-15', decidedAt: '2026-01-16' },
  { employee: 'SA-0003', leaveCode: 'ANNUAL', start: '2026-06-07', end: '2026-06-11', status: 'REJECTED', reason: 'Travel', decidedBy: 'AE-0002', decisionNote: 'Overlaps the release window. Please re-submit for the following week.', submittedAt: '2026-05-20', decidedAt: '2026-05-22' },
  { employee: 'SA-0003', leaveCode: 'ANNUAL', start: '2026-06-14', end: '2026-06-18', status: 'APPROVED', reason: 'Travel, moved after release window', decidedBy: 'AE-0002', submittedAt: '2026-05-23', decidedAt: '2026-05-24' },
  { employee: 'SA-0004', leaveCode: 'ANNUAL', start: '2026-04-05', end: '2026-04-09', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'SA-0001', submittedAt: '2026-03-15', decidedAt: '2026-03-16' },
  { employee: 'SA-0004', leaveCode: 'SICK', start: '2026-08-16', end: '2026-08-17', status: 'APPROVED', reason: 'Recovering from a procedure', decidedBy: 'SA-0001', submittedAt: '2026-08-16', decidedAt: '2026-08-16' },
  { employee: 'SA-0005', leaveCode: 'ANNUAL', start: '2026-03-01', end: '2026-03-04', status: 'APPROVED', reason: 'Personal', decidedBy: 'SA-0001', submittedAt: '2026-02-10', decidedAt: '2026-02-11' },
  { employee: 'SA-0005', leaveCode: 'ANNUAL', start: '2026-09-06', end: '2026-09-10', status: 'PENDING', reason: 'Wedding in the family', submittedAt: '2026-08-12' },
  { employee: 'SA-0002', leaveCode: 'ANNUAL', start: '2026-07-05', end: '2026-07-09', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'SA-0001', submittedAt: '2026-06-14', decidedAt: '2026-06-15' },
  { employee: 'SA-0006', leaveCode: 'ANNUAL', start: '2026-08-09', end: '2026-08-10', status: 'CANCELLED', reason: 'Personal errand', submittedAt: '2026-08-02' },

  { employee: 'EG-0002', leaveCode: 'MATERNITY', start: '2026-07-05', end: '2026-10-01', status: 'APPROVED', reason: 'Maternity leave', decidedBy: 'AE-0003', decisionNote: 'Approved per Egypt entity policy.', submittedAt: '2026-06-01', decidedAt: '2026-06-02' },
  { employee: 'EG-0001', leaveCode: 'ANNUAL', start: '2026-05-10', end: '2026-05-14', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'AE-0002', submittedAt: '2026-04-20', decidedAt: '2026-04-21' },
  { employee: 'EG-0001', leaveCode: 'ANNUAL', start: '2026-09-20', end: '2026-09-24', status: 'PENDING', reason: 'Family trip', submittedAt: '2026-08-27' },
  { employee: 'EG-0003', leaveCode: 'SICK', start: '2026-06-08', end: '2026-06-09', status: 'APPROVED', reason: 'Stomach infection', decidedBy: 'SA-0004', submittedAt: '2026-06-08', decidedAt: '2026-06-08' },
  { employee: 'EG-0003', leaveCode: 'ANNUAL', start: '2026-08-02', end: '2026-08-06', status: 'APPROVED', reason: 'Annual leave', decidedBy: 'SA-0004', submittedAt: '2026-07-13', decidedAt: '2026-07-14' },
];

interface SeedDocumentRequest {
  employee: string;
  documentType: DocumentRequestType;
  purpose: string;
  addressedTo?: string;
  includeSalary: boolean;
  status: RequestStatus;
  submittedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

const DOCUMENT_REQUESTS: SeedDocumentRequest[] = [
  { employee: 'AE-0004', documentType: 'SALARY_CERTIFICATE', purpose: 'Bank car loan application', addressedTo: 'Emirates Demo Bank', includeSalary: true, status: 'APPROVED', submittedAt: '2026-05-06', decidedBy: 'AE-0003', decidedAt: '2026-05-07', decisionNote: 'Issued and attached to your documents.' },
  { employee: 'AE-0005', documentType: 'EMPLOYMENT_CERTIFICATE', purpose: 'Residence visa renewal for spouse', includeSalary: false, status: 'APPROVED', submittedAt: '2026-06-15', decidedBy: 'AE-0003', decidedAt: '2026-06-16' },
  { employee: 'AE-0006', documentType: 'NOC_TRAVEL', purpose: 'Schengen visa application', addressedTo: 'Consulate General (Demo)', includeSalary: false, status: 'APPROVED', submittedAt: '2026-07-01', decidedBy: 'AE-0003', decidedAt: '2026-07-02' },
  { employee: 'SA-0003', documentType: 'EMPLOYMENT_CERTIFICATE', purpose: 'Mortgage pre-approval', includeSalary: false, status: 'PENDING', submittedAt: '2026-08-25' },
  { employee: 'SA-0005', documentType: 'BANK_ACCOUNT_LETTER', purpose: 'Opening a salary account', addressedTo: 'Riyadh Demo Bank', includeSalary: false, status: 'PENDING', submittedAt: '2026-08-27' },
  { employee: 'EG-0003', documentType: 'EXPERIENCE_LETTER', purpose: 'Professional certification application', includeSalary: false, status: 'REJECTED', submittedAt: '2026-04-02', decidedBy: 'AE-0003', decidedAt: '2026-04-04', decisionNote: 'Experience letters are issued after two years of service. Eligible from July 2026.' },
  { employee: 'AE-0007', documentType: 'EMPLOYMENT_CERTIFICATE', purpose: 'Tenancy contract', includeSalary: false, status: 'PENDING', submittedAt: '2026-08-28' },
  { employee: 'SA-0004', documentType: 'SALARY_CERTIFICATE', purpose: 'Personal loan application', addressedTo: 'Riyadh Demo Bank', includeSalary: true, status: 'APPROVED', submittedAt: '2026-03-11', decidedBy: 'SA-0001', decidedAt: '2026-03-12' },
];

interface SeedProfileChange {
  employee: string;
  changes: { field: string; label: string; currentValue: string | null; proposedValue: string }[];
  status: RequestStatus;
  submittedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

const PROFILE_CHANGE_REQUESTS: SeedProfileChange[] = [
  {
    employee: 'AE-0004',
    changes: [
      { field: 'phone', label: 'Phone number', currentValue: '+971 50 100 4004', proposedValue: '+971 50 100 0004' },
      { field: 'addressLine', label: 'Address', currentValue: 'Apartment 402, Demo Residence, Dubai Marina', proposedValue: 'Villa 17, Demo Community, Arjan' },
    ],
    status: 'APPROVED', submittedAt: '2026-02-03', decidedBy: 'AE-0003', decidedAt: '2026-02-04', decisionNote: 'Verified against the tenancy contract.',
  },
  {
    employee: 'SA-0004',
    changes: [
      { field: 'emergencyContactName', label: 'Emergency contact name', currentValue: 'Latifa Al-Otaibi', proposedValue: 'Nasser Al-Otaibi' },
      { field: 'emergencyContactPhone', label: 'Emergency contact phone', currentValue: '+966 55 200 8004', proposedValue: '+966 55 200 9004' },
    ],
    status: 'APPROVED', submittedAt: '2026-05-19', decidedBy: 'SA-0001', decidedAt: '2026-05-20',
  },
  {
    employee: 'SA-0003',
    changes: [{ field: 'city', label: 'City', currentValue: 'Riyadh', proposedValue: 'Jeddah' }],
    status: 'APPROVED', submittedAt: '2026-06-25', decidedBy: 'SA-0001', decidedAt: '2026-06-26', decisionNote: 'Remote working location updated.',
  },
  {
    employee: 'EG-0003',
    changes: [{ field: 'personalEmail', label: 'Personal email', currentValue: null, proposedValue: 'mostafa.adel.personal@matajer.demo' }],
    status: 'PENDING', submittedAt: '2026-08-26',
  },
  {
    employee: 'AE-0008',
    changes: [{ field: 'phone', label: 'Phone number', currentValue: '+971 50 100 0008', proposedValue: '+971 50 777 0808' }],
    status: 'PENDING', submittedAt: '2026-08-28',
  },
  {
    employee: 'SA-0005',
    changes: [{ field: 'emergencyContactRelation', label: 'Emergency contact relation', currentValue: 'Sibling', proposedValue: 'Parent' }],
    status: 'REJECTED', submittedAt: '2026-07-14', decidedBy: 'SA-0001', decidedAt: '2026-07-16', decisionNote: 'Please attach the updated contact details form and resubmit.',
  },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Removes existing data in dependency order so the seed is repeatable. */
async function reset(): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.leaveRequestDetail.deleteMany(),
    prisma.documentRequestDetail.deleteMany(),
    prisma.profileChangeRequestDetail.deleteMany(),
    prisma.request.deleteMany(),
    prisma.leaveBalance.deleteMany(),
    prisma.document.deleteMany(),
    prisma.employmentEvent.deleteMany(),
    prisma.compensationRecord.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.leaveType.deleteMany(),
  ]);

  // Department heads and manager links are self-references on employees, so
  // clear them before deleting the rows they point at.
  await prisma.department.updateMany({ data: { headId: null } });
  await prisma.employee.updateMany({ data: { managerId: null } });
  await prisma.employee.deleteMany();
  await prisma.department.deleteMany();
  await prisma.legalEntity.deleteMany();
}

async function main(): Promise<void> {
  console.log('Resetting existing demo data...');
  await reset();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // --- Legal entities -------------------------------------------------------
  const entityIds = new Map<string, string>();
  const entityWorkWeek = new Map<string, number[]>();
  const entityCurrency = new Map<string, string>();

  for (const entity of LEGAL_ENTITIES) {
    const created = await prisma.legalEntity.create({
      data: {
        code: entity.code,
        name: entity.name,
        legalName: entity.legalName,
        registrationNumber: entity.registrationNumber,
        countryCode: entity.countryCode,
        countryName: entity.countryName,
        city: entity.city,
        addressLine: entity.addressLine,
        currency: entity.currency,
        timezone: entity.timezone,
        workWeek: [...entity.workWeek],
        weeklyHours: new Prisma.Decimal(entity.weeklyHours),
        probationMonths: entity.probationMonths,
        noticePeriodDays: entity.noticePeriodDays,
        establishedOn: d(entity.establishedOn),
      },
    });
    entityIds.set(entity.code, created.id);
    entityWorkWeek.set(entity.code, [...entity.workWeek]);
    entityCurrency.set(entity.code, entity.currency);
  }
  console.log(`  ${LEGAL_ENTITIES.length} legal entities`);

  // --- Departments ----------------------------------------------------------
  const departmentIds = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const created = await prisma.department.create({
      data: { code: department.code, name: department.name, description: department.description },
    });
    departmentIds.set(department.code, created.id);
  }
  console.log(`  ${DEPARTMENTS.length} departments`);

  // --- Leave policy ---------------------------------------------------------
  const leaveTypeIds = new Map<string, string>(); // `${entityCode|GLOBAL}:${code}`
  const leaveTypeEntitlement = new Map<string, number>();

  for (const type of LEAVE_TYPES) {
    const created = await prisma.leaveType.create({
      data: {
        legalEntityId: type.entity ? (entityIds.get(type.entity) as string) : null,
        code: type.code,
        name: type.name,
        colorHex: type.colour,
        annualEntitlementDays: new Prisma.Decimal(type.days),
        isPaid: 'paid' in type ? (type.paid as boolean) : true,
        requiresAttachment: 'attachment' in type ? (type.attachment as boolean) : false,
        allowsHalfDay: type.halfDay,
        minNoticeDays: type.notice,
        restrictedToGender: 'gender' in type ? (type.gender as Gender) : null,
      },
    });
    const key = `${type.entity ?? 'GLOBAL'}:${type.code}`;
    leaveTypeIds.set(key, created.id);
    leaveTypeEntitlement.set(key, type.days);
  }
  console.log(`  ${LEAVE_TYPES.length} leave types`);

  // --- Holidays -------------------------------------------------------------
  const holidaysByEntity = new Map<string, Set<string>>();
  for (const holiday of HOLIDAYS) {
    await prisma.holiday.create({
      data: {
        legalEntityId: entityIds.get(holiday.entity) as string,
        name: holiday.name,
        date: d(holiday.date),
      },
    });
    const set = holidaysByEntity.get(holiday.entity) ?? new Set<string>();
    set.add(holiday.date);
    holidaysByEntity.set(holiday.entity, set);
  }
  console.log(`  ${HOLIDAYS.length} public holidays`);

  // --- Employees ------------------------------------------------------------
  // Created without managers first, then linked, so a manager may appear later
  // in the list than the people who report to them.
  const employeeIds = new Map<string, string>();
  const workEmail = (person: SeedEmployee): string =>
    `${person.first}.${person.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@matajer.demo';

  for (const person of EMPLOYEES) {
    const created = await prisma.employee.create({
      data: {
        employeeNumber: person.number,
        firstName: person.first,
        lastName: person.last,
        workEmail: workEmail(person),
        phone: person.phone,
        dateOfBirth: d(person.dateOfBirth),
        gender: person.gender,
        nationality: person.nationality,
        addressLine: `Demo address, ${person.city}`,
        city: person.city,
        country: person.country,
        emergencyContactName: person.emergencyName,
        emergencyContactPhone: person.emergencyPhone,
        emergencyContactRelation: person.emergencyRelation,
        legalEntityId: entityIds.get(person.entity) as string,
        departmentId: departmentIds.get(person.department) as string,
        jobTitle: person.jobTitle,
        employmentType: person.employmentType,
        contractType: person.contractType,
        workMode: person.workMode,
        status: person.status,
        hireDate: d(person.hireDate),
        probationEndDate: person.probationEndDate ? d(person.probationEndDate) : null,
        contractEndDate: person.contractEndDate ? d(person.contractEndDate) : null,
        exitDate: person.exitDate ? d(person.exitDate) : null,
        exitReason: person.exitReason ?? null,
        noticePeriodDays: LEGAL_ENTITIES.find((entity) => entity.code === person.entity)?.noticePeriodDays ?? 30,
      },
    });
    employeeIds.set(person.number, created.id);
  }

  for (const person of EMPLOYEES) {
    if (!person.managerNumber) continue;
    await prisma.employee.update({
      where: { id: employeeIds.get(person.number) as string },
      data: { managerId: employeeIds.get(person.managerNumber) as string },
    });
  }

  for (const [code, headNumber] of Object.entries(DEPARTMENT_HEADS)) {
    await prisma.department.update({
      where: { id: departmentIds.get(code) as string },
      data: { headId: employeeIds.get(headNumber) as string },
    });
  }
  console.log(`  ${EMPLOYEES.length} employees`);

  // --- Login accounts -------------------------------------------------------
  // Offboarded people keep their employee record but lose their login.
  let accountCount = 0;
  for (const person of EMPLOYEES) {
    if (person.status === 'OFFBOARDED') continue;
    await prisma.user.create({
      data: {
        email: person.loginEmail ?? workEmail(person),
        passwordHash,
        role: person.role ?? 'EMPLOYEE',
        employeeId: employeeIds.get(person.number) as string,
        scopedLegalEntityId: person.scopedTo ? (entityIds.get(person.scopedTo) as string) : null,
        lastLoginAt: d('2026-08-28'),
      },
    });
    accountCount += 1;
  }
  console.log(`  ${accountCount} login accounts`);

  // --- Compensation history -------------------------------------------------
  let compensationCount = 0;
  for (const person of EMPLOYEES) {
    const currency = entityCurrency.get(person.entity) as string;
    for (const [index, record] of person.salary.entries()) {
      const isLatest = index === person.salary.length - 1;
      const next = person.salary[index + 1];
      await prisma.compensationRecord.create({
        data: {
          employeeId: employeeIds.get(person.number) as string,
          effectiveFrom: d(record.from),
          effectiveTo: next ? new Date(d(next.from).getTime() - 86_400_000) : null,
          baseSalary: new Prisma.Decimal(record.base),
          currency,
          housingAllowance: new Prisma.Decimal(record.housing ?? 0),
          transportAllowance: new Prisma.Decimal(record.transport ?? 0),
          changeReason: record.reason,
          isCurrent: isLatest,
        },
      });
      compensationCount += 1;
    }
  }
  console.log(`  ${compensationCount} compensation records`);

  // --- Employment timeline --------------------------------------------------
  let eventCount = 0;
  for (const person of EMPLOYEES) {
    const employeeId = employeeIds.get(person.number) as string;

    await prisma.employmentEvent.create({
      data: {
        employeeId,
        type: 'HIRED',
        effectiveDate: d(person.hireDate),
        title: `Joined as ${person.jobTitle}`,
        description: `Hired into ${LEGAL_ENTITIES.find((entity) => entity.code === person.entity)?.name}`,
      },
    });
    eventCount += 1;

    // Anything after the first salary row was a real change worth showing.
    for (const record of person.salary.slice(1)) {
      await prisma.employmentEvent.create({
        data: {
          employeeId,
          type: record.reason.startsWith('Promotion') ? 'PROMOTION' : 'COMPENSATION_CHANGE',
          effectiveDate: d(record.from),
          title: record.reason,
        },
      });
      eventCount += 1;
    }

    if (person.status !== 'PROBATION' && person.probationEndDate && d(person.probationEndDate) < new Date()) {
      await prisma.employmentEvent.create({
        data: {
          employeeId,
          type: 'PROBATION_COMPLETED',
          effectiveDate: d(person.probationEndDate),
          title: 'Probation completed',
        },
      });
      eventCount += 1;
    }

    if (person.exitDate) {
      await prisma.employmentEvent.create({
        data: {
          employeeId,
          type: 'OFFBOARDED',
          effectiveDate: d(person.exitDate),
          title: 'Left the company',
          description: person.exitReason,
        },
      });
      eventCount += 1;
    }
  }
  console.log(`  ${eventCount} employment events`);

  // --- Documents ------------------------------------------------------------
  // Several expiry dates fall inside the next 90 days so the management alerts
  // panel has real entries on first load.
  const DOCUMENTS: { employee: string; category: DocumentCategory; title: string; issued: string; expires?: string; confidential?: boolean }[] = [
    { employee: 'AE-0004', category: 'CONTRACT', title: 'Employment Contract', issued: '2022-06-01', confidential: true },
    { employee: 'AE-0004', category: 'VISA_PERMIT', title: 'UAE Residence Visa', issued: '2024-09-15', expires: '2026-09-14' },
    { employee: 'AE-0004', category: 'IDENTIFICATION', title: 'Passport Copy', issued: '2021-02-10', expires: '2031-02-09', confidential: true },
    { employee: 'AE-0005', category: 'CONTRACT', title: 'Employment Contract', issued: '2023-02-13', confidential: true },
    { employee: 'AE-0005', category: 'VISA_PERMIT', title: 'UAE Residence Visa', issued: '2024-10-20', expires: '2026-10-19' },
    { employee: 'AE-0007', category: 'CONTRACT', title: 'Employment Contract', issued: '2026-03-02', confidential: true },
    { employee: 'AE-0007', category: 'VISA_PERMIT', title: 'UAE Work Permit', issued: '2026-03-10', expires: '2026-09-30' },
    { employee: 'AE-0008', category: 'CONTRACT', title: 'Fixed-term Employment Contract', issued: '2021-08-23', expires: '2026-10-31', confidential: true },
    { employee: 'AE-0002', category: 'CONTRACT', title: 'Employment Contract', issued: '2019-09-16', confidential: true },
    { employee: 'AE-0006', category: 'CERTIFICATE', title: 'CPA Certificate', issued: '2019-05-30' },
    { employee: 'SA-0003', category: 'CONTRACT', title: 'Employment Contract', issued: '2023-09-03', confidential: true },
    { employee: 'SA-0003', category: 'IDENTIFICATION', title: 'National ID Copy', issued: '2022-01-15', expires: '2027-01-14', confidential: true },
    { employee: 'SA-0005', category: 'CONTRACT', title: 'Employment Contract', issued: '2024-01-14', confidential: true },
    { employee: 'SA-0006', category: 'VISA_PERMIT', title: 'Work Permit', issued: '2026-05-10', expires: '2026-11-09' },
    { employee: 'EG-0001', category: 'CONTRACT', title: 'Employment Contract', issued: '2020-10-04', confidential: true },
    { employee: 'EG-0002', category: 'CERTIFICATE', title: 'Maternity Medical Certificate', issued: '2026-06-01', confidential: true },
    { employee: 'EG-0003', category: 'CONTRACT', title: 'Employment Contract', issued: '2024-07-07', confidential: true },
  ];

  for (const document of DOCUMENTS) {
    await prisma.document.create({
      data: {
        employeeId: employeeIds.get(document.employee) as string,
        category: document.category,
        title: document.title,
        fileName: `${document.employee}-${document.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
        fileUrl: `https://files.matajer.demo/${document.employee}/${document.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
        issuedOn: d(document.issued),
        expiresOn: document.expires ? d(document.expires) : null,
        isConfidential: document.confidential ?? false,
      },
    });
  }
  console.log(`  ${DOCUMENTS.length} documents`);

  // --- Leave balances -------------------------------------------------------
  // Created with a pro-rated entitlement, then adjusted by the seeded requests
  // below so used and pending days always agree with the request history.
  const balanceKey = (employeeNumber: string, leaveTypeId: string): string => `${employeeNumber}:${leaveTypeId}`;
  const balanceIds = new Map<string, string>();

  for (const person of EMPLOYEES) {
    if (person.status === 'OFFBOARDED') continue;
    const employeeId = employeeIds.get(person.number) as string;
    const hireYear = d(person.hireDate).getUTCFullYear();
    const monthsRemaining = hireYear === SEED_YEAR ? 12 - d(person.hireDate).getUTCMonth() : 12;

    for (const type of LEAVE_TYPES) {
      if (type.entity !== null && type.entity !== person.entity) continue;
      if ('gender' in type && type.gender !== person.gender) continue;

      const key = `${type.entity ?? 'GLOBAL'}:${type.code}`;
      const leaveTypeId = leaveTypeIds.get(key) as string;
      const entitled = Math.round(((type.days * monthsRemaining) / 12) * 2) / 2;

      const created = await prisma.leaveBalance.create({
        data: {
          employeeId,
          leaveTypeId,
          year: SEED_YEAR,
          entitledDays: new Prisma.Decimal(entitled),
        },
      });
      balanceIds.set(balanceKey(person.number, leaveTypeId), created.id);
    }
  }

  // --- Requests -------------------------------------------------------------
  const counters: Record<string, number> = { LV: 0, DOC: 0, PRC: 0 };
  const reference = (prefix: string): string => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${SEED_YEAR}-${String(counters[prefix]).padStart(4, '0')}`;
  };

  const personByNumber = new Map(EMPLOYEES.map((person) => [person.number, person]));
  const userIdByEmployeeNumber = new Map<string, string>();
  for (const person of EMPLOYEES) {
    const user = await prisma.user.findUnique({
      where: { employeeId: employeeIds.get(person.number) as string },
      select: { id: true },
    });
    if (user) userIdByEmployeeNumber.set(person.number, user.id);
  }

  for (const request of LEAVE_REQUESTS) {
    const person = personByNumber.get(request.employee) as SeedEmployee;
    const globalKey = `GLOBAL:${request.leaveCode}`;
    const entityKey = `${person.entity}:${request.leaveCode}`;
    const key = leaveTypeIds.has(entityKey) ? entityKey : globalKey;
    const leaveTypeId = leaveTypeIds.get(key) as string;

    const workingDays = countWorkingDays(
      d(request.start),
      d(request.end),
      entityWorkWeek.get(person.entity) as number[],
      holidaysByEntity.get(person.entity) ?? new Set(),
    );

    await prisma.request.create({
      data: {
        reference: reference('LV'),
        type: 'LEAVE',
        status: request.status,
        employeeId: employeeIds.get(request.employee) as string,
        legalEntityId: entityIds.get(person.entity) as string,
        submittedAt: d(request.submittedAt),
        decidedAt: request.decidedAt ? d(request.decidedAt) : null,
        decidedById: request.decidedBy ? (userIdByEmployeeNumber.get(request.decidedBy) ?? null) : null,
        decisionNote: request.decisionNote ?? null,
        cancelledAt: request.status === 'CANCELLED' ? d(request.submittedAt) : null,
        leaveDetail: {
          create: {
            leaveTypeId,
            startDate: d(request.start),
            endDate: d(request.end),
            halfDayStart: request.halfDayStart ?? false,
            halfDayEnd: request.halfDayEnd ?? false,
            workingDays: new Prisma.Decimal(workingDays),
            reason: request.reason,
            handoverNotes: request.handover ?? null,
          },
        },
      },
    });

    // Keep the balance consistent with the request that was just written.
    const balanceId = balanceIds.get(balanceKey(request.employee, leaveTypeId));
    if (balanceId && (request.status === 'APPROVED' || request.status === 'PENDING')) {
      await prisma.leaveBalance.update({
        where: { id: balanceId },
        data:
          request.status === 'APPROVED'
            ? { usedDays: { increment: new Prisma.Decimal(workingDays) } }
            : { pendingDays: { increment: new Prisma.Decimal(workingDays) } },
      });
    }
  }

  for (const request of DOCUMENT_REQUESTS) {
    const person = personByNumber.get(request.employee) as SeedEmployee;
    const requestReference = reference('DOC');

    // An approved document request has an issued letter attached, exactly as the
    // approval endpoint would create it.
    let issuedDocumentId: string | null = null;
    if (request.status === 'APPROVED') {
      const fileName = `${requestReference}-${request.documentType.toLowerCase()}.pdf`;
      const issued = await prisma.document.create({
        data: {
          employeeId: employeeIds.get(request.employee) as string,
          category: 'LETTER',
          title: request.documentType
            .split('_')
            .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
            .join(' '),
          fileName,
          fileUrl: `/documents/generated/${fileName}`,
          issuedOn: d(request.decidedAt ?? request.submittedAt),
        },
      });
      issuedDocumentId = issued.id;
    }

    await prisma.request.create({
      data: {
        reference: requestReference,
        type: 'DOCUMENT',
        status: request.status,
        employeeId: employeeIds.get(request.employee) as string,
        legalEntityId: entityIds.get(person.entity) as string,
        submittedAt: d(request.submittedAt),
        decidedAt: request.decidedAt ? d(request.decidedAt) : null,
        decidedById: request.decidedBy ? (userIdByEmployeeNumber.get(request.decidedBy) ?? null) : null,
        decisionNote: request.decisionNote ?? null,
        documentDetail: {
          create: {
            documentType: request.documentType,
            purpose: request.purpose,
            addressedTo: request.addressedTo ?? null,
            includeSalary: request.includeSalary,
            issuedDocumentId,
          },
        },
      },
    });
  }

  for (const request of PROFILE_CHANGE_REQUESTS) {
    const person = personByNumber.get(request.employee) as SeedEmployee;
    await prisma.request.create({
      data: {
        reference: reference('PRC'),
        type: 'PROFILE_CHANGE',
        status: request.status,
        employeeId: employeeIds.get(request.employee) as string,
        legalEntityId: entityIds.get(person.entity) as string,
        submittedAt: d(request.submittedAt),
        decidedAt: request.decidedAt ? d(request.decidedAt) : null,
        decidedById: request.decidedBy ? (userIdByEmployeeNumber.get(request.decidedBy) ?? null) : null,
        decisionNote: request.decisionNote ?? null,
        profileChangeDetail: {
          create: {
            changes: request.changes as unknown as Prisma.InputJsonValue,
            appliedAt: request.status === 'APPROVED' ? d(request.decidedAt as string) : null,
          },
        },
      },
    });
  }

  const requestTotal = LEAVE_REQUESTS.length + DOCUMENT_REQUESTS.length + PROFILE_CHANGE_REQUESTS.length;
  console.log(`  ${requestTotal} requests`);

  // --- Notifications --------------------------------------------------------
  // Unread items for the approvers, so the admin inbox is not empty on first login.
  const pendingRequests = await prisma.request.findMany({
    where: { status: 'PENDING' },
    include: { employee: { select: { firstName: true, lastName: true, managerId: true } } },
    orderBy: { submittedAt: 'desc' },
  });

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@matajer.demo' }, select: { id: true } });
  let notificationCount = 0;

  for (const request of pendingRequests) {
    if (!adminUser) break;
    await prisma.notification.create({
      data: {
        userId: adminUser.id,
        type: 'REQUEST_SUBMITTED',
        // Sentence case, to match the titles the live notification service writes.
        title: `${sentenceCase(request.type.replace('_', ' '))} request from ${request.employee.firstName} ${request.employee.lastName}`,
        body: `Reference ${request.reference} is awaiting a decision.`,
        entityType: 'Request',
        entityId: request.id,
        createdAt: request.submittedAt,
      },
    });
    notificationCount += 1;
  }

  // A decided request the employee has not read yet.
  const employeeUser = await prisma.user.findUnique({ where: { email: 'employee@matajer.demo' }, select: { id: true } });
  if (employeeUser) {
    await prisma.notification.create({
      data: {
        userId: employeeUser.id,
        type: 'REQUEST_APPROVED',
        title: 'Salary certificate issued',
        body: 'Your salary certificate is available in your documents.',
        entityType: 'Request',
        entityId: null,
        createdAt: d('2026-05-07'),
      },
    });
    notificationCount += 1;
  }
  console.log(`  ${notificationCount} notifications`);

  // --- Audit trail ----------------------------------------------------------
  // A short history so the audit view is populated from the first login.
  if (adminUser) {
    const decided = await prisma.request.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] } },
      select: { id: true, reference: true, type: true, status: true, decidedAt: true },
      orderBy: { decidedAt: 'desc' },
      take: 15,
    });

    for (const request of decided) {
      await prisma.auditLog.create({
        data: {
          actorUserId: adminUser.id,
          actorLabel: 'admin@matajer.demo (ADMIN)',
          action: request.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entityType: 'Request',
          entityId: request.id,
          summary: `${request.status === 'APPROVED' ? 'Approved' : 'Rejected'} ${request.type} request ${request.reference}`,
          createdAt: request.decidedAt ?? new Date(),
        },
      });
    }
    console.log(`  ${decided.length} audit entries`);
  }

  console.log('\nDemo accounts (all share the same password):');
  console.log(`  Admin           admin@matajer.demo      / ${DEMO_PASSWORD}`);
  console.log(`  HR (KSA only)   hr.ksa@matajer.demo     / ${DEMO_PASSWORD}`);
  console.log(`  Manager         manager@matajer.demo    / ${DEMO_PASSWORD}`);
  console.log(`  Employee        employee@matajer.demo   / ${DEMO_PASSWORD}`);
  console.log('\nEvery other employee can also sign in with first.last@matajer.demo and the same password.');
  console.log('Seed complete.\n');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
