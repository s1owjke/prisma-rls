# Prisma RLS

[![Published on npm](https://img.shields.io/npm/v/prisma-rls?color=brightgreen)](https://www.npmjs.com/package/prisma-rls) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 🚧 The package is currently under active development, so it's not recommended for production

Row-Level Security (RLS) traditionally requires databases with native support and custom security policies for each table.

This library provides an alternative: a Prisma client extension that automatically adds "where" clauses to all model queries. This method works without database-side RLS support (e.g., in MySQL).

Note that this extension doesn't apply to raw queries. For those, you must handle them manually or choose database with built-in support.

## Quick start

Specify permissions for each model in your schema.

```typescript
import { Prisma } from "@prisma/client";
import { PermissionsConfig } from "prisma-rls";

export type Context = Record<string, any>;
type RolePermissions = PermissionsConfig<Prisma.TypeMap, Context>;

export const Guest: RolePermissions = {
  Post: {
    read: { published: { equals: true } },
    create: false,
    update: false,
    delete: false,
  },
  User: {
    read: { role: { not: { equals: "admin" } } },
    create: false,
    update: false,
    delete: false,
  },
}
```

Extend the Prisma client with the RLS extension.

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import { createRlsExtension } from "prisma-rls";

import { Guest } from "./permissions/guest";

const context: Context = {};

const db = new PrismaClient().$extends({ 
  dmmf: Prisma.dmmf,
  permissionsConfig: Guest,
  context,
});
```

After that all non-raw queries will be executed according to the defined permissions.

### Permissions registry

In most cases, you will have multiple roles. To define them in a type-safe manner, follow this pattern:

```typescript
import { admin } from "./admin";
import { guest } from "./guest";

type Role = "Admin" | "Guest";
type PermissionsRegistry = Record<Role, RolePermissions>;

export const permissionsRegistry = {
  Admin: admin,
  Guest: guest,
} satisfies PermissionsRegistry;
```

### Context

Since Prisma doesn't support passing context to [extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions), you will generally extend the client for each request, depending on the role associated with the auth token:

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import Fastify, { FastifyRequest } from "fastify";
import { createRlsExtension } from "prisma-rls";

import { permissionsRegistry } from "./permissions";

(async () => {
  const prisma = new PrismaClient();
  const server = Fastify();

  const resolveConext = (request: FastifyRequest) => {
    const role = resolveRole(request.headers.authorization);

    const rlsExtension = createRlsExtension({
      dmmf: Prisma.dmmf,
      permissionsConfig: permissionsRegistry[role],
      context: null,
    });

    return { db: prisma.$extends(rlsExtension) };
  };

  server.get("/post/count", async function handler(request, reply) {
    const { db } = resolveContext(request);
    return await db.post.count();
  });

  await server.listen({ port: 8080, host: "0.0.0.0" });
})();
```
