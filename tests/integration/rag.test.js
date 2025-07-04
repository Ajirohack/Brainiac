const request = require('supertest');
const app = require('../../src/app');
const { sequelize } = require('../../src/models');
const { createTestUser, getAuthToken } = require('../test-utils');
const fs = require('fs');
const path = require('path');

// Test file paths
const TEST_FILES_DIR = path.join(__dirname, '../test-files');
const TEST_PDF = path.join(TEST_FILES_DIR, 'test.pdf');
const TEST_TXT = path.join(TEST_FILES_DIR, 'test.txt');
const TEST_MD = path.join(TEST_FILES_DIR, 'test.md');

// Create test files if they don't exist
if (!fs.existsSync(TEST_FILES_DIR)) {
  fs.mkdirSync(TEST_FILES_DIR, { recursive: true });
}

// Create test files with sample content
if (!fs.existsSync(TEST_TXT)) {
  fs.writeFileSync(TEST_TXT, 'This is a test text file.\nIt contains multiple lines.\nFor testing purposes.');
}

if (!fs.existsSync(TEST_MD)) {
  fs.writeFileSync(TEST_MD, '# Test Markdown\n\nThis is a test markdown file.\n\n## With Headers\n\nAnd some content.');
}

// Create a small PDF for testing if it doesn't exist
if (!fs.existsSync(TEST_PDF)) {
  // Simple PDF content (minimal PDF with one page)
  const pdfContent = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Test PDF) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000015 00000 n \n0000000069 00000 n \n0000000123 00000 n \n0000000205 00000 n \n0000000234 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R /Info << >> >>\nstartxref\n300\n%%EOF',
    'binary'
  );
  fs.writeFileSync(TEST_PDF, pdfContent, 'binary');
}

describe('RAG API', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Sync database and create test user
    await sequelize.sync({ force: true });
    testUser = await createTestUser();
    authToken = await getAuthToken(testUser);
  });

  afterAll(async () => {
    // Clean up database
    await sequelize.close();
  });

  describe('File Upload', () => {
    it('should upload a text file', async () => {
      const response = await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', TEST_TXT);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('test.txt');
      expect(response.body.type).toBe('txt');
      expect(response.body.status).toBe('processing');
    });

    it('should upload a markdown file', async () => {
      const response = await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', TEST_MD);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('test.md');
      expect(response.body.type).toBe('md');
    });

    it('should upload a PDF file', async () => {
      const response = await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', TEST_PDF);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('test.pdf');
      expect(response.body.type).toBe('pdf');
    });

    it('should reject invalid file types', async () => {
      const invalidFile = path.join(TEST_FILES_DIR, 'test.invalid');
      fs.writeFileSync(invalidFile, 'invalid content');

      const response = await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', invalidFile);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid file type');
    });
  });

  describe('File Management', () => {
    let testFileId;

    beforeAll(async () => {
      // Upload a test file
      const response = await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', TEST_TXT);
      
      testFileId = response.body.id;
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('should list uploaded files', async () => {
      const response = await request(app)
        .get('/api/rag/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some(f => f.id === testFileId)).toBe(true);
    });

    it('should get a single file by ID', async () => {
      const response = await request(app)
        .get(`/api/rag/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testFileId);
      expect(response.body.name).toBe('test.txt');
    });

    it('should delete a file', async () => {
      const response = await request(app)
        .delete(`/api/rag/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(204);

      // Verify the file is deleted
      const getResponse = await request(app)
        .get(`/api/rag/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('Semantic Search', () => {
    beforeAll(async () => {
      // Upload test files for search
      await request(app)
        .post('/api/rag/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', TEST_TXT);

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('should perform a semantic search', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'test content',
          k: 3
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.results)).toBe(true);
      
      if (response.body.results.length > 0) {
        const result = response.body.results[0];
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('source');
      }
    });

    it('should validate search parameters', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required 'query' field
          k: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Query is required');
    });
  });
});
