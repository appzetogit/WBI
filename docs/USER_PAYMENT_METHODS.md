# User Payment Methods (Razorpay Vault)

Production payment method management for WBI consumer users. Saved instruments use **Razorpay Customer + Checkout verification** (₹1 authorize/capture + auto-refund). WBI never stores PAN/CVV.

## Architecture

```
Manage Payment Methods / Checkout
  → /api/user/payment-methods/*
  → userPaymentMethod.service
  → razorpayService (customers, orders, tokens, refunds, webhooks)
  → UserPaymentMethod + PaymentMethodConfig + PaymentAuditLog
```

## Env

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=          # required for /api/webhooks/razorpay/payments
PAYMENT_TOKEN_ENCRYPTION_KEY=     # optional AES key (64-hex or passphrase)
PAYMENT_SENSITIVE_OTP=true        # set false only for local OTP bypass on delete/default
VITE_RAZORPAY_KEY_ID=             # FE fallback; prefer key from API responses
```

## Webhook (Dashboard)

Register URL:

`POST https://<api-host>/api/webhooks/razorpay/payments`

Events: `payment.captured`, `payment.failed`, `refund.processed`

Uses **raw body** HMAC (`x-razorpay-signature`). Idempotent via `RazorpayWebhookEvent.eventId`.

## User APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/user/payment-methods/config` | Enabled methods + public key |
| GET | `/api/user/payment-methods` | Saved list + config |
| POST | `/api/user/payment-methods/instruments/start` | `{ methodType }` → Checkout payload |
| POST | `/api/user/payment-methods/instruments/confirm` | Verify + persist + refund ₹1 |
| POST | `/api/user/payment-methods/upi/verify` | Save VPA (format check) |
| POST | `/api/user/payment-methods/cod-preference` | `{ enabled }` |
| POST | `/api/user/payment-methods/sensitive/otp` | OTP for delete/default |
| PATCH | `/api/user/payment-methods/:id/default` | `{ otp }` |
| DELETE | `/api/user/payment-methods/:id` | `{ otp }` |
| GET | `/api/user/payment-methods/history` | Booking payments |
| GET | `/api/user/payment-methods/history/:id/receipt` | JSON or `?format=html` |
| POST | `/api/user/payment-methods/history/:id/retry` | New order for failed pay |

## Admin APIs

| Method | Path |
|--------|------|
| GET/PUT | `/api/admin/payment-config` |
| GET | `/api/admin/payment-config/audit-logs` |
| GET | `/api/admin/payment-config/settlements` |

UI: **Admin → Payments → Config**

## Checkout

- Loads saved methods + COD availability from config
- `POST /api/payments/create-order` accepts optional `paymentMethodId` and attaches Razorpay `customer_id`
- Public key returned in order response (`data.key`)

## Verification checklist

1. Restart backend; confirm Razorpay init log
2. User → Manage payment methods → Add card → complete Checkout → method appears; ₹1 refunded
3. Set default / delete requires OTP (unless `PAYMENT_SENSITIVE_OTP=false`)
4. Checkout shows saved methods; online pay succeeds
5. Admin Payments → Config: disable UPI → user UI hides Add UPI
6. Point Razorpay webhook to `/api/webhooks/razorpay/payments` and capture a test payment
7. History → Receipt opens printable HTML; Retry opens Checkout for failed booking

## Out of scope

- Stripe / Cashfree adapters
- ML fraud scoring
- Storing raw card data on WBI servers
