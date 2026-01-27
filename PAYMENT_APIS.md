## Payment API Documentation

This document describes all **payment-related endpoints** exposed by the backend for the Paystack integration.

- **Base URL (local)**: `http://localhost:5000`
- **Mount path (assumed)**: `"/api/payments"`  
  If the router is mounted with a different prefix in `server.js`, adjust the paths below accordingly.

Most endpoints (except `/public-key` and usually `/webhook`) require a valid **Supabase JWT** in the `Authorization` header:

```text
Authorization: Bearer YOUR_SUPABASE_JWT
```

---

## 1. Get Paystack Public Key

- **Endpoint**: `GET /api/payments/public-key`
- **Auth**: Not required
- **Purpose**: Allows the frontend to retrieve the **Paystack public key** for inline/pay button usage.

### Request

- **Headers**: None required
- **Body**: _none_

### Response (200)

```json
{
  "publicKey": "pk_test_xxx"
}
```

### Example `curl`

```bash
curl -X GET http://localhost:5000/api/payments/public-key
```

---

## 2. Charge with Authorization (Inline Flow)

- **Endpoint**: `POST /api/payments/charge`
- **Auth**: Required (`Authorization: Bearer <Supabase JWT>`)
- **Purpose**: Charge a customer using a Paystack **authorization code** obtained from the frontend (Paystack Inline).

### Request

- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer YOUR_SUPABASE_JWT`

- **Body** (JSON):

```json
{
  "email": "customer@example.com",
  "amount": 5000,
  "authorization_code": "AUTH_CODE_FROM_PAYSTACK_INLINE",
  "orderId": "ORDER_UUID_OPTIONAL",
  "metadata": {
    "note": "optional extra metadata"
  }
}
```

- **Field notes**:
  - **`email`** (string, required): Customer email.
  - **`amount`** (number, required): Amount in **Naira** (backend converts to kobo).
  - **`authorization_code`** (string, required): Code returned from Paystack Inline on the frontend.
  - **`orderId`** (string, optional): If provided, the corresponding order’s payment status is updated.
  - **`metadata`** (object, optional): Any extra information; `user_id` and `order_id` will be auto-populated on the server.

### Success Response (200)

```json
{
  "success": true,
  "status": "success",
  "reference": "MKG-...",
  "amount": 5000,
  "currency": "NGN",
  "paid_at": "2024-01-01T00:00:00.000Z",
  "message": "Approved",
  "transaction": {
    "...": "full Paystack transaction object"
  }
}
```

### Example `curl`

```bash
curl -X POST http://localhost:5000/api/payments/charge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{
    "email": "customer@example.com",
    "amount": 5000,
    "authorization_code": "AUTH_CODE_FROM_PAYSTACK_INLINE",
    "orderId": "ORDER_UUID_OPTIONAL",
    "metadata": {
      "note": "any extra data"
    }
  }'
```

---

## 3. Initialize Paystack Payment (Redirect Flow)

- **Endpoint**: `POST /api/payments/initialize`
- **Auth**: Required
- **Purpose**: Initialize a Paystack transaction and receive an **authorization URL** to redirect the user to Paystack’s hosted payment page.

### Request

- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer YOUR_SUPABASE_JWT`

- **Body** (JSON):

```json
{
  "email": "customer@example.com",
  "amount": 5000,
  "orderId": "ORDER_UUID_OPTIONAL",
  "metadata": {
    "note": "optional extra metadata"
  }
}
```

### Success Response (200)

```json
{
  "success": true,
  "authorization_url": "https://checkout.paystack.com/...",
  "access_code": "ACCESS_CODE",
  "reference": "MKG-..."
}
```

> The backend uses `FRONTEND_URL` (or `http://localhost:5173`) to build the `callback_url` for Paystack.

### Example `curl`

```bash
curl -X POST http://localhost:5000/api/payments/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{
    "email": "customer@example.com",
    "amount": 5000,
    "orderId": "ORDER_UUID_OPTIONAL",
    "metadata": {
      "note": "any extra data"
    }
  }'
```

---

## 4. Verify Payment

- **Endpoint**: `GET /api/payments/verify/:reference`
- **Auth**: Required
- **Purpose**: Verify a Paystack transaction after the user returns from the hosted page or Paystack callback.

### Request

- **Headers**:
  - `Authorization: Bearer YOUR_SUPABASE_JWT`

- **Path params**:
  - `reference`: The transaction reference sent by Paystack.

### Success Response (200)

```json
{
  "success": true,
  "status": "success",
  "reference": "MKG-...",
  "amount": 5000,
  "currency": "NGN",
  "paid_at": "2024-01-01T00:00:00.000Z",
  "metadata": {
    "user_id": "UUID",
    "order_id": "ORDER_UUID"
  },
  "customer": {
    "...": "Paystack customer data"
  },
  "authorization": {
    "...": "Paystack authorization data"
  }
}
```

> If the transaction’s `metadata.user_id` does not match the authenticated user, the backend returns **403 Unauthorized**.

### Example `curl`

```bash
curl -X GET http://localhost:5000/api/payments/verify/MKG-REFERENCE-HERE \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"
```

---

## 5. Paystack Webhook

- **Endpoint**: `POST /api/payments/webhook`
- **Auth**: Handled via Paystack signature, not JWT
- **Purpose**: Receives asynchronous events from Paystack (e.g. `charge.success`, `charge.failed`) and updates order status accordingly.

### Important Notes for Frontend

- This endpoint is meant for **Paystack servers**, not browsers.
- It expects the **raw request body** to compute the HMAC signature; do not send JSON through typical body parsers before verification.
- The backend verifies:
  - Header: `x-paystack-signature`
  - Signature: HMAC SHA512 of the raw body using `PAYSTACK_SECRET_KEY`.

### Example (for manual testing only)

```bash
curl -X POST http://localhost:5000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: YOUR_TEST_SIGNATURE" \
  --data-binary '{
    "event": "charge.success",
    "data": {
      "metadata": {
        "order_id": "ORDER_UUID"
      }
      /* other Paystack fields */
    }
  }'
```

> On `charge.success`, the backend sets:
> - `payment_status = 'paid'`
> - `payment_method = 'paystack'`
> - `status = 'confirmed'` (on the order)

---

## 6. Create Order with Optional Payment Initialization

- **Endpoint**: `POST /api/payments/create-order`
- **Auth**: Required
- **Purpose**: Create an **order record** and, if payment method is Paystack (card/bank transfer), **initialize payment** in one step.

### Request

- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer YOUR_SUPABASE_JWT`

- **Body** (JSON):

```json
{
  "items": [
    {
      "product_id": "PRODUCT_UUID",
      "quantity": 2,
      "price": 2500
    }
  ],
  "shipping_address": {
    "full_name": "John Doe",
    "street": "123 Street",
    "city": "Lagos",
    "state": "Lagos",
    "country": "Nigeria",
    "phone": "+2348012345678"
  },
  "billing_address": {
    "full_name": "John Doe",
    "street": "123 Street",
    "city": "Lagos",
    "state": "Lagos",
    "country": "Nigeria",
    "phone": "+2348012345678"
  },
  "subtotal": 5000,
  "shipping_amount": 500,
  "tax_amount": 0,
  "discount_amount": 0,
  "total_amount": 5500,
  "payment_method": "paystack",
  "email": "customer@example.com",
  "notes": "Leave at the gate"
}
```

#### Field behavior

- **`items`** (array, required): List of cart items. The backend stores this as-is (`items` field on the order).
- **`shipping_address`** (required): Can be a string or an object; stored on the order as given.
- **`billing_address`** (optional): If omitted, backend uses `shipping_address`.
- **`total_amount`** (required): Used as main amount; also drives Paystack initialization when applicable.
- **`payment_method`**:
  - If `paystack`, `credit_card`, or `bank_transfer`:
    - The backend initializes a Paystack payment and returns `authorization_url`, `access_code`, and `reference`.
  - Any other (e.g. `cash_on_delivery`):
    - No Paystack call; order is created with `payment_status: 'pending'`.

### Responses

#### A. Order created and Paystack payment initialized (201)

```json
{
  "order": {
    "...": "order data from Supabase"
  },
  "payment": {
    "initialized": true,
    "authorization_url": "https://checkout.paystack.com/...",
    "access_code": "ACCESS_CODE",
    "reference": "MKG-..."
  },
  "message": "Order created and payment initialized successfully"
}
```

#### B. Order created but payment initialization failed (201)

```json
{
  "order": { "...": "order data" },
  "payment": {
    "initialized": false,
    "error": "Error message from Paystack or backend"
  },
  "message": "Order created but payment initialization failed. Please try again."
}
```

#### C. Order created with cash on delivery (201)

```json
{
  "order": { "...": "order data" },
  "payment": {
    "initialized": false,
    "method": "cash_on_delivery"
  },
  "message": "Order created successfully"
}
```

### Example `curl`

```bash
curl -X POST http://localhost:5000/api/payments/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT" \
  -d '{
    "items": [
      {
        "product_id": "PRODUCT_UUID",
        "quantity": 2,
        "price": 2500
      }
    ],
    "shipping_address": {
      "full_name": "John Doe",
      "street": "123 Street",
      "city": "Lagos",
      "state": "Lagos",
      "country": "Nigeria",
      "phone": "+2348012345678"
    },
    "billing_address": null,
    "subtotal": 5000,
    "shipping_amount": 500,
    "tax_amount": 0,
    "discount_amount": 0,
    "total_amount": 5500,
    "payment_method": "paystack",
    "email": "customer@example.com",
    "notes": "Leave at the gate"
  }'
```

---

## Summary for Frontend

- Use **`/public-key`** to fetch the Paystack public key.
- For **inline card payments with saved authorization codes**, use **`POST /charge`**.
- For **redirect/hosted page payments**, use **`POST /initialize`** and then **`GET /verify/:reference`** after user returns.
- Prefer **`POST /create-order`** for creating the order and (optionally) initializing payment in a single call.
- Webhooks are configured server-side and should not be called from the frontend in production.

