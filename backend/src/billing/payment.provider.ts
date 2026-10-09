import crypto from 'crypto';
import Razorpay from 'razorpay';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

export interface PaymentRequest {
  amount: number;
  currency: string;
  customerId: string;
  subscriptionId: string;
  idempotencyKey?: string;
  paymentId?: string;
  invoiceNumber?: string;
}

export interface PaymentResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  providerRef: string;
  meta: Record<string, unknown>;
  failureReason?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
}

export interface PaymentProvider {
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  refund(transactionId: string, amount: number): Promise<{ success: boolean }>;
}

export class MockPaymentProvider implements PaymentProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const shouldSucceed = Math.random() > 0.05;

    if (shouldSucceed) {
      const transactionId = `TXN-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
      return {
        transactionId,
        status: 'SUCCESS',
        providerRef: `MOCK-${transactionId}`,
        meta: {
          provider: 'MOCK',
          processedAt: new Date().toISOString(),
          amount: request.amount,
          currency: request.currency,
        },
      };
    }

    return {
      transactionId: '',
      status: 'FAILED',
      providerRef: '',
      meta: { provider: 'MOCK' },
      failureReason: 'Insufficient funds (simulated)',
    };
  }

  async refund(_transactionId: string, _amount: number): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { success: true };
  }
}

export class RazorpayProvider implements PaymentProvider {
  private client: Razorpay;

  constructor() {
    this.client = new Razorpay({
      key_id: config.payment.razorpay.keyId,
      key_secret: config.payment.razorpay.keySecret,
    });
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const amountInPaise = Math.round(Number(request.amount) * 100);
    const receipt = request.paymentId || request.idempotencyKey || uuidv4();

    const order = await this.client.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: String(receipt),
      notes: {
        paymentId: request.paymentId || request.idempotencyKey || receipt,
        invoiceId: request.subscriptionId,
        customerId: request.customerId,
      },
    });

    return {
      transactionId: order.id,
      status: 'SUCCESS',
      providerRef: order.id,
      orderId: order.id,
      amount: amountInPaise,
      currency: 'INR',
      keyId: config.payment.razorpay.keyId,
      meta: {
        provider: 'RAZORPAY',
        orderId: order.id,
        receipt: order.receipt,
        amount: amountInPaise,
        currency: 'INR',
      },
    };
  }

  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, expectedPaymentId: string): boolean {
    const payload = `${orderId}|${expectedPaymentId}`;
    const expected = crypto
      .createHmac('sha256', config.payment.razorpay.keySecret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async fetchPayment(razorpayPaymentId: string): Promise<any> {
    return this.client.payments.fetch(razorpayPaymentId);
  }

  async fetchOrder(orderId: string): Promise<any> {
    return this.client.orders.fetch(orderId);
  }

  async refund(_transactionId: string, _amount: number): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export class UpiManualProvider implements PaymentProvider {
  buildUpiLink(paymentId: string, amount: number, invoiceNumber: string): string {
    const params = new URLSearchParams({
      pa: config.payment.upi.upiId,
      pn: config.payment.upi.payeeName,
      am: Number(amount).toFixed(2),
      cu: 'INR',
      tn: invoiceNumber,
      tr: paymentId,
    });

    return `upi://pay?${params.toString()}`;
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const invoiceNumber = request.invoiceNumber || `INV-${Date.now()}`;
    return {
      transactionId: uuidv4(),
      status: 'FAILED',
      providerRef: 'UPI_MANUAL',
      meta: {
        provider: 'UPI_MANUAL',
        upiLink: this.buildUpiLink(request.paymentId || request.idempotencyKey || request.subscriptionId, request.amount, invoiceNumber),
      },
    };
  }

  async refund(_transactionId: string, _amount: number): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const provider = (config.payment.provider || 'MOCK').toUpperCase();
  if (provider === 'RAZORPAY') return new RazorpayProvider();
  if (provider === 'UPI_MANUAL') return new UpiManualProvider();
  return new MockPaymentProvider();
}

export function buildUpiLink(paymentId: string, amount: number, invoiceNumber: string): string {
  return new UpiManualProvider().buildUpiLink(paymentId, amount, invoiceNumber);
}
