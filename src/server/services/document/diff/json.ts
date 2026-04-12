import isEqual from 'fast-deep-equal';

type JsonPatchPathSegment = number | string;
type JsonContainer = Record<string, unknown> | unknown[];
type JsonPatchValue = JsonContainer | boolean | null | number | string;
type JsonArrayMatch = { baseIndex: number; currentIndex: number };

type JsonPatchOperation =
  | { op: 'add'; path: JsonPatchPathSegment[]; value: unknown }
  | { op: 'insert'; path: JsonPatchPathSegment[]; value: unknown }
  | { op: 'remove'; path: JsonPatchPathSegment[] }
  | { op: 'replace'; path: JsonPatchPathSegment[]; value: unknown };

const isObjectLike = (value: unknown): value is JsonContainer =>
  typeof value === 'object' && value !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObjectLike(value) && !Array.isArray(value);

const createSemanticComparable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(createSemanticComparable);
  }

  if (!isRecord(value)) return value;

  const comparable: Record<string, unknown> = {};

  for (const key of Object.keys(value).sort()) {
    if (key === 'id') continue;

    comparable[key] = createSemanticComparable(value[key]);
  }

  return comparable;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const createSemanticKey = (value: unknown) => stableStringify(createSemanticComparable(value));

const findArrayMatches = (base: unknown[], current: unknown[]): JsonArrayMatch[] => {
  if (base.length === 0 || current.length === 0) return [];

  const baseKeys = base.map(createSemanticKey);
  const currentKeys = current.map(createSemanticKey);
  const lcs = Array.from({ length: base.length + 1 }, () =>
    Array.from({ length: current.length + 1 }).fill(0),
  );

  for (let baseIndex = base.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex -= 1) {
      if (baseKeys[baseIndex] === currentKeys[currentIndex]) {
        lcs[baseIndex][currentIndex] = lcs[baseIndex + 1][currentIndex + 1] + 1;
        continue;
      }

      lcs[baseIndex][currentIndex] = Math.max(
        lcs[baseIndex + 1][currentIndex],
        lcs[baseIndex][currentIndex + 1],
      );
    }
  }

  const matches: JsonArrayMatch[] = [];
  let baseIndex = 0;
  let currentIndex = 0;

  while (baseIndex < base.length && currentIndex < current.length) {
    if (baseKeys[baseIndex] === currentKeys[currentIndex]) {
      matches.push({ baseIndex, currentIndex });
      baseIndex += 1;
      currentIndex += 1;
      continue;
    }

    if (lcs[baseIndex + 1][currentIndex] >= lcs[baseIndex][currentIndex + 1]) {
      baseIndex += 1;
      continue;
    }

    currentIndex += 1;
  }

  return matches;
};

const getValueAtKey = (container: JsonContainer, key: JsonPatchPathSegment) => {
  if (Array.isArray(container)) {
    return typeof key === 'number' ? container[key] : undefined;
  }

  return container[key];
};

const setValueAtKey = (
  container: JsonContainer,
  key: JsonPatchPathSegment,
  value: unknown,
  operation: Extract<JsonPatchOperation['op'], 'add' | 'insert' | 'replace'>,
) => {
  if (Array.isArray(container)) {
    if (typeof key !== 'number') return;

    if (operation === 'insert') {
      container.splice(Math.min(key, container.length), 0, value);
      return;
    }

    container[key] = value;
    return;
  }

  container[key] = value;
};

const setValueAtPath = (
  root: JsonPatchValue,
  path: JsonPatchPathSegment[],
  value: unknown,
  operation: Extract<JsonPatchOperation['op'], 'add' | 'insert' | 'replace'>,
): JsonPatchValue => {
  if (path.length === 0) return value as JsonPatchValue;

  if (!isObjectLike(root)) return value as JsonPatchValue;

  let cursor: JsonContainer = root;

  for (const [index, key] of path.slice(0, -1).entries()) {
    const next = getValueAtKey(cursor, key);

    if (!isObjectLike(next)) {
      const nextKey = path[index + 1];
      setValueAtKey(cursor, key, typeof nextKey === 'number' ? [] : {}, 'replace');
    }

    cursor = getValueAtKey(cursor, key) as JsonContainer;
  }

  setValueAtKey(cursor, path.at(-1)!, value, operation);
  return root;
};

const removeValueAtPath = (root: JsonPatchValue, path: JsonPatchPathSegment[]): JsonPatchValue => {
  if (path.length === 0) return root;
  if (!isObjectLike(root)) return root;

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

const appendJsonPatch = (
  patch: JsonPatchOperation[],
  base: unknown,
  current: unknown,
  path: JsonPatchPathSegment[],
): void => {
  if (isEqual(base, current)) return;

  if (Array.isArray(base) && Array.isArray(current)) {
    appendArrayPatch(patch, base, current, path);
    return;
  }

  if (isRecord(base) && isRecord(current)) {
    appendObjectPatch(patch, base, current, path);
    return;
  }

  patch.push({ op: 'replace', path, value: structuredClone(current) });
};

const appendObjectPatch = (
  patch: JsonPatchOperation[],
  base: Record<string, unknown>,
  current: Record<string, unknown>,
  path: JsonPatchPathSegment[],
) => {
  for (const key of Object.keys(base)) {
    if (!(key in current)) {
      patch.push({ op: 'remove', path: [...path, key] });
    }
  }

  for (const [key, value] of Object.entries(current)) {
    if (!(key in base)) {
      patch.push({ op: 'add', path: [...path, key], value: structuredClone(value) });
      continue;
    }

    appendJsonPatch(patch, base[key], value, [...path, key]);
  }
};

const appendArrayPatch = (
  patch: JsonPatchOperation[],
  base: unknown[],
  current: unknown[],
  path: JsonPatchPathSegment[],
) => {
  const matches = findArrayMatches(base, current);
  let baseCursor = 0;
  let currentCursor = 0;

  for (const match of matches) {
    appendArrayGapPatch(
      patch,
      base.slice(baseCursor, match.baseIndex),
      current.slice(currentCursor, match.currentIndex),
      path,
      currentCursor,
    );

    appendJsonPatch(patch, base[match.baseIndex], current[match.currentIndex], [
      ...path,
      match.currentIndex,
    ]);

    baseCursor = match.baseIndex + 1;
    currentCursor = match.currentIndex + 1;
  }

  appendArrayGapPatch(
    patch,
    base.slice(baseCursor),
    current.slice(currentCursor),
    path,
    currentCursor,
  );
};

const appendArrayGapPatch = (
  patch: JsonPatchOperation[],
  baseGap: unknown[],
  currentGap: unknown[],
  path: JsonPatchPathSegment[],
  targetStart: number,
) => {
  const sharedLength = Math.min(baseGap.length, currentGap.length);

  for (let index = 0; index < sharedLength; index += 1) {
    appendJsonPatch(patch, baseGap[index], currentGap[index], [...path, targetStart + index]);
  }

  for (let index = baseGap.length - 1; index >= sharedLength; index -= 1) {
    patch.push({ op: 'remove', path: [...path, targetStart + index] });
  }

  for (let index = sharedLength; index < currentGap.length; index += 1) {
    patch.push({
      op: 'insert',
      path: [...path, targetStart + index],
      value: structuredClone(currentGap[index]),
    });
  }
};

export const createJsonPatch = (base: Record<string, any>, current: Record<string, any>) => {
  const patch: JsonPatchOperation[] = [];

  appendJsonPatch(patch, base, current, []);

  return patch;
};

export const applyJsonPatch = (
  base: Record<string, any>,
  patch: JsonPatchOperation[],
): Record<string, any> => {
  let next = structuredClone(base) as JsonPatchValue;

  for (const operation of patch) {
    switch (operation.op) {
      case 'add':
      case 'insert':
      case 'replace': {
        next = setValueAtPath(next, operation.path, structuredClone(operation.value), operation.op);
        break;
      }

      case 'remove': {
        next = removeValueAtPath(next, operation.path);
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
