import { Prisma } from "@prisma/client/extension";

import { PermissionsConfig, PrismaTypeMap } from "./types";
import { mergeWhere, mergeWhereUnique, resolveWhere, transformSelectAndInclude } from "./utils";

export const createRlsExtension = (permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>, context: unknown) => {
  return Prisma.defineExtension({
    name: "prisma-extension-rls",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const anyArgs = args as any;
          const modelPermissions = permissionsConfig[model];

          switch (operation) {
            case "findFirst":
            case "findUnique":
              if (!modelPermissions.select) {
                return Promise.resolve(null);
              }
              break;
            case "findFirstOrThrow":
            case "findUniqueOrThrow":
              if (!modelPermissions.select) {
                // TODO: exception similar to prisma not-found
                throw new Error("Nothing found");
              }
              break;
            case "findMany":
              if (!modelPermissions.select) {
                return Promise.resolve([]);
              }
              break;
            case "aggregate":
              if (!modelPermissions.select) {
                // TODO: construct fake response with null instead of aggregated
                return Promise.resolve({});
              }
              break;
            case "count":
              if (!modelPermissions.select) {
                return Promise.resolve(0);
              }
              break;
            case "groupBy":
              if (!modelPermissions.select) {
                return Promise.resolve([]);
              }
              break;
            case "create":
            case "createMany":
              if (!modelPermissions.create) {
                // TODO: exception similar to prisma couldn't create
                throw new Error("Couldn't create");
              }
              throw new Error();
            case "update":
            case "updateMany":
              if (!modelPermissions.update) {
                // TODO: exception similar to prisma couldn't update
                throw new Error("Couldn't update");
              }
              break;
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                // TODO: exception similar to prisma couldn't upsert
                throw new Error("Couldn't upsert");
              }
              break;
            case "delete":
            case "deleteMany":
              if (!modelPermissions.delete) {
                // TODO: exception similar to prisma couldn't delete
                throw new Error("Couldn't delete");
              }
              break;
          }

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
              if (typeof modelPermissions.select !== "boolean") {
                return query({
                  ...args,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhereUnique(anyArgs.where, resolveWhere(modelPermissions.select, context)),
                });
              }
              break;
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "aggregate":
            case "count":
            case "groupBy":
              if (typeof modelPermissions.select !== "boolean") {
                return query({
                  ...args,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhere(anyArgs.where, resolveWhere(modelPermissions.select, context)),
                });
              }
              break;
            case "update":
              if (typeof modelPermissions.update !== "boolean") {
                return query({
                  ...anyArgs,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhereUnique(anyArgs.where, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "updateMany":
              if (typeof modelPermissions.update !== "boolean") {
                return query({
                  ...args,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhere(anyArgs.where, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "upsert":
              if (typeof modelPermissions.update !== "boolean") {
                return query({
                  ...anyArgs,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  update: mergeWhereUnique(anyArgs.where, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "delete":
              if (typeof modelPermissions.delete !== "boolean") {
                return query({
                  ...anyArgs,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhereUnique(anyArgs.where, resolveWhere(modelPermissions.delete, context)),
                });
              }
              break;
            case "deleteMany":
              if (typeof modelPermissions.delete !== "boolean") {
                return query({
                  ...anyArgs,
                  ...transformSelectAndInclude(anyArgs.select, anyArgs.include),
                  where: mergeWhere(anyArgs.where, resolveWhere(modelPermissions.delete, context)),
                });
              }
              break;
          }

          return query(args);
        },
      },
    },
  });
};
