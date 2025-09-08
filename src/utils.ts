import type { Prisma, PrismaClientExtends } from "@prisma/client/extension";

import { AllOperationsArgs, DMMF,DMMFField, FieldsMap, ObjectEntry } from "./types";

export function buildFieldsMap(dmmf: DMMF): FieldsMap {
  const fieldsMap: FieldsMap = {};

  for (const model of dmmf.datamodel.models) {
    fieldsMap[model.name] = {};
    for (const field of model.fields) {
      fieldsMap[model.name][field.name] = field;
    }
  }

  return fieldsMap;
}

export function getTransactionClient(prismaClient: PrismaClientExtends, allOperationsArgs: AllOperationsArgs): Prisma.TransactionClient {
  const transaction = (allOperationsArgs as any).__internalParams.transaction;

  if (transaction && transaction.kind === "itx") {
    return (prismaClient as any)._createItxClient(transaction);
  }

  return prismaClient;
}

export function generateImpossibleWhere(fields: Record<string, DMMFField>): Record<string, unknown> {
  const uniqueField = getUniqueField(fields);

  switch (uniqueField.type) {
    case "Boolean":
      return { [uniqueField.name]: { equals: true, not: { equals: false } } };
    case "BigInt":
    case "Decimal":
    case "Float":
    case "Int":
      return { [uniqueField.name]: { equals: 0, not: { equals: 0 } } };
    case "String":
      return { [uniqueField.name]: { equals: "", not: { equals: "" } } };
    case "Bytes":
      const buffer = Buffer.from([]);
      return { [uniqueField.name]: { equals: buffer, not: { equals: buffer } } };
    case "DateTime":
      const date = new Date();
      return { [uniqueField.name]: { equals: date, not: { equals: date } } };
    case "JSON":
      return { [uniqueField.name]: { equals: 0, not: 0 } };
    default:
      throw new Error(`Couldn't generate impossible where for field type '${uniqueField.type}'`);
  }
}

export function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

export async function resolvePermissionDefinition(
  permissionDefinition: Record<string, unknown> | ((context: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>),
  context: unknown,
): Promise<Record<string, unknown>> {
  return isFunction(permissionDefinition) ? permissionDefinition(context) : permissionDefinition;
}

export function isUniqueField(fieldDef: DMMFField): boolean {
  return fieldDef.isId || fieldDef.isUnique;
}

export function getUniqueField(fields: Record<string, DMMFField>): DMMFField {
  const fieldDef = Object.values(fields).find(isUniqueField);
  if (!fieldDef) {
    throw new Error("Couldn't find primary key or other unique field");
  }

  return fieldDef;
}

export function mergeWhere(first: Record<string, unknown> | undefined, second: Record<string, unknown>): Record<string, unknown> {
  return first ? { AND: [first, second] } : second;
}

export function mergeWhereUnique(
  fields: Record<string, DMMFField>,
  firstUnique: Record<string, unknown>,
  second: Record<string, unknown>,
): Record<string, unknown> {
  const unique: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};

  for (const [fieldName, fieldValue] of Object.entries(firstUnique)) {
    const fieldDef = fields[fieldName];

    if (isUniqueField(fieldDef)) {
      unique[fieldName] = fieldValue;
    } else {
      rest[fieldName] = fieldValue;
    }
  }

  return { ...unique, AND: [rest, second] };
}

export async function mapObjectValues<Object extends Record<string, unknown>, TransformedValue>(
  object: Object,
  iteratee: (item: ObjectEntry<Object>) => Promise<TransformedValue>,
): Promise<Record<keyof Object, TransformedValue>> {
  const entries = Object.entries(object) as ObjectEntry<Object>[];

  const transformedEntries = await Promise.all(
    entries.map(async ([key, value]) => {
      return [key, await iteratee([key, value])];
    }),
  );

  return Object.fromEntries(transformedEntries);
}

export async function transformValue<Value, TransformedValue>(
  value: Value | Value[],
  callback: (value: Value) => Promise<TransformedValue>,
): Promise<TransformedValue | TransformedValue[]> {
  return Array.isArray(value) ? Promise.all(value.map(callback)) : callback(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function pickByPath(value: unknown, pathExpression: string): any[] {
  const result: any[] = [];

  const traverse = (currentValue: unknown, pathSegments: string[]) => {
    if (!pathSegments.length) {
      result.push(currentValue);
      return;
    } else if (!isObject(currentValue)) {
      return;
    }

    const [currentSegment, ...restSegments] = pathSegments;

    if (currentSegment === "*" && Array.isArray(currentValue)) {
      currentValue.map((item) => traverse(item, restSegments));
    } else if (currentSegment === "*") {
      throw new Error("Wildcards are supported only for arrays");
    } else if (currentSegment in currentValue) {
      traverse(currentValue[currentSegment], restSegments);
    }
  };

  traverse(value, pathExpression.replace(/^\$\./, "").split("."));

  return result;
}

export function uniqueArray<Value>(values: Value[]): Value[] {
  return [...new Set(values)];
}

export function lowerFirst(string: string): string {
  return string.charAt(0).toLowerCase() + string.slice(1);
}
