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

// TODO: probably we need model dmmf to get unique keys
const splitWhereUnique = (where: Record<string, any>) => {
  const { id, ...rest } = where;
  return [{ id }, rest];
};

// TODO: first argument is whereUnique
export const mergeWhereUnique = (first: Record<string, any>, second: Record<string, any>): Record<string, any> => {
  // TODO: get model unique keys, id just as
  const [uniquePart, rest] = splitWhereUnique(first);
  return { ...uniquePart, AND: [rest, second] };
};

// TODO: probably we need dmmf and current model name to traverse relations
export const transformSelectAndInclude = (
  select: Record<string, any>,
  include: Record<string, any>,
): Record<string, any> => {
  // TODO: implement merging an normalization for them
  return { select, include };
};
