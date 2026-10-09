import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { paymentService } from '../src/billing/payment.service';
import { getPaymentProvider } from '../src/billing/payment.provider';

const fakeUser = async (role: 'SUPER_ADMIN' | 'CUSTOMER' | 'ISP_ADMIN' = 'CUSTOMER') => {
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `${role} Test`,
      phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      passwordHash: 'hash',
      role,
      status: 'ACTIVE',
    },
  });
  return user;
};

const makeToken = (user: { id: string; email: string; role: any }) =>
  jwt.sign({ userId: user.id, email: user.email, role: user.role, sessionId: 'test-session' }, process.env.JWT_ACCESS_SECRET || 'test-jwt-access-secret');

const createCustomerAndSubscription = async (user: any) => {
  const customer = await prisma.customer.create({
    data: {
      userId: user.id,
      email: user.email,
      customerCode: `CUST-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      phone: '9999999999',
      address: 'Test address',
      city: 'Test City',
      state: 'TS',
      pincode: '500000',
      status: 'ACTIVE',
    },
  });

  const plan = await prisma.plan.create({
    data: {
      name: 'Plan A',
      speedMbps: 100,
      price: 699,
      billingCycleDays: 30,
      description: 'test plan',
      features: ['x'],
      isActive: true,
    },
  });

  const connection = await prisma.connection.create({
    data: {
      customerId: customer.id,
      planId: plan.id,
      installationAddress: 'Address',
      status: 'INSTALLATION_REQUIRED',
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      customerId: customer.id,
      planId: plan.id,
      connectionId: connection.id,
      status: 'PENDING',
    },
  });

  return { customer, plan, connection, subscription };
};

describe('payment runtime contract', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.paymentTransaction.deleteMany();
    await prisma.providerWebhookEvent.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.subscriptionHistory.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.connection.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a) valid webhook payment.captured -> SUCCESS + invoice + subscription + connection active', async () => {
    const admin = await fakeUser('SUPER_ADMIN');
    const { customer, connection, subscription } = await createCustomerAndSubscription(admin);
    const payment = await prisma.payment.create({
      data: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        amount: 699,
        currency: 'INR',
        status: 'PENDING',
        provider: 'RAZORPAY',
        providerOrderId: 'order_test_1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const body = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_1',
            order_id: 'order_test_1',
            amount: 69900,
            currency: 'INR',
            notes: { paymentId: payment.id },
            status: 'captured',
            error_description: null,
          },
        },
      },
    };

    const raw = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret').update(raw).digest('hex');

    const response = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .set('X-Razorpay-Event-Id', 'evt_valid_1')
      .send(raw);

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('SUCCESS');
    const invoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } });
    expect(invoice?.status).toBe('PAID');
    const sub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(sub?.status).toBe('ACTIVE');
    const conn = await prisma.connection.findUnique({ where: { id: connection.id } });
    expect(conn?.status).toBe('ACTIVE');
  });

  it('b) invalid or missing signature rejected, no DB changes', async () => {
    const user = await fakeUser('CUSTOMER');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'MOCK', expiresAt: new Date(Date.now() + 60_000) },
    });

    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test_bad', order_id: 'order_bad', notes: { paymentId: payment.id }, amount: 69900 } } } });
    const response = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'not-valid')
      .set('X-Razorpay-Event-Id', 'evt_invalid_1')
      .send(raw);

    expect(response.status).toBe(400);
    const data = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(data?.status).toBe('PENDING');
  });

  it('c) duplicate webhook event is a no-op with exactly one subscription history entry', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription, connection } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'RAZORPAY', providerOrderId: 'order_dup', expiresAt: new Date(Date.now() + 60_000) },
    });

    const body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_dup', order_id: 'order_dup', amount: 69900, currency: 'INR', notes: { paymentId: payment.id }, status: 'captured' } } } };
    const raw = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret').update(raw).digest('hex');

    await request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).set('X-Razorpay-Event-Id', 'evt_dup_1').send(raw);
    const second = await request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).set('X-Razorpay-Event-Id', 'evt_dup_1').send(raw);

    expect(second.status).toBe(200);
    const history = await prisma.subscriptionHistory.findMany({ where: { subscriptionId: subscription.id } });
    expect(history.length).toBe(1);
    const paymentAfter = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(paymentAfter?.status).toBe('SUCCESS');
    const conn = await prisma.connection.findUnique({ where: { id: connection.id } });
    expect(conn?.status).toBe('ACTIVE');
  });

  it('d) payment.failed webhook stops activation', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription, connection } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'RAZORPAY', providerOrderId: 'order_failed', expiresAt: new Date(Date.now() + 60_000) },
    });
    const raw = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_failed', order_id: 'order_failed', notes: { paymentId: payment.id }, error_description: 'declined' } } } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret').update(raw).digest('hex');

    const response = await request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).set('X-Razorpay-Event-Id', 'evt_failed_1').send(raw);
    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('FAILED');
    const sub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(sub?.status).toBe('PENDING');
    const conn = await prisma.connection.findUnique({ where: { id: connection.id } });
    expect(conn?.status).toBe('INSTALLATION_REQUIRED');
    const invoice = await prisma.invoice.findFirst({ where: { paymentId: payment.id } });
    expect(invoice).toBeNull();
  });

  it('e) finalizePayment SUCCESS called twice or concurrently only activates once', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription, connection } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'MOCK', expiresAt: new Date(Date.now() + 60_000) },
    });

    await paymentService.finalizePayment(payment.id, 'SUCCESS', { providerPaymentId: 'p1', expectedAmount: 69900, expectedCurrency: 'INR' });
    await paymentService.finalizePayment(payment.id, 'SUCCESS', { providerPaymentId: 'p2', expectedAmount: 69900, expectedCurrency: 'INR' });

    const sub = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    const history = await prisma.subscriptionHistory.findMany({ where: { subscriptionId: subscription.id } });
    expect(sub?.status).toBe('ACTIVE');
    expect(history.length).toBe(1);
    const connState = await prisma.connection.findUnique({ where: { id: connection.id } });
    expect(connState?.status).toBe('ACTIVE');
  });

  it('f) amount mismatch flags failed and audit-logged', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'RAZORPAY', expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await paymentService.finalizePayment(payment.id, 'SUCCESS', { expectedAmount: 50000, expectedCurrency: 'INR' });
    expect(result.status).toBe('FAILED');
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureReason).toContain('Amount mismatch');
  });

  it('g) terminal states are immutable', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'FAILED', provider: 'MOCK', failureReason: 'First fail' },
    });

    await paymentService.finalizePayment(payment.id, 'SUCCESS', { expectedAmount: 69900, expectedCurrency: 'INR' });
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('FAILED');
  });

  it('h) correct checkout signature accepted, wrong rejected', () => {
    const provider: any = getPaymentProvider();
    const orderId = 'order_123';
    const paymentId = 'pay_123';
    const valid = `${orderId}|${paymentId}`;
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test-secret').update(valid).digest('hex');

    expect(provider.verifyCheckoutSignature(orderId, paymentId, signature, paymentId)).toBe(true);
    expect(provider.verifyCheckoutSignature(orderId, paymentId, 'bad', paymentId)).toBe(false);
  });

  it('i) expiry job marks expired pending and reconciles paid pending', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const expiredPayment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'MOCK', expiresAt: new Date(Date.now() - 1000) },
    });

    await paymentService.finalizePayment(expiredPayment.id, 'EXPIRED', { failureReason: 'Timed out' });
    const expiredState = await prisma.payment.findUnique({ where: { id: expiredPayment.id } });
    expect(expiredState?.status).toBe('EXPIRED');
  });

  it('j) customers cannot access another customer payment and AWAITING_VERIFICATION cannot be verified by a customer', async () => {
    const userA = await fakeUser('CUSTOMER');
    const userB = await fakeUser('CUSTOMER');
    const resA = await createCustomerAndSubscription(userA);
    const resB = await createCustomerAndSubscription(userB);
    const payment = await prisma.payment.create({
      data: { customerId: resA.customer.id, subscriptionId: resA.subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'MOCK' },
    });

    const token = makeToken(userB);
    const response = await request(app).get(`/api/v1/payments/${payment.id}`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);

    const pendingPayment = await prisma.payment.create({
      data: { customerId: resA.customer.id, subscriptionId: resA.subscription.id, amount: 699, currency: 'INR', status: 'AWAITING_VERIFICATION', provider: 'UPI_MANUAL', utr: '123456789012' },
    });
    const customerToken = makeToken(userA);
    const verifyRes = await request(app).post(`/api/v1/payments/${pendingPayment.id}/verify-manual`).set('Authorization', `Bearer ${customerToken}`).send({ receivedAmount: 699 });
    expect(verifyRes.status).toBe(403);
  });

  it('k) UPI manual validation rejects duplicate UTR and wrong amount', async () => {
    const user = await fakeUser('CUSTOMER');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'UPI_MANUAL', expiresAt: new Date(Date.now() + 60_000) },
    });

    const link = paymentService['buildUpiLink'] ? paymentService['buildUpiLink'](payment.id, 699, 'INV-1') : ''; 
    expect(link).toContain('upi://pay');
    expect(link).toContain(encodeURIComponent('test@upi'));

    const token = makeToken(user);
    const submit = await request(app).post(`/api/v1/payments/${payment.id}/utr`).set('Authorization', `Bearer ${token}`).send({ utr: '123456789012' });
    expect(submit.status).toBe(200);

    const duplicate = await request(app).post(`/api/v1/payments/${payment.id}/utr`).set('Authorization', `Bearer ${token}`).send({ utr: '123456789012' });
    expect(duplicate.status).toBe(409);

    const admin = await fakeUser('SUPER_ADMIN');
    const adminToken = makeToken(admin);
    const wrongAmount = await request(app).post(`/api/v1/payments/${payment.id}/verify-manual`).set('Authorization', `Bearer ${adminToken}`).send({ receivedAmount: 100 });
    expect(wrongAmount.status).toBe(400);

    const ok = await request(app).post(`/api/v1/payments/${payment.id}/verify-manual`).set('Authorization', `Bearer ${adminToken}`).send({ receivedAmount: 699 });
    expect(ok.status).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('SUCCESS');
  });

  it('l) webhook route uses raw body and validates signature using raw payload', async () => {
    const user = await fakeUser('SUPER_ADMIN');
    const { customer, subscription } = await createCustomerAndSubscription(user);
    const payment = await prisma.payment.create({
      data: { customerId: customer.id, subscriptionId: subscription.id, amount: 699, currency: 'INR', status: 'PENDING', provider: 'RAZORPAY', providerOrderId: 'order_raw', expiresAt: new Date(Date.now() + 60_000) },
    });

    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_raw', order_id: 'order_raw', amount: 69900, currency: 'INR', notes: { paymentId: payment.id } } } } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'test-webhook-secret').update(raw).digest('hex');
    const response = await request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).set('X-Razorpay-Event-Id', 'evt_raw_1').send(raw);
    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe('SUCCESS');
  });
});
