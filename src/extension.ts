import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { BaseDMMF } from "@prisma/client/runtime/library";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap } from "./types";
import {
  generateImpossibleWhere,
  mergeCreateData,
  mergeSelectAndInclude,
  mergeUpdateData,
  mergeWhere,
  mergeWhereUnique,
  resolveWhere,
} from "./utils";

export const createRlsExtension = (dmmf: BaseDMMF, permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>, context: unknown) => {
  const fieldsMap: FieldsMap = {};

  for (const model of dmmf.datamodel.models) {
    fieldsMap[model.name] = {};

    for (const field of model.fields) {
      fieldsMap[model.name][field.name] = field;
    }
  }

  return Prisma.defineExtension({
    name: "prisma-rls",
    query: {
      $allModels: {
        $allOperations({ model: modelName, operation, args, query }) {
          const modelPermissions = permissionsConfig[modelName];

          switch (operation) {
            case "findFirst":
            case "findUnique":
              if (!modelPermissions.read) {
                return Promise.resolve(null);
              }
              break;
            case "findFirstOrThrow":
            case "findUniqueOrThrow":
              if (!modelPermissions.read) {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              }
              break;
            case "findMany":
              if (!modelPermissions.read) {
                return Promise.resolve([]);
              }
              break;
            case "aggregate":
              if (!modelPermissions.read) {
                return query({
                  ...args,
                  where: generateImpossibleWhere(fieldsMap[modelName]),
                });
              }
              break;
            case "count":
              if (!modelPermissions.read) {
                return Promise.resolve(0);
              }
              break;
            case "groupBy":
              if (!modelPermissions.read) {
                return Promise.resolve([]);
              }
              break;
            case "create":
            case "createMany":
              if (!modelPermissions.create) {
                throw new Error("Not authorized");
              }
              break;
            case "update":
            case "updateMany":
              if (!modelPermissions.update) {
                throw new Error("Not authorized");
              }
              break;
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                throw new Error("Not authorized");
              }
              break;
            case "delete":
            case "deleteMany":
              if (!modelPermissions.delete) {
                throw new Error("Not authorized");
              }
              break;
          }

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                where:
                  modelPermissions.read === true
                    ? args.where
                    : mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.read, context)),
              });
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                where:
                  modelPermissions.read === true
                    ? args.where
                    : mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.read, context)),
              });
            case "aggregate":
            case "count":
            case "groupBy":
              return query({
                ...args,
                where:
                  modelPermissions.read === true
                    ? args.where
                    : mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.read, context)),
              });
            case "create":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                data: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.data as Record<string, any>),
              });
            case "update":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                data: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.data as Record<string, any>),
                where:
                  modelPermissions.update === true
                    ? args.where
                    : mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.update, context)),
              });
            case "updateMany":
              return query({
                ...args,
                where:
                  modelPermissions.update === true
                    ? args.where
                    : mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.update, context)),
              });
            case "upsert":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                create: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.create as Record<string, any>),
                update: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.update as Record<string, any>),
                where:
                  modelPermissions.update === true
                    ? args.where
                    : mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.update, context)),
              });
            case "delete":
              return query({
                ...args,
                ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                where:
                  modelPermissions.delete === true
                    ? args.where
                    : mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.delete, context)),
              });
            case "deleteMany":
              return query({
                ...args,
                where:
                  modelPermissions.delete === true
                    ? args.where
                    : mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.delete, context)),
              });
          }

          return query(args);
        },
      },
    },
  });
};
