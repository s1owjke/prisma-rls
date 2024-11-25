import type { Prisma, PrismaClientExtends } from "@prisma/client/extension";
import type { BaseDMMF, DMMF, DefaultArgs } from "@prisma/client/runtime/library";

import type { AllOperationsArgs, FieldsMap } from "./types";

export const buildFieldsMap = (dmmf: BaseDMMF): FieldsMap => {
  const fieldsMap: FieldsMap = {};

  for (const model of dmmf.datamodel.models) {
    fieldsMap[model.name] = {};
    for (const field of model.fields) {
      fieldsMap[model.name][field.name] = field;
    }
  }

  return fieldsMap;
};

export const mapValues = async <T extends Record<string, any>>(object: T, iteratee: (value: T[keyof T], key: keyof T) => Promise<T[keyof T]>) => {
  return Object.fromEntries(await Promise.all(Object.entries(object).map(async ([key, value]) => [key, await iteratee(value, key)])));
};

export const transformValue = <T extends any>(value: T | T[], callback: (value: T) => Promise<T>) => {
  return Array.isArray(value) ? Promise.all(value.map(callback)) : callback(value);
};

export const generateImpossibleWhere = (fields: Record<string, DMMF.Field>): Record<string, any> => {
  const fieldDef = Object.values(fields).find((field) => field.isId || field.isUnique);
  if (!fieldDef) {
    throw new Error("Couldn't find primary key or unique field");
  }

  switch (fieldDef.type) {
    case "Boolean":
      return { AND: [{ [fieldDef.name]: { equals: true } }, { [fieldDef.name]: { not: { equals: false } } }] };
    case "BigInt":
    case "Decimal":
    case "Float":
    case "Int":
      return { AND: [{ [fieldDef.name]: { equals: 0 } }, { [fieldDef.name]: { not: { equals: 0 } } }] };
    case "String":
      return { AND: [{ [fieldDef.name]: { equals: "" } }, { [fieldDef.name]: { not: { equals: "" } } }] };
    case "Bytes":
      const buffer = Buffer.from([]);
      return { AND: [{ [fieldDef.name]: { equals: buffer } }, { [fieldDef.name]: { not: { equals: buffer } } }] };
    case "DateTime":
      const date = new Date();
      return { AND: [{ [fieldDef.name]: { equals: date } }, { [fieldDef.name]: { not: { equals: date } } }] };
    case "JSON":
      return { AND: [{ [fieldDef.name]: { equals: 0 } }, { [fieldDef.name]: { not: 0 } }] };
    default:
      throw new Error("Not implemented");
  }
};

export const mergeWhere = (first: Record<string, any> | undefined, second: Record<string, any>): Record<string, any> => {
  return first ? { AND: [first, second] } : second;
};

export const mergeWhereUnique = (
  fields: Record<string, DMMF.Field>,
  firstUnique: Record<string, any>,
  second: Record<string, any>,
): Record<string, any> => {
  const unique: Record<string, any> = {};
  const rest: Record<string, any> = {};

  for (const [fieldName, fieldValue] of Object.entries(firstUnique)) {
    const fieldDef = fields[fieldName];

    if (fieldDef.isId || fieldDef.isUnique) {
      unique[fieldName] = fieldValue;
    } else {
      rest[fieldName] = fieldValue;
    }
  }

  return { ...unique, AND: [rest, second] };
};

export const resolvePermissionDefinition = async (
  permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
): Promise<Record<string, any>> => {
  return typeof permissionDefinition === "function" ? await permissionDefinition(context) : permissionDefinition;
};

export const getTransactionClient = (prismaClient: PrismaClientExtends<DefaultArgs>, params: AllOperationsArgs): Prisma.TransactionClient => {
  const transaction = (params as any).__internalParams.transaction;

  if (transaction) {
    if (transaction.kind === "itx") {
      return (prismaClient as any)._createItxClient(transaction);
    } else {
      return prismaClient;
    }
  }

  return prismaClient;
};

export const getPrimaryKeyField = (fields: Record<string, DMMF.Field>): DMMF.Field => {
  const fieldDef = Object.values(fields).find((field) => field.isId);
  if (!fieldDef) {
    throw new Error("Couldn't find primary key");
  }

  return fieldDef;
};

export const pickByPath = (value: any, pathExpression: string) => {
  const result: any[] = [];

  const traverse = (currentValue: any, pathSegments: string[]) => {
    if (!pathSegments.length) {
      result.push(currentValue);
      return;
    }

    const [currentSegment, ...restSegments] = pathSegments;

    if (currentValue && typeof currentValue === "object") {
      if (currentSegment === "*" && Array.isArray(currentValue)) {
        for (const item of currentValue) {
          traverse(item, restSegments);
        }
      } else if (currentSegment === "*") {
        throw new Error("Wildcard path traversal is not supported for object types");
      } else if (currentSegment in currentValue) {
        traverse(currentValue[currentSegment], restSegments);
      }
    }
  };

  traverse(value, pathExpression.replace(/^\$\./, "").split("."));

  return result;
};

export const uniqueArray = <T>(array: T[]): T[] => {
  return [...new Set(array)];
};

export const lowerFirst = (string: string): string => {
  return string.charAt(0).toLowerCase() + string.slice(1);
};
