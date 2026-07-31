# Prisma RLS

[![Published on npm](https://img.shields.io/npm/v/prisma-rls?color=brightgreen)](https://www.npmjs.com/package/prisma-rls) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Row-Level Security (RLS) traditionally requires databases with native support and custom security policies for each table.

This library provides an alternative: a Prisma client extension that automatically adds "where" clauses to all model queries. This method works without database-side RLS support (e.g., in MySQL).

Note that this extension doesn't apply to raw queries. For those, you must handle them manually or choose database with built-in support.

## Compatibility

| prisma-rls | @prisma/client       |
| ---------- | -------------------- |
| 1.x        | `>=7.0.0`            |
| 0.x        | `>=4.16.1, <7.0.0`   |

Version 7 introduced a new client generator `provider = "prisma-client"` with ESM support, which is a breaking change for this library's DMMF handling, see [Obtaining the DMMF](#obtaining-the-dmmf). If you're on an older Prisma Client, just stay on the `0.x` release.

## Quick start

Define shared types:

```typescript
import { Prisma, User } from "@prisma/client";
import { PermissionsConfig } from "prisma-rls";

export type Role = "User" | "Guest";
export type PermissionsContext = { user: User | null };
export type RolePermissions = PermissionsConfig<Prisma.TypeMap, PermissionsContext>;
export type PermissionsRegistry = Record<Role, RolePermissions>;
```

Define permissions for each model in your schema, they also can be a function:

```typescript
import { RolePermissions } from "./types";

export const User: RolePermissions = {
  Post: {
    read: { published: { equals: true } },
    create: true,
    update: (permissionContext) => ({
      author: {
        id: { equals: permissionContext.user.id },
      },
    }),
    delete: (permissionContext) => ({
      author: {
        id: { equals: permissionContext.user.id },
      },
    }),
  },
  User: {
    read: (permissionContext) => ({
      id: { equals: permissionContext.user.id },
    }),
    create: false,
    update: (permissionContext) => ({
      id: { equals: permissionContext.user.id },
    }),
    delete: false,
  },
}
```

In most cases, you will have multiple roles. To define them in a type-safe manner, follow this pattern:

```typescript
import { guest } from "./guest";
import { user } from "./user";
import { PermissionsRegistry } from "./types";

export const permissionsRegistry = {
  User: user,
  Guest: guest,
} satisfies PermissionsRegistry;
```

Prisma extensions don't support dynamic contexts, so create an extension per context:

```typescript
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { getDMMF } from "@prisma/internals";
import Fastify, { FastifyRequest } from "fastify";
import { createRlsExtension } from "prisma-rls";

import { permissionsRegistry, PermissionsContext } from "./permissions";

(async () => {
  const prisma = new PrismaClient();
  const server = Fastify();

  const datamodel = await readFile(path.resolve("./db/schema.prisma"), "utf8");
  const dmmf = await getDMMF({ datamodel });

  const resolveRequestConext = async (request: FastifyRequest) => {
    const user = await resolveUser(request.headers.authorization);
    const userRole = user ? user.role : "Guest";
    
    const permissionsContext: PermissionsContext = { user };

    const rlsExtension = createRlsExtension({
      dmmf,
      permissionsConfig: permissionsRegistry[userRole],
      context: permissionsContext,
    });

    return { db: prisma.$extends(rlsExtension) };
  };

  server.get("/user/list", async function handler(request, reply) {
    const { db } = resolveRequestConext(request);
    return await db.user.findMany();
  });

  await server.listen({ port: 8080, host: "0.0.0.0" });
})();
```

After that, all non-raw queries will be executed according to the defined permissions.

## Edge cases

### Obtaining the DMMF

The new client generator `provider = "prisma-client"` no longer exposes `Prisma.dmmf`. Until an official replacement lands, these workarounds rely on internal, unstable Prisma APIs and are meant to bridge this transition period.

**Prisma internals** - parse the schema at runtime (simplest, but requires a schema file to be present at runtime):

```typescript
import { readFile } from "node:fs/promises";
import { getDMMF } from "@prisma/internals";

const datamodel = await readFile("./prisma/schema.prisma", "utf8");
const dmmf = await getDMMF({ datamodel });
```

**Custom generator** - capture it once at `prisma generate` time instead:

```typescript
import { writeFile } from "node:fs/promises";
import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";

generatorHandler({
  onManifest: () => ({ defaultOutput: "./dmmf.ts" }),
  onGenerate: async (options: GeneratorOptions) => {
    await writeFile(options.generator.output!.value, `export default ${JSON.stringify(options.dmmf)} as const;`);
  },
});
```

```prisma
generator dmmf {
  provider = "node ./db/generators/dmmf.ts"
  output   = "./generated/dmmf.ts"
}
```

```typescript
import dmmf from "../db/generated/dmmf";

const rlsExtension = createRlsExtension({ dmmf });
```

Also, when prisma is built for edge runtimes such as cloudflare workers, it no longer exposes the `dmmf` property, so use one of the approaches above.

### Required belongs-to

An edge case affects all mandatory belongs-to relations on the owner side (the entity owns the foreign key). 

In these cases, Prisma does not generate filters due to potential referential integrity violations. For performance reasons, no additional checks are applied by default. However, you can change this behavior by enabling the `checkRequiredBelongsTo` flag:

```typescript
const rlsExtension = createRlsExtension({
  dmmf,
  permissionsConfig: permissionsRegistry[userRole],
  context: permissionsContext,
  checkRequiredBelongsTo: true,
});
```

When `checkRequiredBelongsTo` is set to true, the library performs an additional query for each required belongs-to relation (it makes one batched request per relation, not per record) to verify that all data complies with the current permissions.

If the policy restricts data access, an error will be thrown, this error should be handled at the application level:

```typescript
import { ReferentialIntegrityError } from "prisma-rls";

try {
  return await db.post.findMany({ 
    select: { id: true, category: { select: { id: true } } }
  });
} catch (error) {
  if (error instanceof ReferentialIntegrityError) {
    return [];
  }
  
  throw error;
}
```

Alternatively, you can consider the following options:

- Make them optional - keep the foreign keys required but define the relationships as optional
- Handle at the policy level - apply consistent policy filters to restrict access to both sides of relation
