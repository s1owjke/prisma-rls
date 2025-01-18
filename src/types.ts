import type { BaseDMMF, DMMF } from "@prisma/client/runtime/library";

export type PrismaTypeMap = { model: Record<string, { operations: { findMany: { args: { where?: Record<string, any> } } } }> };

export type PrismaModelName<TypeMap extends PrismaTypeMap> = keyof TypeMap["model"];

export type PrismaModelWhere<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>> = NonNullable<
  TypeMap["model"][ModelName]["operations"]["findMany"]["args"]["where"]
>;

export type PrismaModelWhereResolver<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> = (
  context: Context,
) => PrismaModelWhere<TypeMap, ModelName> | Promise<PrismaModelWhere<TypeMap, ModelName>>;

export type PermissionDefinition<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> =
  | boolean
  | PrismaModelWhere<TypeMap, ModelName>
  | PrismaModelWhereResolver<TypeMap, ModelName, Context>;

export type ModelPermissionsConfig<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> = {
  read: PermissionDefinition<TypeMap, ModelName, Context>;
  create: boolean;
  update: PermissionDefinition<TypeMap, ModelName, Context>;
  delete: PermissionDefinition<TypeMap, ModelName, Context>;
};

export type PermissionsConfig<TypeMap extends PrismaTypeMap, Context extends unknown> = {
  [ModelName in PrismaModelName<TypeMap>]: ModelPermissionsConfig<TypeMap, ModelName, Context>;
};

export type ExtensionOptions = {
  dmmf: BaseDMMF;
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>;
  context: unknown;
  authorizationError?: Error;
  checkRequiredBelongsTo?: boolean;
};

export type AllOperationsArgs = { model: PrismaModelName<PrismaTypeMap> } & (
  | { operation: "findUnique"; args: ModelFindUniqueArgs; query: (args: ModelFindUniqueArgs) => Promise<unknown> }
  | { operation: "findUniqueOrThrow"; args: ModelFindUniqueOrThrowArgs; query: (args: ModelFindUniqueOrThrowArgs) => Promise<unknown> }
  | { operation: "findFirst"; args: ModelFindFirstArgs; query: (args: ModelFindFirstArgs) => Promise<unknown> }
  | { operation: "findFirstOrThrow"; args: ModelFindFirstOrThrowArgs; query: (args: ModelFindFirstOrThrowArgs) => Promise<unknown> }
  | { operation: "findMany"; args: ModelFindManyArgs; query: (args: ModelFindManyArgs) => Promise<unknown> }
  | { operation: "aggregate"; args: ModelAggregateArgs; query: (args: ModelAggregateArgs) => Promise<unknown> }
  | { operation: "count"; args: ModelCountArgs; query: (args: ModelCountArgs) => Promise<unknown> }
  | { operation: "groupBy"; args: ModelGroupByArgs; query: (args: ModelGroupByArgs) => Promise<unknown> }
  | { operation: "create"; args: ModelCreateArgs; query: (args: ModelCreateArgs) => Promise<unknown> }
  | { operation: "createMany"; args: ModelCreateManyArgs; query: (args: ModelCreateManyArgs) => Promise<unknown> }
  | { operation: "update"; args: ModelUpdateArgs; query: (args: ModelUpdateArgs) => Promise<unknown> }
  | { operation: "updateMany"; args: ModelUpdateManyArgs; query: (args: ModelUpdateManyArgs) => Promise<unknown> }
  | { operation: "upsert"; args: ModelUpsertArgs; query: (args: ModelUpsertArgs) => Promise<unknown> }
  | { operation: "delete"; args: ModelDeleteArgs; query: (args: ModelDeleteArgs) => Promise<unknown> }
  | { operation: "deleteMany"; args: ModelDeleteManyArgs; query: (args: ModelDeleteManyArgs) => Promise<unknown> }
  | { operation: ""; args: Record<string, unknown>; query: (args: Record<string, any>) => Promise<unknown> } // TODO: find better way
);

export type FieldsMap = Record<string, Record<string, DMMF.Field>>;

export type RelationMetadata = {
  type: "requiredBelongsTo";
  path: string;
  modelName: PrismaModelName<PrismaTypeMap>;
};

export type RecursiveContext = {
  path: string;
};

export type ModelWhereInput = Record<string, unknown>;

export type ModelWhereUniqueInput = Record<string, unknown>;

export type ModelSelectInput = Record<string, boolean | ModelSelectNestedInput | ModelSelectNestedRequiredInput> & {
  _count?: boolean | ModelSelectNestedCountInput;
};

export type ModelSelectNestedInput = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where?: ModelWhereInput;
};

export type ModelSelectNestedRequiredInput = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
};

export type ModelSelectNestedCountInput = {
  select?: Record<string, boolean | { where?: ModelWhereInput }> | null;
};

export type ModelCreateInput = Record<string, unknown | ModelCreateNestedOneInput | ModelCreateNestedManyInput>;

export type ModelCreateNestedOneInput = {
  create?: ModelCreateInput;
  connectOrCreate?: ModelConnectOrCreateInput;
  connect?: ModelWhereUniqueInput;
};

export type ModelCreateNestedManyInput = {
  create?: ModelCreateInput | ModelCreateInput[];
  createMany?: ModelCreateManyInputEnvelope;
  connectOrCreate?: ModelConnectOrCreateInput | ModelConnectOrCreateInput[];
  connect?: ModelWhereUniqueInput | ModelWhereUniqueInput[];
};

export type ModelConnectOrCreateInput = {
  create: ModelCreateInput;
  where: ModelWhereUniqueInput;
};

export type ModelCreateManyInput = Record<string, unknown>;

export type ModelCreateManyInputEnvelope = {
  data: ModelCreateManyInput | ModelCreateManyInput[];
  skipDuplicates?: boolean;
};

export type ModelUpdateInput = Record<string, unknown | ModelUpdateNestedOneInput | ModelUpdateNestedOneRequiredInput | ModelUpdateNestedManyInput>;

export type ModelUpdateNestedOneInput = {
  create?: ModelCreateInput;
  connectOrCreate?: ModelConnectOrCreateInput;
  connect?: ModelWhereUniqueInput;
  disconnect?: boolean | ModelWhereInput;
  update?: ModelUpdateOneWithWhereInput;
  upsert?: ModelUpsertInput;
  delete?: boolean | ModelWhereInput;
};

export type ModelUpdateNestedOneRequiredInput = {
  create?: ModelCreateInput;
  connectOrCreate?: ModelConnectOrCreateInput;
  connect?: ModelWhereUniqueInput;
  update?: ModelUpdateInput | ModelUpdateOneWithWhereInput;
  upsert?: ModelUpsertInput;
};

export type ModelUpdateNestedManyInput = {
  create?: ModelCreateInput | ModelCreateInput[];
  createMany?: ModelCreateManyInputEnvelope;
  connectOrCreate?: ModelConnectOrCreateInput | ModelConnectOrCreateInput[];
  set?: ModelWhereUniqueInput | ModelWhereUniqueInput[];
  connect?: ModelWhereUniqueInput | ModelWhereUniqueInput[];
  disconnect?: ModelWhereUniqueInput | ModelWhereUniqueInput[];
  update?: ModelUpdateWithWhereUniqueInput | ModelUpdateWithWhereUniqueInput[];
  updateMany?: ModelUpdateManyWithWhereInput | ModelUpdateManyWithWhereInput[];
  upsert?: ModelUpsertWithWhereUniqueInput | ModelUpsertWithWhereUniqueInput[];
  delete?: ModelWhereUniqueInput | ModelWhereUniqueInput[];
  deleteMany?: ModelWhereInput | ModelWhereInput[];
};

export type ModelUpdateOneWithWhereInput = {
  data: ModelUpdateInput;
  where?: ModelWhereInput;
};

export type ModelUpdateWithWhereUniqueInput = {
  data: ModelUpdateInput;
  where: ModelWhereUniqueInput;
};

export type ModelUpdateManyInput = Record<string, unknown>;

export type ModelUpdateManyWithWhereInput = {
  data: ModelUpdateManyInput;
  where: ModelWhereInput;
};

export type ModelUpsertInput = {
  create: ModelCreateInput;
  update: ModelUpdateInput;
  where?: ModelWhereInput;
};

export type ModelUpsertWithWhereUniqueInput = {
  create: ModelCreateInput;
  update: ModelUpdateInput;
  where: ModelWhereUniqueInput;
};

export type ModelFindUniqueArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where: ModelWhereUniqueInput;
};

export type ModelFindUniqueOrThrowArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where: ModelWhereUniqueInput;
};

export type ModelFindFirstArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where?: ModelWhereInput;
};

export type ModelFindFirstOrThrowArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where?: ModelWhereInput;
};

export type ModelFindManyArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where?: ModelWhereInput;
};

export type ModelAggregateArgs = {
  where?: ModelWhereInput;
};

export type ModelCountArgs = {
  where?: ModelWhereInput;
};

export type ModelGroupByArgs = {
  where?: ModelWhereInput;
};

export type ModelCreateArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  data: ModelCreateInput;
};

export type ModelCreateManyArgs = {
  data: ModelCreateManyInput | ModelCreateManyInput[];
  skipDuplicates?: boolean;
};

export type ModelUpdateArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  data: ModelUpdateInput;
  where: ModelWhereUniqueInput;
};

export type ModelUpdateManyArgs = {
  data: ModelUpdateManyInput;
  where?: ModelWhereInput;
};

export type ModelUpsertArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  create: ModelCreateInput;
  update: ModelUpdateInput;
  where: ModelWhereUniqueInput;
};

export type ModelDeleteArgs = {
  select?: ModelSelectInput | null;
  include?: ModelSelectInput | null;
  where: ModelWhereUniqueInput;
};

export type ModelDeleteManyArgs = {
  where?: ModelWhereInput;
};

export type ObjectEntry<Object> = NonNullable<{ [Key in keyof Object]: [Key, Object[Key]] }[keyof Object]>;
