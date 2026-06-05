import { expect } from 'chai';
import request from 'supertest';
import { app, server } from '../src/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('ATO Real-Time Webhook Engine & Database Sync Integration', () => {
  before(async () => {
    // Set node environment to test to enable mock signature bypass
    process.env.NODE_ENV = 'test';
  });

  after(async () => {
    // Close the Express server after tests finish
    server?.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear the database before each test
    await prisma.wireTransaction.deleteMany({});
    await prisma.bankAccount.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.webhookLog.deleteMany({});
  });

  describe('Webhook Authentication & Signature Validation', () => {
    it('Should reject incoming webhooks missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks')
        .send({ id: 'evt_1', type: 'transfers.updated', data: {} });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include('Missing Circle signature headers');
    });

    it('Should reject webhooks with invalid signatures', async () => {
      // Temporarily restore production signature check logic
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'invalid-signature')
        .set('X-Circle-Key-Id', 'key_1')
        .send({ id: 'evt_2', type: 'transfers.updated', data: {} });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.include('Invalid webhook signature');

      // Reset to test environment
      process.env.NODE_ENV = 'test';
    });

    it('Should accept webhooks with valid or mock signatures in test environment', async () => {
      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send({
          id: 'evt_3',
          type: 'some.other.event',
          data: {}
        });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('IGNORED'); // Ignored because event type is not processed, but signature is validated!
    });
  });

  describe('Database Reconciliation & Sync Loops', () => {
    it('Should reconcile transaction and invoice status to SUCCESS/SETTLED on complete webhook', async () => {
      const invoiceId = 'INV-SIM-001';
      const txId = 'tx_circle_12345';
      const blockchainHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      // 1. Setup pending invoice and transaction in database
      await prisma.invoice.create({
        data: {
          id: invoiceId,
          amount: 250.00,
          token: 'USDC',
          recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          type: 'direct',
          status: 'PENDING'
        }
      });

      await prisma.transaction.create({
        data: {
          id: txId,
          invoiceId: invoiceId,
          walletId: 'wallet_abc_999',
          amount: 250.00,
          status: 'PENDING',
          blockchainTxHash: null
        }
      });

      // 2. Dispatch transfers.updated event representing transaction success
      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send({
          id: 'evt_success_99',
          type: 'transfers.updated',
          data: {
            id: txId,
            status: 'complete',
            blockchainTxHash: blockchainHash
          }
        });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('PROCESSED');

      // 3. Verify database states updated correctly
      const updatedTx = await prisma.transaction.findUnique({ where: { id: txId } });
      const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

      expect(updatedTx?.status).to.equal('SUCCESS');
      expect(updatedTx?.blockchainTxHash).to.equal(blockchainHash);
      expect(updatedInvoice?.status).to.equal('SETTLED');

      // 4. Verify webhook log is persisted
      const log = await prisma.webhookLog.findUnique({ where: { eventId: 'evt_success_99' } });
      expect(log).to.not.be.null;
      expect(log?.status).to.equal('PROCESSED');
    });

    it('Should reconcile transaction and invoice status to FAILED on failed webhook', async () => {
      const invoiceId = 'INV-SIM-002';
      const txId = 'tx_circle_67890';

      await prisma.invoice.create({
        data: {
          id: invoiceId,
          amount: 100.00,
          token: 'EURC',
          recipient: '0x9994CdDdB6a900fa2b585dd299e03d12FA4293BC',
          type: 'milestone',
          status: 'PENDING'
        }
      });

      await prisma.transaction.create({
        data: {
          id: txId,
          invoiceId: invoiceId,
          walletId: 'wallet_abc_777',
          amount: 100.00,
          status: 'PENDING',
          blockchainTxHash: null
        }
      });

      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send({
          id: 'evt_fail_100',
          type: 'transfers.updated',
          data: {
            id: txId,
            status: 'failed'
          }
        });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('PROCESSED');

      const updatedTx = await prisma.transaction.findUnique({ where: { id: txId } });
      const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

      expect(updatedTx?.status).to.equal('FAILED');
      expect(updatedInvoice?.status).to.equal('FAILED');
    });

    it('Should prevent duplicate processing and return DUPLICATE for duplicate webhook delivery', async () => {
      const eventId = 'evt_duplicate_test';
      const payload = {
        id: eventId,
        type: 'transfers.updated',
        data: {
          id: 'some_ref',
          status: 'complete'
        }
      };

      // 1. Send first delivery
      const response1 = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send(payload);

      expect(response1.status).to.equal(200);
      expect(response1.body.status).to.equal('IGNORED'); // Ignored because 'some_ref' is not in DB, but logged as IGNORED

      // 2. Send second delivery (duplicate)
      const response2 = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send(payload);

      expect(response2.status).to.equal(200);
      expect(response2.body.status).to.equal('DUPLICATE');
      expect(response2.body.message).to.include('Event already processed');

      // Verify only 1 webhook log was recorded for this event
      const logs = await prisma.webhookLog.findMany({ where: { eventId } });
      expect(logs.length).to.equal(1);
    });

    it('Should log event as IGNORED when no matching transaction ID exists in DB', async () => {
      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send({
          id: 'evt_unlinked_888',
          type: 'transfers.updated',
          data: {
            id: 'unlinked_tx_id',
            status: 'complete'
          }
        });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('IGNORED');

      const log = await prisma.webhookLog.findUnique({ where: { eventId: 'evt_unlinked_888' } });
      expect(log?.status).to.equal('IGNORED');
    });
  });

  describe('Circle Mint & CPN Traditional Banking Rails', () => {
    it('Should link a corporate bank account via POST /api/banks', async () => {
      const response = await request(app)
        .post('/api/banks')
        .send({
          bankName: 'Silicon Valley Bank',
          accountNumber: '123456789',
          routingNumber: '021000021'
        });

      expect(response.status).to.equal(200);
      expect(response.body.bankName).to.equal('Silicon Valley Bank');
      expect(response.body.routingNumber).to.equal('021000021');
      expect(response.body.status).to.equal('ACTIVE');

      // Account number must be masked in response
      expect(response.body.accountNumber).to.include('*****');

      const banks = await prisma.bankAccount.findMany({});
      expect(banks.length).to.equal(1);
      expect(banks[0].bankName).to.equal('Silicon Valley Bank');
    });

    it('Should fetch linked bank accounts via GET /api/banks', async () => {
      await prisma.bankAccount.create({
        data: {
          id: 'bank_test_123',
          bankName: 'JPMorgan Chase',
          accountNumber: '*********9876',
          routingNumber: '121000248',
          status: 'ACTIVE'
        }
      });

      const response = await request(app).get('/api/banks');
      expect(response.status).to.equal(200);
      expect(response.body.length).to.equal(1);
      expect(response.body[0].bankName).to.equal('JPMorgan Chase');
    });

    it('Should initiate bank payout and create OUTFLOW transaction via POST /api/banks/payout', async () => {
      await prisma.bankAccount.create({
        data: {
          id: 'bank_test_999',
          bankName: 'Bank of America',
          accountNumber: '*********4321',
          routingNumber: '021000021',
          status: 'ACTIVE'
        }
      });

      const response = await request(app)
        .post('/api/banks/payout')
        .send({
          bankAccountId: 'bank_test_999',
          amount: 50000.00,
          currency: 'USD'
        });

      expect(response.status).to.equal(200);
      expect(response.body.amount).to.equal(50000.00);
      expect(response.body.direction).to.equal('OUTFLOW');
      expect(response.body.status).to.equal('PENDING');

      const wireTx = await prisma.wireTransaction.findUnique({ where: { id: response.body.id } });
      expect(wireTx).to.not.be.null;
      expect(wireTx?.amount).to.equal(50000.00);
    });

    it('Should simulate incoming wire transfer and create INFLOW transaction via POST /api/banks/simulate-wire', async () => {
      await prisma.bankAccount.create({
        data: {
          id: 'bank_test_555',
          bankName: 'Wells Fargo',
          accountNumber: '*********5555',
          routingNumber: '021000021',
          status: 'ACTIVE'
        }
      });

      const response = await request(app)
        .post('/api/banks/simulate-wire')
        .send({
          bankAccountId: 'bank_test_555',
          amount: 15000.00,
          currency: 'USD'
        });

      expect(response.status).to.equal(200);
      expect(response.body.amount).to.equal(15000.00);
      expect(response.body.direction).to.equal('INFLOW');
      expect(response.body.status).to.equal('SUCCESS');

      const wireTx = await prisma.wireTransaction.findUnique({ where: { id: response.body.id } });
      expect(wireTx?.amount).to.equal(15000.00);
      expect(wireTx?.status).to.equal('SUCCESS');
    });

    it('Should reconcile wire transaction status to SUCCESS on payouts.updated webhook', async () => {
      await prisma.bankAccount.create({
        data: {
          id: 'bank_test_777',
          bankName: 'Citi',
          accountNumber: '*********7777',
          routingNumber: '021000021',
          status: 'ACTIVE'
        }
      });

      const wireId = 'payout_citi_123';
      await prisma.wireTransaction.create({
        data: {
          id: wireId,
          bankAccountId: 'bank_test_777',
          amount: 25000.00,
          currency: 'USD',
          direction: 'OUTFLOW',
          status: 'PENDING'
        }
      });

      const response = await request(app)
        .post('/webhooks')
        .set('X-Circle-Signature', 'mock-signature-for-testing')
        .set('X-Circle-Key-Id', 'mock-key-1')
        .send({
          id: 'evt_payout_success_123',
          type: 'payouts.updated',
          data: {
            payoutId: wireId,
            status: 'complete'
          }
        });

      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('PROCESSED');

      const updatedWire = await prisma.wireTransaction.findUnique({ where: { id: wireId } });
      expect(updatedWire?.status).to.equal('SUCCESS');
    });
  });
});
