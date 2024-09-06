import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { BaseDMMF } from "@prisma/client/runtime/library";

import type { AllOperationsArgs, PrismaTypeMap, PermissionsConfig } from "./types";
import {
  buildFieldsMap,
  generateImpossibleWhere,
  mergeCreateData,
  mergeSelectAndInclude,
  mergeUpdateData,
  mergeWhere,
  mergeWhereUnique,
  resolveWhere,
} from "./utils";

export const createRlsExtension = (dmmf: BaseDMMF, permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>, context: unknown) => {
  const fieldsMap = buildFieldsMap(dmmf);

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
              } else if (!modelPermissions && operationName === "findUniqueOrThrow") {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where:
                    modelPermissions.read === true
                      ? args.where
                      : mergeWhereUnique(fieldsMap, modelName, args.where, resolveWhere(modelPermissions.read, context)),
                });
              }
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
              if (!modelPermissions.read && operationName === "findFirst") {
                return Promise.resolve(null);
              } else if (!modelPermissions && operationName === "findFirstOrThrow") {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              } else if (!modelPermissions.read && operationName === "findMany") {
                return Promise.resolve(null);
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where: modelPermissions.read === true ? args.where : mergeWhere(args.where, resolveWhere(modelPermissions.read, context)),
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
                  where: modelPermissions.read === true ? args.where : mergeWhere(args.where, resolveWhere(modelPermissions.read, context)),
                });
              }
            case "create":
              if (!modelPermissions.create) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  data: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.data),
                });
              }
            case "createMany":
              if (!modelPermissions.create) {
                throw new Error("Not authorized");
              } else {
                return query(args);
              }
            case "update":
              if (!modelPermissions.update) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  data: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.data),
                  where:
                    modelPermissions.update === true
                      ? args.where
                      : mergeWhereUnique(fieldsMap, modelName, args.where, resolveWhere(modelPermissions.update, context)),
                });
              }
            case "updateMany":
              if (!modelPermissions.update) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  where: modelPermissions.update === true ? args.where : mergeWhere(args.where, resolveWhere(modelPermissions.update, context)),
                });
              }
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  create: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.create),
                  update: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.update),
                  where:
                    modelPermissions.update === true
                      ? args.where
                      : mergeWhereUnique(fieldsMap, modelName, args.where, resolveWhere(modelPermissions.update, context)),
                });
              }
            case "delete":
              if (!modelPermissions.delete) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where:
                    modelPermissions.delete === true
                      ? args.where
                      : mergeWhereUnique(fieldsMap, modelName, args.where, resolveWhere(modelPermissions.delete, context)),
                });
              }
            case "deleteMany":
              if (!modelPermissions.delete) {
                throw new Error("Not authorized");
              } else {
                return query({
                  ...args,
                  where: modelPermissions.delete === true ? args.where : mergeWhere(args.where, resolveWhere(modelPermissions.delete, context)),
                });
              }
          }

          return query(args);
        },
      },
    },
  });
};
