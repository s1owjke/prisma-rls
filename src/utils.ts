import type { DMMF } from "@prisma/client/runtime/library";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap } from "./types";

const mapValues = <T extends Record<string, any>>(object: T, iteratee: (value: T[keyof T], key: keyof T) => T[keyof T]) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, iteratee(value, key)]));
};

const transformValue = <T extends any>(value: T | T[], callback: (value: T) => T) => {
  return Array.isArray(value) ? value.map(callback) : callback(value);
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

export const resolveWhere = (where: Record<string, any> | ((context: unknown) => Record<string, any>), context: unknown): Record<string, any> => {
  return typeof where === "function" ? where(context) : where;
};

export const mergeWhere = (first: Record<string, any> | undefined, second: Record<string, any>): Record<string, any> => {
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

const mergeRelationSelect = (
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
        return { select: mergeRelationSelect(permissionsConfig, context, fieldsMap, modelName, selectValue.select) };
      } else {
        return selectValue;
      }
    }

    const fieldDef = fieldsMap[modelName][selectName];
    if (fieldDef.kind !== "object") {
      return selectValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (relationPermissions.read === false) {
      return { where: generateImpossibleWhere(fieldsMap[modelName]) };
    } else if (relationPermissions.read !== true && selectValue === true) {
      return { where: resolveWhere(relationPermissions.read, context) };
    } else if (relationPermissions.read !== true && selectValue !== false) {
      return {
        ...selectValue,
        ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, relationModelName, selectValue.select, selectValue.include),
        where: mergeWhere(selectValue.where, resolveWhere(relationPermissions.read, context)),
      };
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
    return { select: mergeRelationSelect(permissionsConfig, context, fieldsMap, modelName, select) };
  } else if (include) {
    return { include: mergeRelationSelect(permissionsConfig, context, fieldsMap, modelName, include) };
  } else {
    return {};
  }
};

export const mergeCreateData = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Record<string, any> => {
  return mapValues(data, (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (relationPermissions.create === false) {
              throw new Error("Not authorized");
            } else {
              return transformValue(actionValue, (value) => {
                return mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, value);
              });
            }
          case "createMany":
            if (relationPermissions.create === false) {
              throw new Error("Not authorized");
            }
            break;
          case "connectOrCreate":
            if (relationPermissions.create === false) {
              throw new Error("Not authorized");
            } else if (relationPermissions.read === false) {
              return transformValue(actionValue, (value) => {
                return {
                  create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, generateImpossibleWhere(fieldsMap[relationModelName])),
                };
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, resolveWhere(relationPermissions.read, context)),
                };
              });
            } else {
              return transformValue(actionValue, (value) => {
                return {
                  create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, value),
                  where: value.where,
                };
              });
            }
          case "connect":
            if (relationPermissions.read === false) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, generateImpossibleWhere(fieldsMap[relationModelName]));
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, resolveWhere(relationPermissions.read, context));
              });
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    } else {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (relationPermissions.create === false) {
              throw new Error("Not authorized");
            } else {
              return mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, actionValue);
            }
          case "connectOrCreate":
            if (relationPermissions.create === false) {
              throw new Error("Not authorized");
            } else if (relationPermissions.read === false) {
              return {
                create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, generateImpossibleWhere(fieldsMap[relationModelName])),
              };
            } else if (relationPermissions.read !== true) {
              return {
                create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, resolveWhere(relationPermissions.read, context)),
              };
            } else {
              return {
                create: mergeCreateData(permissionsConfig, context, fieldsMap, relationModelName, actionValue.create),
                where: actionValue.where,
              };
            }
          case "connect":
            if (relationPermissions.read === false) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, resolveWhere(relationPermissions.read, context));
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    }
  });
};

export const mergeUpdateData = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Record<string, any> => {
  return mapValues(data, (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          default:
            throw new Error("Not implemented");
        }
      });
    } else {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          default:
            throw new Error("Not implemented");
        }
      });
    }
  });
};
