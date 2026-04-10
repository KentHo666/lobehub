import { diff } from 'just-diff';

type JsonPatchPathSegment = number | string;
type JsonContainer = Record<string, unknown> | unknown[];

type JsonPatchOperation =
  | { op: 'add'; path: JsonPatchPathSegment[]; value: unknown }
  | { op: 'remove'; path: JsonPatchPathSegment[] }
  | { op: 'replace'; path: JsonPatchPathSegment[]; value: unknown };

const isObjectLike = (value: unknown): value is JsonContainer =>
  typeof value === 'object' && value !== null;

const getValueAtKey = (container: JsonContainer, key: JsonPatchPathSegment) => {
  if (Array.isArray(container)) {
    return typeof key === 'number' ? container[key] : undefined;
  }

  return container[key];
};

const setValueAtKey = (container: JsonContainer, key: JsonPatchPathSegment, value: unknown) => {
  if (Array.isArray(container)) {
    if (typeof key !== 'number') return;

    container[key] = value;
    return;
  }

  container[key] = value;
};

const setValueAtPath = (root: JsonContainer, path: JsonPatchPathSegment[], value: unknown) => {
  if (path.length === 0) return value;

  let cursor: JsonContainer = root;

  for (const [index, key] of path.slice(0, -1).entries()) {
    const next = getValueAtKey(cursor, key);

    if (!isObjectLike(next)) {
      const nextKey = path[index + 1];
      setValueAtKey(cursor, key, typeof nextKey === 'number' ? [] : {});
    }

    cursor = getValueAtKey(cursor, key) as JsonContainer;
  }

  setValueAtKey(cursor, path.at(-1)!, value);
  return root;
};

const removeValueAtPath = (root: JsonContainer, path: JsonPatchPathSegment[]) => {
  if (path.length === 0) return root;

  let cursor: JsonContainer = root;

  for (const key of path.slice(0, -1)) {
    const next = getValueAtKey(cursor, key);

    if (!isObjectLike(next)) {
      return root;
    }

    cursor = next;
  }

  const leafKey = path.at(-1)!;
  if (Array.isArray(cursor) && typeof leafKey === 'number') {
    cursor.splice(leafKey, 1);
    return root;
  }

  if (typeof leafKey === 'string') {
    delete (cursor as Record<string, unknown>)[leafKey];
  }

  return root;
};

export const createJsonPatch = (base: Record<string, any>, current: Record<string, any>) => {
  return diff(base, current) as JsonPatchOperation[];
};

export const applyJsonPatch = (
  base: Record<string, any>,
  patch: JsonPatchOperation[],
): Record<string, any> => {
  const next = structuredClone(base) as JsonContainer;

  for (const operation of patch) {
    switch (operation.op) {
      case 'add':
      case 'replace': {
        setValueAtPath(next, operation.path, structuredClone(operation.value));
        break;
      }

      case 'remove': {
        removeValueAtPath(next, operation.path);
        break;
      }
    }
  }

  return next as Record<string, any>;
};

export const isOversizedJsonPatch = (
  patch: JsonPatchOperation[],
  snapshot: Record<string, any>,
  threshold: number,
) => {
  return JSON.stringify(patch).length > JSON.stringify(snapshot).length * threshold;
};

export type { JsonPatchOperation };
