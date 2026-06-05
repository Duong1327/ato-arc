import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { handleWebhook } from './webhookHandler';
import { BankIntegrator } from '../../scripts/bankIntegrator';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

// Simple Memory Rate Limiter Middleware for Webhooks
const rateLimits: Record<string, { count: number; resetTime: number }> = {};
function webhookRateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();

    if (!rateLimits[ip] || now > rateLimits[ip].resetTime) {
      rateLimits[ip] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }

    rateLimits[ip].count++;
    if (rateLimits[ip].count > limit) {
      console.warn(`[Rate Limit Exceeded] IP: ${ip} count: ${rateLimits[ip].count}`);
      return res.status(429).json({
        error: 'Too many webhook delivery requests. Rate limit exceeded.'
      });
    }

    next();
  };
}

// Middlewares
app.use(cors());

// Capture raw body buffer for Circle webhook signature validation
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(bodyParser.urlencoded({ extended: true }));

// 1. Webhook endpoint with rate limiting (max 100 requests per 1 minute)
app.post('/webhooks', webhookRateLimiter(100, 60000), handleWebhook);

// Bank transfers & Circle Mint API integrations
app.get('/api/banks', async (req: Request, res: Response) => {
  try {
    const banks = await BankIntegrator.getLinkedBankAccounts();
    res.json(banks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/banks/wires', async (req: Request, res: Response) => {
  try {
    const wires = await prisma.wireTransaction.findMany({
      include: { bankAccount: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(wires);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/banks', async (req: Request, res: Response) => {
  const { bankName, accountNumber, routingNumber } = req.body;
  if (!bankName || !accountNumber || !routingNumber) {
    return res.status(400).json({ error: 'Missing required bank connection details' });
  }
  try {
    const bank = await BankIntegrator.linkBankAccount({ bankName, accountNumber, routingNumber });
    res.json(bank);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/banks/payout', async (req: Request, res: Response) => {
  const { bankAccountId, amount, currency } = req.body;
  if (!bankAccountId || !amount) {
    return res.status(400).json({ error: 'Missing bankAccountId or amount' });
  }
  try {
    const payout = await BankIntegrator.initiateBankPayout(bankAccountId, parseFloat(amount), currency || 'USD');
    res.json(payout);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/banks/simulate-wire', async (req: Request, res: Response) => {
  const { bankAccountId, amount, currency } = req.body;
  if (!bankAccountId || !amount) {
    return res.status(400).json({ error: 'Missing bankAccountId or amount for simulation' });
  }
  try {
    const wire = await BankIntegrator.simulateIncomingWire(bankAccountId, parseFloat(amount), currency || 'USD');
    res.json(wire);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Fetch all invoices from database
app.get('/api/invoices', async (req: Request, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { transactions: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Create or Seed a new invoice in DB
app.post('/api/invoices', async (req: Request, res: Response) => {
  const { id, amount, token, recipient, type, milestoneId, status } = req.body;
  if (!id || !amount || !token || !recipient || !type) {
    return res.status(400).json({ error: 'Missing required invoice fields' });
  }

  try {
    const invoice = await prisma.invoice.upsert({
      where: { id },
      update: {
        amount: parseFloat(amount),
        token,
        recipient,
        type,
        milestoneId: milestoneId ? parseInt(milestoneId) : null,
        status: status || 'PENDING'
      },
      create: {
        id,
        amount: parseFloat(amount),
        token,
        recipient,
        type,
        milestoneId: milestoneId ? parseInt(milestoneId) : null,
        status: status || 'PENDING'
      }
    });
    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Create/Register a pending transaction for an invoice (called by off-chain agents when submitting payments)
app.post('/api/transactions', async (req: Request, res: Response) => {
  const { id, invoiceId, walletId, amount, status, blockchainTxHash } = req.body;
  if (!id || !invoiceId || !walletId || amount === undefined) {
    return res.status(400).json({ error: 'Missing transaction details' });
  }

  try {
    // Verify invoice exists
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      return res.status(404).json({ error: `Invoice ${invoiceId} not found` });
    }

    const transaction = await prisma.transaction.upsert({
      where: { id },
      update: {
        status: status || 'PENDING',
        blockchainTxHash
      },
      create: {
        id,
        invoiceId,
        walletId,
        amount: parseFloat(amount),
        status: status || 'PENDING',
        blockchainTxHash
      }
    });

    res.json(transaction);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Fetch all transactions
app.get('/api/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Fetch database synchronization metrics
app.get('/api/metrics', async (req: Request, res: Response) => {
  try {
    const totalLogs = await prisma.webhookLog.count();
    const processed = await prisma.webhookLog.count({ where: { status: 'PROCESSED' } });
    const duplicates = await prisma.webhookLog.count({ where: { status: 'DUPLICATE' } });
    const ignored = await prisma.webhookLog.count({ where: { status: 'IGNORED' } });
    const failed = await prisma.webhookLog.count({ where: { status: 'FAILED' } });

    const recentLogs = await prisma.webhookLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      metrics: {
        totalLogs,
        processed,
        duplicates,
        ignored,
        failed,
        health: failed === 0 ? 'HEALTHY' : failed / totalLogs > 0.1 ? 'CRITICAL' : 'WARNING'
      },
      recentLogs
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Developer webhook simulator (for local integration testing)
app.post('/api/simulate-webhook', async (req: Request, res: Response) => {
  const { eventId, eventType, transactionId, status, blockchainTxHash } = req.body;

  if (!eventId || !eventType || !transactionId) {
    return res.status(400).json({ error: 'Simulation requires eventId, eventType, and transactionId' });
  }

  // Construct a standard Circle webhook notification structure
  const simulatedPayload = {
    id: eventId,
    type: eventType,
    data: {
      id: transactionId,
      status: status || 'complete',
      blockchainTxHash: blockchainTxHash || '0x' + crypto.randomBytes(32).toString('hex')
    }
  };

  try {
    // Send request locally to /webhooks
    const axios = require('axios');
    const response = await axios.post(`http://localhost:${PORT}/webhooks`, simulatedPayload, {
      headers: {
        'X-Circle-Signature': 'mock-signature-for-testing',
        'X-Circle-Key-Id': 'mock-key-id-for-testing'
      }
    });

    res.json({
      simulatedPayload,
      backendResponse: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Start server if not running tests
let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(`   ATO Real-Time Webhook Engine listening on port ${PORT}`);
    console.log(`========================================================`);
  });
}

export { app, server };
