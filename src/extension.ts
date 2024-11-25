import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import type { AllOperationsArgs, ExtensionOptions } from "./types";
import {
  buildFieldsMap,
  generateImpossibleWhere,
  resolveCreate,
  resolveSelectAndInclude,
  resolveUpdate,
  resolveWhere,
  resolveWhereUnique,
} from "./utils";

export const createRlsExtension = ({ dmmf, permissionsConfig, context, authorizationError }: ExtensionOptions) => {
  const fieldsMap = buildFieldsMap(dmmf);

  if (!authorizationError) {
    authorizationError = new Error("Not authorized");
  }

  return Prisma.defineExtension({
    name: "prisma-rls",
    query: {
      $allModels: {
        async $allOperations({ model: modelName, operation: operationName, args, query }: AllOperationsArgs) {
          const modelPermissions = permissionsConfig[modelName];

          switch (operationName) {
            case "findUnique":
            case "findUniqueOrThrow":
              if (!modelPermissions.read && operationName === "findUnique") {
                return Promise.resolve(null);
              } else if (!modelPermissions.read && operationName === "findUniqueOrThrow") {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              } else {
                const [selectAndInclude, where] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveWhereUnique(modelPermissions.read, context, fieldsMap, modelName, args.where),
                ]);

                return query({ ...args, ...selectAndInclude, where });
              }
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
              if (!modelPermissions.read && operationName === "findFirst") {
                return Promise.resolve(null);
              } else if (!modelPermissions.read && operationName === "findFirstOrThrow") {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              } else if (!modelPermissions.read && operationName === "findMany") {
                return Promise.resolve([]);
              } else {
                const [selectAndInclude, where] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveWhere(modelPermissions.read, context, fieldsMap, modelName, args.where),
                ]);

                return query({ ...args, ...selectAndInclude, where });
              }
            case "aggregate":
            case "count":
            case "groupBy":
              if (!modelPermissions.read && operationName === "aggregate") {
                return query({
                  ...args,
                  where: generateImpossibleWhere(fieldsMap[modelName]),
                });
              } else if (!modelPermissions.read && operationName === "count") {
                return Promise.resolve(0);
              }
              if (!modelPermissions.read && operationName === "groupBy") {
                return Promise.resolve([]);
              } else {
                return query({
                  ...args,
                  where: await resolveWhere(modelPermissions.read, context, fieldsMap, modelName, args.where),
                });
              }
            case "create":
              if (!modelPermissions.create) {
                throw authorizationError;
              } else {
                const [selectAndInclude, data] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.data),
                ]);

                return query({ ...args, ...selectAndInclude, data });
              }
            case "createMany":
              if (!modelPermissions.create) {
                throw authorizationError;
              } else {
                return query(args);
              }
            case "update":
              if (!modelPermissions.update) {
                throw authorizationError;
              } else {
                const [selectAndInclude, data, where] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.data),
                  resolveWhereUnique(modelPermissions.update, context, fieldsMap, modelName, args.where),
                ]);

                return query({ ...args, ...selectAndInclude, data, where });
              }
            case "updateMany":
              if (!modelPermissions.update) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  where: await resolveWhere(modelPermissions.update, context, fieldsMap, modelName, args.where),
                });
              }
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                throw authorizationError;
              } else {
                const [selectAndInclude, create, update, where] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.create),
                  resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.update),
                  resolveWhereUnique(modelPermissions.update, context, fieldsMap, modelName, args.where),
                ]);

                return query({ ...args, ...selectAndInclude, create, update, where });
              }
            case "delete":
              if (!modelPermissions.delete) {
                throw authorizationError;
              } else {
                const [selectAndInclude, where] = await Promise.all([
                  resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  resolveWhereUnique(modelPermissions.delete, context, fieldsMap, modelName, args.where),
                ]);

                return query({ ...args, ...selectAndInclude, where });
              }
            case "deleteMany":
              if (!modelPermissions.delete) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  where: await resolveWhere(modelPermissions.delete, context, fieldsMap, modelName, args.where),
                });
              }
          }

          return query(args);
        },
      },
    },
  });
};
