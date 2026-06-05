import { expect } from 'chai';
import request from 'supertest';
import { app, server } from '../src/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('ATO Remote Cross-Chain Execution API', function () {
  before(async function () {
    this.timeout(10000);
    process.env.NODE_ENV = 'test';
  });

  after(async () => {
    server?.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.remoteExecution.deleteMany({});
  });

  describe('GET /api/remote/history', () => {
    it('should return historical logs of cross-chain execution', async () => {
      // Create sample DB entry
      await prisma.remoteExecution.create({
        data: {
          id: 'exec-test-1',
          sourceChain: 'Arc',
          destChain: 'Base',
          targetAddress: '0x3600000000000000000000000000000000000000',
          payload: '0xa9059cbb0000000000000000000000000c392a7a89f26253ee17a650a107e123f09661250000000000000000000000000000000000000000000000000000000005f5e100',
          amountUSDC: 100,
          nonce: 12345,
          status: 'EXECUTED',
          destTxHash: '0x8888888888888888888888888888888888888888888888888888888888888888',
          signature: '0xsignature123'
        }
      });

      const response = await request(app)
        .get('/api/remote/history');

      expect(response.status).to.equal(200);
      expect(response.body.length).to.equal(1);
      expect(response.body[0].destChain).to.equal('Base');
      expect(response.body[0].amountUSDC).to.equal(100);
    });
  });

  describe('POST /api/remote/execute', () => {
    it('should reject requests with missing parameters', async () => {
      const response = await request(app)
        .post('/api/remote/execute')
        .send({
          destChain: 'Base'
        });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include('Missing required parameters');
    });

    it('should propose, execute, and reconcile command status in DB', async function () {
      this.timeout(10000);
      const response = await request(app)
        .post('/api/remote/execute')
        .send({
          destChain: 'Arbitrum',
          targetAddress: '0x3600000000000000000000000000000000000000',
          payload: '0xa9059cbb0000000000000000000000000c392a7a89f26253ee17a650a107e123f09661250000000000000000000000000000000000000000000000000000000005f5e100',
          amountUSDC: 250
        });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.equal(true);
      expect(response.body.status).to.equal('EXECUTED');
      expect(response.body.txHash).to.not.be.undefined;

      // Verify db sync
      const dbEntries = await prisma.remoteExecution.findMany({});
      expect(dbEntries.length).to.equal(1);
      expect(dbEntries[0].destChain).to.equal('Arbitrum');
      expect(dbEntries[0].status).to.equal('EXECUTED');
    });
  });
});
