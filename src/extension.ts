import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import type { AllOperationsArgs, ExtensionOptions } from "./types";
import {
  buildFieldsMap,
  generateImpossibleWhere,
  resolveSelectAndInclude,
  resolveCreate,
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
        $allOperations({ model: modelName, operation: operationName, args, query }: AllOperationsArgs) {
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
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  where: resolveWhereUnique(modelPermissions.read, context, fieldsMap, modelName, args.where),
                });
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
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  where: resolveWhere(modelPermissions.read, context, fieldsMap, modelName, args.where),
                });
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
                  where: resolveWhere(modelPermissions.read, context, fieldsMap, modelName, args.where),
                });
              }
            case "create":
              if (!modelPermissions.create) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  data: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.data),
                });
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
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.data),
                  where: resolveWhereUnique(modelPermissions.update, context, fieldsMap, modelName, args.where),
                });
              }
            case "updateMany":
              if (!modelPermissions.update) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  where: resolveWhere(modelPermissions.update, context, fieldsMap, modelName, args.where),
                });
              }
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.create),
                  update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.update),
                  where: resolveWhereUnique(modelPermissions.update, context, fieldsMap, modelName, args.where),
                });
              }
            case "delete":
              if (!modelPermissions.delete) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  ...resolveSelectAndInclude(permissionsConfig, context, authorizationError, fieldsMap, modelName, args.select, args.include),
                  where: resolveWhereUnique(modelPermissions.delete, context, fieldsMap, modelName, args.where),
                });
              }
            case "deleteMany":
              if (!modelPermissions.delete) {
                throw authorizationError;
              } else {
                return query({
                  ...args,
                  where: resolveWhere(modelPermissions.delete, context, fieldsMap, modelName, args.where),
                });
              }
          }

          return query(args);
        },
      },
    },
  });
};
