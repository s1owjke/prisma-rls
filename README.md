# Prisma RLS

> 🚧 It's an experimental package, under development

The classical approach to implementing Row-Level Security (RLS) involves using a database with built-in support and writing row-level security policies for tables.

This library offers an alternative approach - an extension to the Prisma client that adds additional "where" clauses to all model queries. This approach doesn't require RLS support on the database side (for example, in MySQL).

It's important to keep in mind that this extension doesn't cover raw queries. In such cases, you should take care of it yourself.

## How to use it

Extend the Prisma client with the rls extension

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import { createRlsExtension } from "prisma-extension-rls";

import { permissions } from "./permissions";

const db = new PrismaClient().$extends(createRlsExtension(Prisma.dmmf, permissions, null));
```

Since Prisma doesn't support contexts to pass data to the [extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions), you will typically extend the Prisma client per request (based on current auth toke role)

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import Fastify, { FastifyRequest } from "fastify";
import { createRlsExtension } from "prisma-extension-rls";

import { permissions } from "./permissions";

(async () => {
  const prisma = new PrismaClient();
  const server = Fastify();

  const resolveConext = (request: FastifyRequest) => {
    const role = resolveRole(request.headers.authorization);
    const rolePermissions = permissions[role];

    return { db: prisma.$extends(createRlsExtension(Prisma.dmmf, rolePermissions, { role })) };
  }
  
  server.get('/post/count', async function handler(request, reply) {
    const { db } = resolveContext(request);
    return await db.post.count();
  })

  await server.listen({ port: 8080, host: "0.0.0.0" });
})();
```
