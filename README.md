# Pharmaceutical Supply Chain Serialized Traceability Engine

DBMS Experiential Learning, Level 3 Project (PES University).

Every medicine pack gets a unique serial number. Each move (manufacturer, distributor, pharmacy, patient) is recorded, so a pack can be verified, traced, and recalled.

## Team

| Name | SRN |
|---|---|
| Priyanka | PES2UG24CS377 |
| Sahana MS | PES2UG24CS426 |

## Tech stack

- **Frontend and API:** Next.js 14 (App Router, Route Handlers)
- **SQL database:** PostgreSQL (drugs, batches, serial units, shipments, custody, recalls, users)
- **NoSQL database:** MongoDB (scan events and sensor logs)
- **Auth:** bcrypt password hashing, JWT in an httpOnly cookie, role checks in every API route
- **Version control:** Git and GitHub

## Why these databases

- **PostgreSQL** holds the data where integrity matters: ownership of every pack, shipments, and recalls need ACID transactions, foreign keys, and constraints.
- **MongoDB** holds scan events and sensor readings: append-heavy, flexible in shape, and queried with aggregation pipelines.

## Roles

| Role | Can do |
|---|---|
| ADMIN | Issue recalls, view all stock, view the audit log |
| MANUFACTURER | Create batches, generate serial numbers, ship |
| DISTRIBUTOR | Receive shipments, ship onward |
| PHARMACY | Receive shipments, dispense packs |

The public can verify any serial number without logging in.

## Setup

1. Install **Node.js** (LTS), **PostgreSQL**, **MongoDB** and **Git**.
2. Clone the repository:
   ```
   git clone https://github.com/Priyanka0205-CSE/pharma-traceability-engine.git
   cd pharma-traceability-engine
   ```
3. Create the database in pgAdmin (or `createdb pharma_trace`) named `pharma_trace`.
4. Load the schema by running the contents of `schema.sql` in the pgAdmin Query Tool, or:
   ```
   psql -d pharma_trace -f schema.sql
   ```
5. Copy `.env.example` to `.env.local` and fill in your own values. If your PostgreSQL password contains special characters such as `@`, URL-encode them (for example `@` becomes `%40`).
6. Install packages:
   ```
   npm install
   ```
7. Create the demo logins:
   ```
   npm run seed:users
   ```
8. Start the app:
   ```
   npm run dev
   ```
9. Open http://localhost:3000/login

## Demo logins

All demo users have the password `Pass@123` (local testing only).

| Email | Role |
|---|---|
| admin@pharma.test | ADMIN |
| mfg@pharma.test | MANUFACTURER |
| dist@pharma.test | DISTRIBUTOR |
| pharm@pharma.test | PHARMACY |

## Database features

- **Transactions:** `create_shipment()` and `receive_shipment()` run all-or-nothing.
- **Triggers:** block shipping of expired or recalled packs, cascade a recall to every unit in a batch, validate dispensing, and write an audit log.
- **Stored functions:** `generate_serials`, `create_shipment`, `receive_shipment`, `initiate_recall`, `verify_serial`.
- **Views:** `v_expiring_stock`, `v_chain_of_custody`, `v_recall_impact`, `v_stock_by_org`.
- **Indexes:** on serial, batch, owner, expiry dates, and a GIN index for full-text search on drugs.
- **Constraints:** CHECK, UNIQUE, NOT NULL and foreign keys validate data at the database level.

## Project structure

```
app/            Next.js pages and API route handlers
lib/            database, MongoDB and auth helpers
scripts/        seed-users.js
schema.sql      PostgreSQL tables, triggers, functions, views, seed data
.env.example    template for environment variables
```

## Security

Database credentials and the JWT secret are read from environment variables in `.env.local`, which is listed in `.gitignore` and never committed.
