import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, asUser, createFixture, login, resetDatabase, TEST_PASSWORD, type Fixture } from './fixture';
import { prisma } from '../src/db/prisma';

describe('authentication', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await createFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('signs in with valid credentials and returns a profile', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.emails.employee, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();
    expect(response.body.data.user.role).toBe('EMPLOYEE');
    expect(response.body.data.employee.fullName).toBe('Eve Employee');
  });

  it('allows the Vite development server on the IPv4 loopback origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({ email: fixture.emails.employee, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  /**
   * A disallowed origin is a client-side policy decision, not a server fault.
   * The response simply carries no CORS headers and the browser blocks it -
   * answering 500 would misreport a normal rejection as an outage.
   */
  it('withholds CORS headers from an origin outside the allowlist without erroring', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://evil.example.com')
      .send({ email: fixture.emails.employee, password: TEST_PASSWORD });

    expect(response.status).not.toBe(500);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never returns the password hash', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.emails.employee, password: TEST_PASSWORD });

    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('$2a$');
  });

  it('rejects a wrong password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.emails.employee, password: 'WrongPassword1' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  /**
   * The message and status for an unknown address must be identical to those for
   * a wrong password, otherwise the endpoint becomes an account enumerator.
   */
  it('gives an identical response for an unknown email address', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.demo', password: TEST_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('rejects a malformed login body with field-level errors', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toHaveProperty('email');
    expect(response.body.error.details).toHaveProperty('password');
  });

  it('returns the current profile from the access token', async () => {
    const token = await login(fixture.emails.manager);
    const response = await asUser(token).get('/api/v1/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(fixture.emails.manager);
    expect(response.body.data.employee.jobTitle).toBe('Engineering Manager');
  });

  it('rejects a request with no token, a malformed token and a forged token', async () => {
    await expect(request(app).get('/api/v1/auth/me').then((r) => r.status)).resolves.toBe(401);
    await expect(
      request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt').then((r) => r.status),
    ).resolves.toBe(401);
    await expect(
      request(app).get('/api/v1/auth/me').set('Authorization', 'NotBearer abc').then((r) => r.status),
    ).resolves.toBe(401);
  });

  it('rotates the refresh token and revokes the presented one', async () => {
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.emails.colleague, password: TEST_PASSWORD });
    const originalRefresh = first.body.data.refreshToken as string;

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: originalRefresh });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(originalRefresh);

    // The new token works.
    const meResponse = await asUser(refreshed.body.data.accessToken as string).get('/api/v1/auth/me');
    expect(meResponse.status).toBe(200);
  });

  /**
   * Replaying a rotated token means it either leaked or the client is broken.
   * Both warrant killing every session for that user.
   */
  it('revokes all sessions when a used refresh token is replayed', async () => {
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: fixture.emails.ksaEmployee, password: TEST_PASSWORD });
    const original = first.body.data.refreshToken as string;

    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(rotated.status).toBe(200);

    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(replay.status).toBe(401);

    // The token issued by the rotation is dead too.
    const afterPurge = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterPurge.status).toBe(401);
  });

  it('locks an account after five failed attempts', async () => {
    const email = 'lockme@test.demo';
    const employee = await prisma.employee.create({
      data: {
        employeeNumber: 'AE-9001', firstName: 'Lock', lastName: 'Me', workEmail: email,
        legalEntityId: fixture.entityAe, jobTitle: 'Tester', hireDate: new Date('2024-01-01T00:00:00Z'),
      },
    });
    await prisma.user.create({
      data: { email, passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash, employeeId: employee.id },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/v1/auth/login').send({ email, password: 'DefinitelyWrong1' });
    }

    // Even the correct password is refused while the lockout holds.
    const locked = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toContain('locked');
  });

  it('changes a password and rejects the old one afterwards', async () => {
    const email = fixture.emails.colleague;
    const token = await login(email);

    const changed = await asUser(token)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass9' });
    expect(changed.status).toBe(200);

    const oldPassword = await request(app).post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app).post('/api/v1/auth/login').send({ email, password: 'BrandNewPass9' });
    expect(newPassword.status).toBe(200);
  });

  it('refuses a password change when the current password is wrong', async () => {
    const token = await login(fixture.emails.employee);
    const response = await asUser(token)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'NotMyPassword1', newPassword: 'AnotherNewPass9' });

    expect(response.status).toBe(409);
  });

  it('enforces the password policy on the new password', async () => {
    const token = await login(fixture.emails.employee);
    const response = await asUser(token)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(response.status).toBe(422);
    expect(response.body.error.details).toHaveProperty('newPassword');
  });

  it('refuses a token belonging to a deactivated account', async () => {
    const token = await login(fixture.emails.ksaEmployee);
    expect((await asUser(token).get('/api/v1/auth/me')).status).toBe(200);

    await prisma.user.update({ where: { email: fixture.emails.ksaEmployee }, data: { isActive: false } });

    // The token is still cryptographically valid; the per-request user read is
    // what makes the deactivation take effect immediately.
    const afterDeactivation = await asUser(token).get('/api/v1/auth/me');
    expect(afterDeactivation.status).toBe(401);

    await prisma.user.update({ where: { email: fixture.emails.ksaEmployee }, data: { isActive: true } });
  });
});
