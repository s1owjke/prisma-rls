export type PrismaTypeMap = {
  model: Record<string, { operations: { findMany: { args: { where: Record<string, any> } } } }>;
};

type PrismaModelName<TypeMap extends PrismaTypeMap> = keyof TypeMap["model"];

export type PrismaModelWhere<TypeMap extends PrismaTypeMap, Model extends PrismaModelName<TypeMap>> = NonNullable<
  TypeMap["model"][Model]["operations"]["findMany"]["args"]["where"]
>;

export type ModelPermissionsConfig<
  TypeMap extends PrismaTypeMap,
  ModelName extends PrismaModelName<TypeMap>,
  Context extends unknown,
> = {
  select: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
  create: boolean;
  update: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
  delete: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
};

export type PermissionsConfig<TypeMap extends PrismaTypeMap, Context extends unknown> = {
  [ModelName in PrismaModelName<TypeMap>]: ModelPermissionsConfig<TypeMap, ModelName, Context>;
};