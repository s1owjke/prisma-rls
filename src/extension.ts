import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { AuthorizationError } from "./errors";
import { ModelResolver } from "./logic";
import { AllOperationsArgs, ExtensionOptions, RecursiveContext, RelationMetadata } from "./types";
import { buildFieldsMap, generateImpossibleWhere, getTransactionClient } from "./utils";

export const createRlsExtension = ({ dmmf, permissionsConfig, context, authorizationError, checkRequiredBelongsTo }: ExtensionOptions) => {
  const fieldsMap = buildFieldsMap(dmmf);

  if (!authorizationError) {
    authorizationError = new AuthorizationError();
  }

  return Prisma.defineExtension((prismaClient) => {
    return prismaClient.$extends({
      name: "prisma-rls",
      query: {
        $allModels: {
          async $allOperations(rawAllOperationsArgs) {
            const allOperationsArgs = rawAllOperationsArgs as AllOperationsArgs;
            const { model: modelName, operation: operationName, args, query } = allOperationsArgs;

            const modelPermissions = permissionsConfig[modelName];
            const modelResolver = new ModelResolver(permissionsConfig, context, fieldsMap, authorizationError, !!checkRequiredBelongsTo);

            switch (operationName) {
              case "findUnique":
              case "findUniqueOrThrow": {
                if (!modelPermissions.read && operationName === "findUnique") {
                  return Promise.resolve(null);
                } else if (!modelPermissions.read && operationName === "findUniqueOrThrow") {
                  throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                    code: "P2025",
                    clientVersion: Prisma.prismaVersion.client,
                  });
                }

                const relationsMetadata: RelationMetadata[] = [];

                const [selectAndInclude, where] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, { path: "$" }),
                  modelResolver.resolveWhereUnique(modelPermissions.read, modelName, args.where),
                ]);

                const result = await query({ ...args, ...selectAndInclude, where });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "findFirst":
              case "findFirstOrThrow":
              case "findMany": {
                if (!modelPermissions.read && operationName === "findFirst") {
                  return Promise.resolve(null);
                } else if (!modelPermissions.read && operationName === "findFirstOrThrow") {
                  throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                    code: "P2025",
                    clientVersion: Prisma.prismaVersion.client,
                  });
                } else if (!modelPermissions.read && operationName === "findMany") {
                  return Promise.resolve([]);
                }

                const relationsMetadata: RelationMetadata[] = [];
                const recursiveContext: RecursiveContext = { path: operationName === "findMany" ? "$.*" : "$" };

                const [selectAndInclude, where] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, recursiveContext),
                  modelResolver.resolveWhere(modelPermissions.read, modelName, args.where),
                ]);

                const result = await query({ ...args, ...selectAndInclude, where });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "aggregate":
              case "count":
              case "groupBy": {
                if (!modelPermissions.read && operationName === "aggregate") {
                  return query({ ...args, where: generateImpossibleWhere(fieldsMap[modelName]) });
                } else if (!modelPermissions.read && operationName === "count") {
                  return query({ ...args, where: generateImpossibleWhere(fieldsMap[modelName]) });
                } else if (!modelPermissions.read && operationName === "groupBy") {
                  return Promise.resolve([]);
                }

                return query({ ...args, where: await modelResolver.resolveWhere(modelPermissions.read, modelName, args.where) });
              }
              case "create": {
                if (!modelPermissions.create) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const [selectAndInclude, data] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, { path: "$" }),
                  modelResolver.resolveCreate(modelName, args.data),
                ]);

                const result = await query({ ...args, ...selectAndInclude, data });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "createMany": {
                if (!modelPermissions.create) {
                  throw authorizationError;
                }

                return query(args);
              }
              case "update": {
                if (!modelPermissions.update) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const [selectAndInclude, data, where] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, { path: "$" }),
                  modelResolver.resolveUpdate(modelName, args.data),
                  modelResolver.resolveWhereUnique(modelPermissions.update, modelName, args.where),
                ]);

                const result = await query({ ...args, ...selectAndInclude, data, where });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "updateMany": {
                if (!modelPermissions.update) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const result = await query({ ...args, where: await modelResolver.resolveWhere(modelPermissions.update, modelName, args.where) });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "upsert": {
                if (!modelPermissions.create || !modelPermissions.update) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const [selectAndInclude, create, update, where] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, { path: "$" }),
                  modelResolver.resolveCreate(modelName, args.create),
                  modelResolver.resolveUpdate(modelName, args.update),
                  modelResolver.resolveWhereUnique(modelPermissions.update, modelName, args.where),
                ]);

                const result = await query({ ...args, ...selectAndInclude, create, update, where });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "delete": {
                if (!modelPermissions.delete) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const [selectAndInclude, where] = await Promise.all([
                  modelResolver.resolveSelectAndInclude(modelName, args.select, args.include, relationsMetadata, { path: "$" }),
                  modelResolver.resolveWhereUnique(modelPermissions.delete, modelName, args.where),
                ]);

                const result = await query({ ...args, ...selectAndInclude, where });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              case "deleteMany": {
                if (!modelPermissions.delete) {
                  throw authorizationError;
                }

                const relationsMetadata: RelationMetadata[] = [];

                const result = await query({ ...args, where: await modelResolver.resolveWhere(modelPermissions.delete, modelName, args.where) });
                if (checkRequiredBelongsTo) {
                  return modelResolver.performRelationProcessing(getTransactionClient(prismaClient, allOperationsArgs), result, relationsMetadata);
                }

                return result;
              }
              default: {
                return query(args);
              }
            }
          },
        },
      },
    });
  });
};
