# 🏢 Alora - Apartment Management Backend

> Scalable NestJS backend for property management with 40+ endpoints and real-time features

## 🛠️ Tech Stack

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-626CD9?style=for-the-badge&logo=stripe&logoColor=white)

## 🔧 Backend Highlights

✅ **API Design**
- RESTful architecture with DTO validation (class-validator)
- 40+ endpoints across 8 core modules (Auth, Users, Apartments, Units, Billing, Rentals, Maintenance, Wallet)
- Swagger/OpenAPI documentation for all routes

✅ **Database & ORM**
- MongoDB with Mongoose schemas for complex nested documents
- Prisma-like query patterns for aggregation pipelines (revenue reports, occupancy rates)
- Transaction support for atomic operations (payment + subscription update)

✅ **Payment & Webhooks**
- Stripe Checkout Sessions for subscription creation
- Idempotent webhook handlers prevent race conditions during retries
- Secure signature verification (`stripe.webhooks.constructEvent()`)
- Failed payment alerts via BullMQ job queues

✅ **Security**
- JWT authentication with refresh token rotation
- Role-Based Access Control (RBAC) with 5+ custom guards
- Password hashing (bcrypt), email verification, and rate limiting
- File upload security with signed URLs (Multer + S3/Middleware)

✅ **Performance**
- Redis caching for frequently accessed data (apartment listings, user profiles)
- Nginx reverse proxy configuration for production deployment
- Environment-based config management (@nestjs/config)

## 📂 Core Modules

| Module | Purpose | Key Endpoints |
| :--- | :--- | :--- |
| **Auth** | JWT, refresh tokens, OAuth | `POST /auth/register`, `/login`, `/refresh` |
| **Apartments** | CRUD, owner assignment, facilities | `GET /apartments`, `POST /apartments/:id/units` |
| **Billing** | Standard/Custom/Personalized bills | `POST /bills/generate`, `/pay`, `/invoices` |
| **Rentals** | Application workflow, lease terms | `POST /applications`, `/approve`, `/occupy` |
| **Maintenance** | Ticket creation, crew dispatch | `POST /tickets`, `/assign`, `/resolve` |
| **Wallet** | Balance tracking, transaction history | `GET /wallet/balance`, `POST /topup` |

## 🎯 Interview Talking Points

> When asked about challenges faced in this project:

1. *"I handled Stripe webhook race conditions by implementing idempotency keys on transaction records."*
2. *"Designed composite indexes on MongoDB collections to optimize apartment filtering by location/status."*
3. *"Built modular services so Billing can scale independently if we add more payment gateways later."*
4. *"Implemented document access policies so renters cannot view other tenants' leases or IDs."*
5. *"Created notification service using BullMQ for async email/SMS alerts after payment confirmation."*

🔗 **[View Documentation](link)** | 🔗 **[Live API Status](link)**