import { describe, expect, it } from 'vitest'
import {
  adaptEmployee,
  adaptEntity,
  adaptLeaveBalance,
  adaptRequest,
  adaptSession,
  avatarColor,
  headlineBalance,
  initialsOf,
} from '../src/api/adapters.js'

/**
 * The adapters are the seam between the API's shapes and what the UI renders.
 * A silent change on either side shows up here first, which is why this is the
 * layer worth testing hardest on the frontend.
 */

describe('adaptEmployee', () => {
  const directoryRow = {
    id: 'emp_1',
    employeeNumber: 'AE-0004',
    firstName: 'Yusuf',
    lastName: 'Karim',
    fullName: 'Yusuf Karim',
    workEmail: 'yusuf.karim@matajer.demo',
    jobTitle: 'Senior Backend Engineer',
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    department: { id: 'dep_1', name: 'Engineering' },
    legalEntity: { id: 'ent_1', code: 'MTJ-AE', name: 'Matajer UAE', countryCode: 'AE', currency: 'AED' },
    manager: { id: 'emp_2', fullName: 'Omar Al-Zaabi' },
    viewLevel: 'DIRECTORY',
  }

  it('maps API field names onto the names the UI uses', () => {
    const employee = adaptEmployee(directoryRow)

    expect(employee.role).toBe('Senior Backend Engineer') // jobTitle -> role
    expect(employee.email).toBe('yusuf.karim@matajer.demo') // workEmail -> email
    expect(employee.department).toBe('Engineering') // object -> string
    expect(employee.entityId).toBe('ent_1')
    expect(employee.currency).toBe('AED')
    expect(employee.managerName).toBe('Omar Al-Zaabi')
  })

  it('translates enums into human labels while keeping the raw value', () => {
    const employee = adaptEmployee({ ...directoryRow, status: 'NOTICE_PERIOD' })

    expect(employee.status).toBe('Notice period')
    // The raw value is retained so filters can send it back to the API.
    expect(employee.statusValue).toBe('NOTICE_PERIOD')
    expect(employee.employmentType).toBe('Full-time')
    expect(employee.workMode).toBe('Remote')
  })

  /**
   * The API omits restricted fields rather than nulling them. The adapter must
   * preserve that: `undefined` means "not permitted", which is what lets the UI
   * hide a section instead of rendering an empty row.
   */
  it('leaves restricted fields undefined at directory level', () => {
    const employee = adaptEmployee(directoryRow)

    expect(employee.dateOfBirth).toBeUndefined()
    expect(employee.address).toBeUndefined()
    expect(employee.emergencyContact).toBeUndefined()
    expect(employee.phone).toBeUndefined()
    expect(employee.viewLevel).toBe('DIRECTORY')
  })

  it('composes address and emergency contact when the caller may see them', () => {
    const employee = adaptEmployee({
      ...directoryRow,
      viewLevel: 'FULL',
      phone: '+971 50 100 0004',
      address: { line: 'Villa 17', city: 'Dubai', country: 'United Arab Emirates' },
      emergencyContact: { name: 'Lina Karim', phone: '+971 50 100 9004', relation: 'Spouse' },
    })

    expect(employee.address).toBe('Villa 17, Dubai, United Arab Emirates')
    expect(employee.emergencyContact).toBe('Lina Karim · Spouse')
    expect(employee.emergencyContactPhone).toBe('+971 50 100 9004')
  })

  it('survives a partial address without producing stray separators', () => {
    const employee = adaptEmployee({ ...directoryRow, address: { line: null, city: 'Cairo', country: null } })
    expect(employee.address).toBe('Cairo')
  })

  it('returns null for a missing employee rather than throwing', () => {
    expect(adaptEmployee(null)).toBeNull()
  })
})

describe('avatar helpers', () => {
  it('gives the same person the same colour every time', () => {
    expect(avatarColor('emp_1')).toBe(avatarColor('emp_1'))
    expect(avatarColor('emp_1')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('builds initials and falls back when a name is missing', () => {
    expect(initialsOf('Yusuf', 'Karim')).toBe('YK')
    expect(initialsOf('', '')).toBe('??')
  })
})

describe('adaptRequest', () => {
  const base = {
    id: 'req_1',
    reference: 'LV-2026-0027',
    type: 'LEAVE',
    status: 'PENDING',
    submittedAt: '2026-08-24T10:00:00.000Z',
    decidedAt: null,
    decisionNote: null,
    employee: {
      id: 'emp_1',
      employeeNumber: 'AE-0004',
      fullName: 'Yusuf Karim',
      jobTitle: 'Engineer',
      department: { id: 'd', name: 'Engineering' },
      legalEntity: { id: 'ent_1', code: 'MTJ-AE', name: 'Matajer UAE' },
    },
  }

  it('flattens a leave request', () => {
    const request = adaptRequest({
      ...base,
      leave: {
        leaveType: { id: 'lt_1', name: 'Annual Leave', colorHex: '#2563eb' },
        startDate: '2026-11-26',
        endDate: '2026-12-03',
        workingDays: 3,
        reason: 'Year-end trip',
      },
    })

    expect(request.type).toBe('Leave')
    expect(request.status).toBe('Pending')
    expect(request.subtype).toBe('Annual Leave')
    expect(request.days).toBe(3)
    expect(request.employee.initials).toBe('YK')
  })

  /**
   * When the viewer may not see the private reason the API sends null. The
   * adapter must pass that through untouched so the UI can hide it.
   */
  it('carries a withheld reason through as null', () => {
    const request = adaptRequest({
      ...base,
      leave: { leaveType: { name: 'Annual Leave' }, startDate: '2026-11-26', endDate: '2026-12-03', workingDays: 3, reason: null },
    })
    expect(request.reason).toBeNull()
  })

  it('flattens a document request and maps the language code', () => {
    const request = adaptRequest({
      ...base,
      type: 'DOCUMENT',
      document: {
        documentType: 'SALARY_CERTIFICATE',
        title: 'Salary Certificate',
        purpose: 'Bank loan',
        includeSalary: true,
        language: 'AR',
        issuedDocument: null,
      },
    })

    expect(request.type).toBe('Document')
    expect(request.subtype).toBe('Salary Certificate')
    expect(request.language).toBe('Arabic')
    expect(request.includeSalary).toBe(true)
  })

  it('summarises a profile change into a readable field list', () => {
    const request = adaptRequest({
      ...base,
      type: 'PROFILE_CHANGE',
      profileChange: {
        changes: [
          { field: 'phone', label: 'Phone number', currentValue: '+971 1', proposedValue: '+971 2' },
          { field: 'city', label: 'City', currentValue: 'Dubai', proposedValue: 'Abu Dhabi' },
        ],
        changeCount: 2,
        appliedAt: null,
      },
    })

    expect(request.type).toBe('Profile')
    expect(request.changeCount).toBe(2)
    expect(request.purpose).toBe('Phone number, City')
  })

  it('maps a cancelled status to its label', () => {
    expect(adaptRequest({ ...base, status: 'CANCELLED' }).status).toBe('Cancelled')
  })
})

describe('adaptEntity', () => {
  it('flattens the country object and assigns a stable palette', () => {
    const entity = adaptEntity(
      {
        id: 'ent_1',
        code: 'MTJ-AE',
        name: 'Matajer UAE',
        legalName: 'Matajer Retail Technologies FZ-LLC',
        registrationNumber: 'DMCC-DEMO-114233',
        country: { code: 'AE', name: 'United Arab Emirates' },
        city: 'Dubai',
        currency: 'AED',
        timezone: 'Asia/Dubai',
        workWeekLabel: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        isActive: true,
        headcount: 8,
      },
      0,
    )

    expect(entity.country).toBe('United Arab Emirates')
    expect(entity.countryCode).toBe('AE')
    expect(entity.name).toBe('Matajer Retail Technologies FZ-LLC')
    expect(entity.shortName).toBe('Matajer UAE')
    expect(entity.status).toBe('Active')
    expect(entity.color).toMatch(/^#/)
  })
})

describe('leave balances', () => {
  const balance = {
    id: 'b1',
    year: 2026,
    leaveType: { id: 'lt_1', code: 'ANNUAL', name: 'Annual Leave', colorHex: '#2563eb', isPaid: true },
    totalEntitlement: 30,
    usedDays: 8,
    pendingDays: 5,
    availableDays: 17,
  }

  it('coerces the API decimals to numbers', () => {
    const adapted = adaptLeaveBalance(balance)
    expect(adapted.entitled).toBe(30)
    expect(adapted.available).toBe(17)
    expect(typeof adapted.used).toBe('number')
  })

  it('picks annual leave as the headline figure', () => {
    const headline = headlineBalance([
      adaptLeaveBalance({ ...balance, leaveType: { ...balance.leaveType, code: 'SICK', name: 'Sick Leave' } }),
      adaptLeaveBalance(balance),
    ])
    expect(headline.name).toBe('Annual Leave')
    expect(headline.available).toBe(17)
  })

  it('degrades safely when the employee has no balances at all', () => {
    const headline = headlineBalance([])
    expect(headline.available).toBe(0)
    expect(headline.name).toBe('Annual leave')
  })
})

describe('adaptSession', () => {
  const profile = (role) => ({
    user: { id: 'u1', email: 'x@test.demo', role, mustChangePassword: false, scopedLegalEntityId: null },
    employee: {
      id: 'emp_1',
      employeeNumber: 'AE-0003',
      firstName: 'Priya',
      lastName: 'Raman',
      fullName: 'Priya Raman',
      jobTitle: 'Head of People',
      status: 'ACTIVE',
      department: { id: 'd', name: 'People' },
      legalEntity: { id: 'ent_1', code: 'MTJ-AE', name: 'Matajer UAE', currency: 'AED' },
      manager: null,
    },
  })

  it('routes ADMIN and HR_ADMIN to the management workspace', () => {
    expect(adaptSession(profile('ADMIN')).role).toBe('admin')
    expect(adaptSession(profile('HR_ADMIN')).role).toBe('admin')
    expect(adaptSession(profile('ADMIN')).isManagement).toBe(true)
  })

  it('routes MANAGER and EMPLOYEE to self-service', () => {
    expect(adaptSession(profile('MANAGER')).role).toBe('employee')
    expect(adaptSession(profile('EMPLOYEE')).role).toBe('employee')
    expect(adaptSession(profile('MANAGER')).isManagement).toBe(false)
    expect(adaptSession(profile('MANAGER')).isManager).toBe(true)
  })

  it('handles a login with no employee record', () => {
    const session = adaptSession({ user: { id: 'u1', email: 'x@test.demo', role: 'ADMIN' }, employee: null })
    expect(session.employee).toBeNull()
    expect(session.role).toBe('admin')
  })
})
