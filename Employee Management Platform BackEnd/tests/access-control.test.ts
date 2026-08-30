import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, asUser, createFixture, login, resetDatabase, type Fixture } from './fixture';
import { prisma } from '../src/db/prisma';

/**
 * The privacy contract, asserted end to end.
 *
 * These are the tests that would catch a regression where a serializer starts
 * spreading the Prisma row, or where an access check is dropped from a service.
 */
describe('access control and data privacy', () => {
  let fixture: Fixture;
  let adminToken: string;
  let managerToken: string;
  let employeeToken: string;
  let hrKsaToken: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await createFixture();
    adminToken = await login(fixture.emails.admin);
    managerToken = await login(fixture.emails.manager);
    employeeToken = await login(fixture.emails.employee);
    hrKsaToken = await login(fixture.emails.hrKsa);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('unauthenticated access', () => {
    it('rejects every protected collection', async () => {
      for (const path of [
        '/api/v1/employees',
        '/api/v1/requests',
        '/api/v1/legal-entities',
        '/api/v1/dashboard',
        '/api/v1/audit-logs',
        '/api/v1/me/profile',
      ]) {
        expect((await request(app).get(path)).status, `${path} should require a token`).toBe(401);
      }
    });
  });

  describe('compensation', () => {
    it('lets an employee read their own salary', async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.employee}/compensation`);
      expect(response.status).toBe(200);
      expect(response.body.data.current.baseSalary).toBe(20000);
    });

    it("blocks an employee from reading a colleague's salary", async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.colleague}/compensation`);
      expect(response.status).toBe(403);
    });

    /**
     * Deliberate product decision: a line manager sees most of their report's
     * record but never their pay. Pay conversations belong to HR.
     */
    it("blocks a line manager from reading a direct report's salary", async () => {
      const response = await asUser(managerToken).get(`/api/v1/employees/${fixture.employee}/compensation`);
      expect(response.status).toBe(403);
    });

    it('lets HR read any salary within their scope', async () => {
      const response = await asUser(adminToken).get(`/api/v1/employees/${fixture.employee}/compensation`);
      expect(response.status).toBe(200);
    });

    it('blocks an employee from writing their own salary', async () => {
      const response = await asUser(employeeToken)
        .post(`/api/v1/employees/${fixture.employee}/compensation`)
        .send({ baseSalary: 999999, effectiveFrom: '2026-09-01', changeReason: 'Self-awarded raise' });
      expect(response.status).toBe(403);
    });

    it('records an audit entry when someone else reads a salary', async () => {
      await asUser(adminToken).get(`/api/v1/employees/${fixture.colleague}/compensation`);
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'VIEW_SENSITIVE', entityId: fixture.colleague },
      });
      expect(entry).not.toBeNull();
    });

    /**
     * Scoped to the actor, not the record: HR may legitimately have read this
     * same salary earlier in the suite, and those entries must remain.
     */
    it('does not audit an employee reading their own salary', async () => {
      const employeeUser = await prisma.user.findUniqueOrThrow({
        where: { email: fixture.emails.employee },
        select: { id: true },
      });

      await asUser(employeeToken).get(`/api/v1/employees/${fixture.employee}/compensation`);

      const selfReads = await prisma.auditLog.count({
        where: { action: 'VIEW_SENSITIVE', actorUserId: employeeUser.id },
      });
      expect(selfReads).toBe(0);
    });
  });

  describe('employee records', () => {
    it('gives a colleague only directory-level fields', async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.colleague}`);

      expect(response.status).toBe(200);
      expect(response.body.data.viewLevel).toBe('DIRECTORY');
      expect(response.body.data.fullName).toBe('Cal Colleague');
      // Personal identity data must be absent, not merely null.
      expect(response.body.data).not.toHaveProperty('dateOfBirth');
      expect(response.body.data).not.toHaveProperty('address');
      expect(response.body.data).not.toHaveProperty('emergencyContact');
      expect(response.body.data).not.toHaveProperty('personalEmail');
    });

    it('gives a manager working context but not personal identity data', async () => {
      const response = await asUser(managerToken).get(`/api/v1/employees/${fixture.employee}`);

      expect(response.status).toBe(200);
      expect(response.body.data.viewLevel).toBe('MANAGER');
      expect(response.body.data).toHaveProperty('hireDate');
      expect(response.body.data).not.toHaveProperty('dateOfBirth');
      expect(response.body.data).not.toHaveProperty('emergencyContact');
    });

    it('gives the employee their own full record', async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.employee}`);

      expect(response.status).toBe(200);
      expect(response.body.data.viewLevel).toBe('FULL');
      expect(response.body.data).toHaveProperty('dateOfBirth');
      expect(response.body.data).toHaveProperty('emergencyContact');
    });

    it('never exposes the login account to a non-management caller', async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.colleague}`);
      expect(response.body.data.account).toBeUndefined();

      const adminResponse = await asUser(adminToken).get(`/api/v1/employees/${fixture.colleague}`);
      expect(adminResponse.body.data.account).toMatchObject({ email: fixture.emails.colleague });
    });

    it('blocks an employee from creating or editing records', async () => {
      const create = await asUser(employeeToken).post('/api/v1/employees').send({});
      expect(create.status).toBe(403);

      const update = await asUser(employeeToken)
        .patch(`/api/v1/employees/${fixture.colleague}`)
        .send({ jobTitle: 'Chief Executive Officer' });
      expect(update.status).toBe(403);
    });

    it('blocks an employee from promoting themselves', async () => {
      const response = await asUser(employeeToken)
        .patch(`/api/v1/employees/${fixture.employee}`)
        .send({ jobTitle: 'Chief Executive Officer' });
      expect(response.status).toBe(403);
    });
  });

  describe('legal entity scoping', () => {
    it('limits a scoped HR admin to their own entity in the directory', async () => {
      const response = await asUser(hrKsaToken).get('/api/v1/employees?pageSize=50');

      expect(response.status).toBe(200);
      const entities: string[] = response.body.data.map((row: { legalEntity: { code: string } }) => row.legalEntity.code);
      expect(new Set(entities)).toEqual(new Set(['TST-SA']));
    });

    it('blocks a scoped HR admin from another entity record', async () => {
      const response = await asUser(hrKsaToken).get(`/api/v1/employees/${fixture.employee}/compensation`);
      expect(response.status).toBe(403);
    });

    it('blocks a scoped HR admin from creating an employee in another entity', async () => {
      const response = await asUser(hrKsaToken).post('/api/v1/employees').send({
        firstName: 'Out', lastName: 'OfScope', workEmail: 'out.ofscope@test.demo',
        legalEntityId: fixture.entityAe, jobTitle: 'Engineer', hireDate: '2026-09-01',
      });
      expect(response.status).toBe(403);
    });

    it('allows a global admin across every entity', async () => {
      const response = await asUser(adminToken).get('/api/v1/employees?pageSize=50');
      const entities: string[] = response.body.data.map((row: { legalEntity: { code: string } }) => row.legalEntity.code);
      expect(new Set(entities)).toEqual(new Set(['TST-AE', 'TST-SA']));
    });
  });

  describe('documents and audit trail', () => {
    it("blocks an employee from listing a colleague's documents", async () => {
      const response = await asUser(employeeToken).get(`/api/v1/employees/${fixture.colleague}/documents`);
      expect(response.status).toBe(403);
    });

    it('hides confidential documents from the employee they belong to', async () => {
      await prisma.document.createMany({
        data: [
          {
            employeeId: fixture.employee, category: 'CONTRACT', title: 'Signed contract',
            fileName: 'c.pdf', fileUrl: 'https://files.test.demo/c.pdf', isConfidential: true,
          },
          {
            employeeId: fixture.employee, category: 'LETTER', title: 'Employment letter',
            fileName: 'l.pdf', fileUrl: 'https://files.test.demo/l.pdf', isConfidential: false,
          },
        ],
      });

      const own = await asUser(employeeToken).get('/api/v1/me/documents');
      const titles: string[] = own.body.data.map((row: { title: string }) => row.title);
      expect(titles).toContain('Employment letter');
      expect(titles).not.toContain('Signed contract');

      const hr = await asUser(adminToken).get(`/api/v1/employees/${fixture.employee}/documents`);
      const hrTitles: string[] = hr.body.data.map((row: { title: string }) => row.title);
      expect(hrTitles).toContain('Signed contract');
    });

    it('restricts the audit trail to management', async () => {
      expect((await asUser(employeeToken).get('/api/v1/audit-logs')).status).toBe(403);
      expect((await asUser(managerToken).get('/api/v1/audit-logs')).status).toBe(403);
      expect((await asUser(adminToken).get('/api/v1/audit-logs')).status).toBe(200);
    });

    it('restricts the compensation overview to management', async () => {
      expect((await asUser(employeeToken).get('/api/v1/dashboard/compensation-overview')).status).toBe(403);
      expect((await asUser(adminToken).get('/api/v1/dashboard/compensation-overview')).status).toBe(200);
    });
  });

  describe('self-service surface', () => {
    it('resolves /me routes from the token, ignoring any supplied employee id', async () => {
      const response = await asUser(employeeToken).get(`/api/v1/me/requests?employeeId=${fixture.colleague}`);
      expect(response.status).toBe(200);
      // Nothing belonging to the colleague can appear regardless of the query.
      const owners: string[] = response.body.data.map((row: { employee: { id: string } }) => row.employee.id);
      expect(owners.every((id) => id === fixture.employee)).toBe(true);
    });
  });
});
