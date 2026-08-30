import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createFixture, login, resetDatabase, type Fixture } from './fixture';
import { prisma } from '../src/db/prisma';
import {
  buildTemplateLetter,
  generateLetter,
  isAiLetterGenerationEnabled,
  mentionsMoney,
  type LetterFacts,
} from '../src/modules/ai/letter.service';

const baseFacts: LetterFacts = {
  documentType: 'EMPLOYMENT_CERTIFICATE',
  reference: 'DOC-2026-0001',
  employeeName: 'Eve Employee',
  employeeNumber: 'AE-0003',
  jobTitle: 'Engineer',
  department: 'Engineering',
  hireDate: '2023-01-09',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  nationality: 'Jordanian',
  legalEntityName: 'Test UAE LLC',
  legalEntityCity: 'Dubai',
  legalEntityCountry: 'United Arab Emirates',
  registrationNumber: 'TEST-1',
  purpose: 'a tenancy contract',
  addressedTo: null,
  salary: null,
  issuedOn: '2026-08-30',
};

describe('HR letter drafting', () => {
  describe('templates (the guaranteed floor)', () => {
    it('produces a complete bilingual letter with no API key needed', () => {
      const letter = buildTemplateLetter(baseFacts);

      expect(letter.isAiGenerated).toBe(false);
      expect(letter.contentEn).toContain('Eve Employee');
      expect(letter.contentEn).toContain('AE-0003');
      expect(letter.contentEn).toContain('Test UAE LLC');
      expect(letter.contentEn).toContain('DOC-2026-0001');
      expect(letter.contentAr).toContain('Eve Employee');
      expect(letter.contentAr).toContain('إدارة الموارد البشرية');
    });

    /**
     * The core privacy rule for this feature: a letter the employee did not ask
     * to state their salary must contain no pay figure in either language.
     */
    it('never states pay when the employee did not request it', () => {
      const letter = buildTemplateLetter(baseFacts);

      expect(mentionsMoney(letter.contentEn)).toBe(false);
      expect(mentionsMoney(letter.contentAr)).toBe(false);
      expect(letter.contentEn).not.toMatch(/salary|compensation is/i);
    });

    it('states pay in both languages when the employee did request it', () => {
      const letter = buildTemplateLetter({
        ...baseFacts,
        documentType: 'SALARY_CERTIFICATE',
        salary: { amount: 20000, currency: 'AED', frequency: 'MONTHLY' },
      });

      expect(letter.contentEn).toContain('AED 20,000');
      expect(letter.contentAr).toContain('AED 20,000');
    });

    it('covers every document type without leaving a placeholder', () => {
      const types = [
        'EMPLOYMENT_CERTIFICATE',
        'SALARY_CERTIFICATE',
        'EXPERIENCE_LETTER',
        'NOC_TRAVEL',
        'VISA_LETTER',
        'BANK_ACCOUNT_LETTER',
      ] as const;

      for (const documentType of types) {
        const letter = buildTemplateLetter({ ...baseFacts, documentType });
        expect(letter.contentEn.length, documentType).toBeGreaterThan(200);
        expect(letter.contentAr.length, documentType).toBeGreaterThan(150);
        // A letter that ships with "[insert x]" in it is not signable.
        expect(letter.contentEn, documentType).not.toMatch(/\[|undefined|null/);
        expect(letter.contentAr, documentType).not.toMatch(/\[|undefined|null/);
      }
    });

    it('addresses a named recipient when one was given', () => {
      const letter = buildTemplateLetter({ ...baseFacts, addressedTo: 'Emirates Demo Bank' });
      expect(letter.contentEn).toContain('Emirates Demo Bank');
      expect(letter.contentAr).toContain('Emirates Demo Bank');
    });
  });

  describe('money detector', () => {
    it('catches currency codes and amounts in both scripts', () => {
      expect(mentionsMoney('The salary is AED 20,000 monthly')).toBe(true);
      expect(mentionsMoney('راتبه 20,000 درهم')).toBe(true);
      expect(mentionsMoney('يبلغ راتبه 15000 ريال')).toBe(true);
      expect(mentionsMoney('This is to certify that Eve works here since 2023-01-09')).toBe(false);
    });
  });

  describe('generation without an API key', () => {
    /**
     * The whole product must work with no credentials configured - that is what
     * lets the demo be evaluated without a key.
     */
    it('falls back to the template rather than failing', async () => {
      const letter = await generateLetter(baseFacts);

      expect(letter.contentEn).toBeTruthy();
      expect(letter.contentAr).toBeTruthy();
      if (!isAiLetterGenerationEnabled()) {
        expect(letter.isAiGenerated).toBe(false);
      }
    });
  });
});

describe('document request approval issues a letter', () => {
  let fixture: Fixture;
  let adminToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await createFixture();
    adminToken = await login(fixture.emails.admin);
    employeeToken = await login(fixture.emails.employee);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores the letter body on approval and shows it to the employee', async () => {
    const submitted = await asUser(employeeToken).post('/api/v1/requests/document').send({
      documentType: 'EMPLOYMENT_CERTIFICATE',
      purpose: 'Tenancy contract',
      addressedTo: 'Demo Landlord',
    });
    expect(submitted.status).toBe(201);

    const approved = await asUser(adminToken)
      .post(`/api/v1/requests/${submitted.body.data.id}/approve`)
      .send({ note: 'Issued' });
    expect(approved.status).toBe(200);

    const documentId = approved.body.data.document.issuedDocument.id as string;

    const content = await asUser(employeeToken).get(`/api/v1/documents/${documentId}`);
    expect(content.status).toBe(200);
    expect(content.body.data.contentEn).toContain('Eve Employee');
    expect(content.body.data.contentAr).toBeTruthy();
    expect(content.body.data).toHaveProperty('isAiGenerated');
    // No salary was requested, so none may appear.
    expect(mentionsMoney(content.body.data.contentEn)).toBe(false);
  });

  it('states the salary when a salary certificate was requested', async () => {
    const submitted = await asUser(employeeToken).post('/api/v1/requests/document').send({
      documentType: 'SALARY_CERTIFICATE',
      purpose: 'Bank loan application',
    });

    const approved = await asUser(adminToken)
      .post(`/api/v1/requests/${submitted.body.data.id}/approve`)
      .send({});
    expect(approved.status).toBe(200);

    const documentId = approved.body.data.document.issuedDocument.id as string;
    const content = await asUser(adminToken).get(`/api/v1/documents/${documentId}`);

    // The fixture gives this employee a 20,000 AED salary.
    expect(content.body.data.contentEn).toMatch(/20,000|20000/);
  });

  it("blocks a colleague from reading someone else's letter", async () => {
    const submitted = await asUser(employeeToken).post('/api/v1/requests/document').send({
      documentType: 'EXPERIENCE_LETTER',
      purpose: 'Professional membership',
    });
    const approved = await asUser(adminToken)
      .post(`/api/v1/requests/${submitted.body.data.id}/approve`)
      .send({});
    const documentId = approved.body.data.document.issuedDocument.id as string;

    const colleagueToken = await login(fixture.emails.colleague);
    const response = await asUser(colleagueToken).get(`/api/v1/documents/${documentId}`);

    expect(response.status).toBe(403);
  });

  it('requires authentication to read a letter', async () => {
    const response = await asUser('not-a-token').get('/api/v1/documents/anything');
    expect(response.status).toBe(401);
  });
});
