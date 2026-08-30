/**
 * Static UI constants only.
 *
 * All organisational data - entities, employees, requests - now comes from the
 * API. What remains here is presentation copy and the demo credentials the
 * login screen offers as a convenience; the credentials are still verified by
 * the backend, so the list is a shortcut, not an authentication path.
 */

export const DEMO_ACCOUNTS = [
  {
    label: 'Admin workspace',
    description: 'Manage people & requests',
    email: 'admin@matajer.demo',
    password: 'Passw0rd!23',
    tone: 'admin',
  },
  {
    label: 'Employee workspace',
    description: 'Profile & self-service',
    email: 'employee@matajer.demo',
    password: 'Passw0rd!23',
    tone: 'employee',
  },
]

export const LOGIN_HIGHLIGHTS = {
  headline: '18 demo employees',
  subline: 'Across UAE, Saudi Arabia & Egypt',
  avatars: [
    { initials: 'PR', color: '#e9b7a5' },
    { initials: 'OA', color: '#9ec7bd' },
    { initials: 'YK', color: '#f0c96d' },
    { initials: 'HQ', color: '#b9add7' },
  ],
}

export const NAV_BY_ROLE = {
  admin: [
    { id: 'overview', label: 'Overview' },
    { id: 'people', label: 'People' },
    { id: 'requests', label: 'Requests' },
    { id: 'entities', label: 'Legal entities' },
  ],
  employee: [
    { id: 'home', label: 'Home' },
    { id: 'profile', label: 'My profile' },
    { id: 'my-requests', label: 'My requests' },
  ],
}

export const DEPARTMENT_FALLBACK = 'Unassigned'

/** Leave types offered in the self-service form when the API list is unavailable. */
export const DOCUMENT_REQUEST_TYPES = [
  { value: 'EMPLOYMENT_CERTIFICATE', label: 'Employment certificate' },
  { value: 'SALARY_CERTIFICATE', label: 'Salary certificate' },
  { value: 'EXPERIENCE_LETTER', label: 'Experience letter' },
  { value: 'NOC_TRAVEL', label: 'No objection certificate (travel)' },
  { value: 'VISA_LETTER', label: 'Visa support letter' },
  { value: 'BANK_ACCOUNT_LETTER', label: 'Bank account letter' },
]

export const EMPLOYEE_STATUS_OPTIONS = ['Active', 'Probation', 'On leave', 'Notice period', 'Offboarded']

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
]

export const WORK_MODE_OPTIONS = [
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'REMOTE', label: 'Remote' },
]

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'UNLIMITED', label: 'Unlimited' },
  { value: 'LIMITED', label: 'Limited term' },
]
