# SubscriptX

A beginner-friendly subscription management starter built with Next.js, TypeScript, PostgreSQL, and Prisma. Subscription payments use a server-controlled demo simulation; no real money or payment details are collected.

## 1. Install and configure

You need Node.js 20 or newer, npm, and a running PostgreSQL database.

In PowerShell, from this project folder:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` with your local PostgreSQL connection and private credentials. Generate separate session and cron secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that command twice. Keep `.env.local` private; it is ignored by Git. `.env.example` contains placeholders only.

Email is optional during local development. To send purchase invoices, set the SMTP host, port, username, password, and sender address. When SMTP is not configured, a successful simulated payment still activates the plan and the dashboard shows the invoice number; the API reports that the email was not sent.

## 2. Set up the database and run

```powershell
npm install
npm run db:deploy
npm run dev
```

This project includes checked-in Prisma migrations. `npm run db:deploy` applies those migrations to the configured database; do not create another initial migration for a new installation.

Open [http://localhost:3000](http://localhost:3000). Create an account with a password of at least 12 characters. Paid plans open a Demo Payment Mode checkout with success and failure simulations.

The example plan prices are in `src/lib/plans.ts`; amounts are integer paise, the UI reads this same catalog, and prices are never accepted from the browser.

## 3. Main project areas

- `src/app/` contains the dashboard and server API routes.
- `src/lib/auth.ts` manages random, database-backed sessions in an HTTP-only cookie.
- `src/lib/payment-completion.ts` validates demo orders and atomically stores demo transactions, subscription dates, and invoices.
- `src/lib/subscription.ts` checks expiry and keeps the Free plan available without deleting account data.
- `prisma/schema.prisma` defines users, sessions, current subscriptions, orders, payment attempts, and invoices.
- `.env.example` documents local configuration without containing real secrets.

## Payment and subscription behavior

- Every simulated transaction is labeled `DEMO — NO REAL MONEY CHARGED`. Demo checkout does not request or store card, CVV, bank, or other payment details.
- The browser submits only the local order ID and chosen simulation outcome. The authenticated server checks order ownership and status, recalculates the expected plan price from the server catalog, then atomically records the demo payment and subscription update.
- A failed simulation records a `DEMO` failed transaction and cannot activate a plan. Repeating a completed simulation does not extend a subscription twice. Closing checkout leaves the order pending until it is resumed or explicitly canceled.
- Renewing the same plan extends from its current expiry date. Changing plans starts the chosen plan after successful payment and uses the demo catalog price; this starter does not prorate or auto-charge.
- Cancellation marks the subscription to end and preserves paid access through its expiry date. This starter does not automatically charge a saved payment method.
- Protected premium API routes check access on the server. Use the same helper for each premium data route; hiding a button in the UI is not access control.
- A daily scheduler should send a `POST` request to `/api/cron/expire` with the configured bearer authorization. Dashboard and premium API requests also check and downgrade an expired subscription, so a delayed scheduled task does not preserve expired access. User accounts, orders, invoices, and watch history are not removed.

## Testing subscription expiry

Expiry integration tests use a separate, disposable PostgreSQL database. Create an empty database named with a `test` segment, such as `subscriptx_test`, and set its connection URL in the current PowerShell session:

```powershell
createdb subscriptx_test
$env:SUBSCRIPTX_TEST_DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/subscriptx_test?schema=public"
npm run test:expiry
```

The test runner checks that the test database target differs from `DATABASE_URL` in the process environment, `.env.local`, and `.env`. It applies checked-in migrations with `prisma migrate deploy` and refuses to run if the database already contains users. It never resets or drops a database. Tests use fixed timestamps and clean up only their uniquely created fixture users. Keep the test database URL out of source control and do not point it at a database containing development or production data.

## Beginner-friendly implementation map

1. **Database:** review `prisma/schema.prisma`, then apply the checked-in Prisma migrations.
2. **Accounts and dashboard:** sign up, sign in, and inspect the subscription and billing summary.
3. **Demo checkout:** create a local order using server-side plan prices, then simulate success or failure without entering payment details.
4. **Lifecycle and access:** cancel, renew/change plans, protect premium APIs, and run the expiry job.
5. **Invoices:** configure SMTP to send a purchase confirmation with invoice and subscription dates.

Demo Payment Mode is for development and demonstration only. It does not process real payments and must not be used to grant production access as proof of payment. Before any production launch, replace the simulation with a payment provider and its server-side verification, and configure HTTPS, SMTP, database backups, production-grade rate limiting and monitoring, and a reliable scheduler.
