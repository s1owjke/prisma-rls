import type { DMMF } from "@prisma/client/runtime/library";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap } from "./types";

const mapValues = <T extends Record<string, any>>(
  object: T,
  iteratee: (value: T[keyof T], key: keyof T) => T[keyof T],
) => {
  return Object.fromEntries(
    Object.entries(object).map(([key, value]) => {
      return [key, iteratee(value, key)];
    }),
  );
};

export const generateImpossibleWhere = (fields: Record<string, DMMF.Field>): Record<string, any> => {
  const targetField = Object.values(fields).find((field) => field.isId || field.isUnique);

  if (!targetField) {
    throw new Error("Couldn't find required id or unique field");
  }

  switch (targetField.type) {
    case "Boolean":
      return { AND: [{ [targetField.name]: { equals: true } }, { [targetField.name]: { not: { equals: false } } }] };
    case "BigInt":
    case "Decimal":
    case "Float":
    case "Int":
      return { AND: [{ [targetField.name]: { equals: 0 } }, { [targetField.name]: { not: { equals: 0 } } }] };
    case "String":
      return { AND: [{ [targetField.name]: { equals: "" } }, { [targetField.name]: { not: { equals: "" } } }] };
    case "Bytes":
      const buffer = Buffer.from([]);
      return { AND: [{ [targetField.name]: { equals: buffer } }, { [targetField.name]: { not: { equals: buffer } } }] };
    case "DateTime":
      const date = new Date();
      return { AND: [{ [targetField.name]: { equals: date } }, { [targetField.name]: { not: { equals: date } } }] };
    case "JSON":
      return { AND: [{ [targetField.name]: { equals: null } }, { [targetField.name]: { not: { equals: null } } }] };
    default:
      throw new Error("Unsupported data type");
  }
};

export const resolveWhere = (
  where: Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
): Record<string, any> => {
  return typeof where === "function" ? where(context) : where;
};

export const mergeWhere = (
  first: Record<string, any> | undefined,
  second: Record<string, any>,
): Record<string, any> => {
  return first ? { AND: [first, second] } : second;
};

export const mergeWhereUnique = (
  fieldsMap: FieldsMap,
  modelName: string,
  first: Record<string, any>,
  second: Record<string, any>,
): Record<string, any> => {
  const unique: Record<string, any> = {};
  const rest: Record<string, any> = {};

  for (const [fieldName, fieldValue] of Object.entries(first)) {
    const fieldDef = fieldsMap[modelName][fieldName];

    if (fieldDef.isId || fieldDef.isUnique) {
      unique[fieldName] = fieldValue;
    } else {
      rest[fieldName] = fieldValue;
    }
  }

  return { ...unique, AND: [rest, second] };
};

const generateModelRelationsCount = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
): Record<string, any> => {
  const select: Record<string, any> = {};

  for (const [fieldName, fieldDef] of Object.entries(fieldsMap[modelName])) {
    if (fieldDef.kind === "object" && fieldDef.isList) {
      const relationModelName = fieldDef.type;
      const relationPermissions = permissionsConfig[relationModelName];

      select[fieldName] = { where: resolveWhere(relationPermissions.read, context) };
    }
  }

  return select;
};

const mergeRelationWhere = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any>,
): Record<string, any> => {
  return mapValues(select, (selectValue, selectName) => {
    if (selectName === "_count") {
      if (selectValue === true) {
        return { select: generateModelRelationsCount(permissionsConfig, context, fieldsMap, modelName) };
      } else if (selectValue !== false && selectValue.select) {
        return { select: mergeRelationWhere(permissionsConfig, context, fieldsMap, modelName, selectValue.select) };
      } else {
        return selectValue;
      }
    }

    const fieldDef = fieldsMap[modelName][selectName];

    if (fieldDef.kind === "object") {
      const relationModelName = fieldDef.type;
      const relationPermissions = permissionsConfig[relationModelName];

      if (relationPermissions.read === false) {
        return { where: generateImpossibleWhere(fieldsMap[modelName]) };
      } else if (relationPermissions.read !== true && selectValue === true) {
        return { where: resolveWhere(relationPermissions.read, context) };
      } else if (relationPermissions.read !== true && selectValue !== false) {
        return {
          ...selectValue,
          ...mergeSelectAndInclude(
            permissionsConfig,
            context,
            fieldsMap,
            relationModelName,
            selectValue.select,
            selectValue.include,
          ),
          where: mergeWhere(selectValue.where, resolveWhere(relationPermissions.read, context)),
        };
      }
    }

    return selectValue;
  });
};

export const mergeSelectAndInclude = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any> | undefined,
  include: Record<string, any> | undefined,
): Record<string, any> => {
  if (select) {
    return { select: mergeRelationWhere(permissionsConfig, context, fieldsMap, modelName, select) };
  } else if (include) {
    return { include: mergeRelationWhere(permissionsConfig, context, fieldsMap, modelName, include) };
  } else {
    return {};
  }
};
