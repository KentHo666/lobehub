# Document History Tech Spec

**Status:** Proposed

**Owner:** Document / Page / Notebook

**Last Updated:** 2026-04-11

---

## 1. Background

`Document` currently persists only the latest head state in `documents`. During editing, autosave repeatedly overwrites the same row. If a save is corrupted, an unexpected editor mutation occurs, or a user wishes to revert to an earlier state, the system has no durable recovery path.

The objective is to add a Notion-like document history for LobeHub editor documents.

This specification adopts the core idea from `mx-core`: retain a bounded history window using a hybrid of full snapshots and incremental patches. However, the LobeHub version history is deliberately narrower in scope:

| Dimension                  | Decision                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| Version identity           | `editorData` only                                                 |
| Diff encoding              | JSON patch                                                        |
| Full snapshots             | Yes                                                               |
| `refVersion` deduplication | No                                                                |
| History retention          | Bounded, with safe compaction                                     |
| Restore authority          | Client loads historical `editorData`, then performs a normal save |

---

## 2. Goals

| Type | Item                                                           |
| ---- | -------------------------------------------------------------- |
| Goal | Persist a recoverable history of editor states for `Document`  |
| Goal | Support history listing, single-version retrieval, and restore |
| Goal | Keep storage bounded under autosave-heavy workloads            |
| Goal | Ensure trimming never leaves invalid patch chains              |
| Goal | Reuse a single write path for Page and Notebook documents      |

## 3. Non-Goals

| Item                                                              | Rationale                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Versioning `title`, `emoji`, `description`, or arbitrary metadata | Explicitly out of scope for the first iteration       |
| Versioning `content` markdown as an independent source of truth   | History is defined only by `editorData`               |
| Persisting editor operation logs                                  | Recovery is version-based, not operation-replay-based |
| Infinite retention                                                | Storage is intentionally capped                       |

---

## 4. Current State

| Area                             | Current behavior                                      | Consequence                                            |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `documents` schema               | Stores only current row state                         | No history object exists                               |
| Frontend editor save             | Debounced autosave calls `document.updateDocument`    | Every stable edit overwrites head state                |
| `DocumentService.updateDocument` | Performs direct update on `documents`                 | No version boundary is recorded                        |
| Notebook update path             | Bypasses `DocumentService` and updates model directly | History would be inconsistent unless paths are unified |

Relevant code references:

| File                                                                                                                                  | Purpose                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [packages/database/src/schemas/file.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/packages/database/src/schemas/file.ts)           | Current `documents` table definition          |
| [src/store/document/slices/editor/action.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/store/document/slices/editor/action.ts) | Debounced autosave and explicit save          |
| [src/server/services/document/index.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/server/services/document/index.ts)           | Current document create/update/delete service |
| [src/server/routers/lambda/notebook.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/server/routers/lambda/notebook.ts)           | Notebook-specific document mutation path      |

---

## 5. Final Design Decisions

| Topic                                  | Final decision                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source of version truth                | `documents.editorData`                                                                                         |
| Head storage                           | Remains in `documents`                                                                                         |
| Historical storage                     | New table `document_histories`                                                                                 |
| Version numbering                      | Monotonic integer on `documents.version`                                                                       |
| Historical rows represent              | Previous head versions only                                                                                    |
| Current head included in history table | No; exposed synthetically by read APIs if needed                                                               |
| Patch format                           | JSON delta via `jsondiffpatch`-style strategy                                                                  |
| Snapshot policy                        | Full snapshot on first history item, every `N` versions, or oversized patch                                    |
| Retention limit                        | Fixed window, default `100` historical versions per document                                                   |
| Compaction policy                      | Rebuild and re-encode retained window before deleting old rows                                                 |
| Restore path                           | Client fetches historical `editorData`, hydrates editor, then triggers normal save with `saveSource='restore'` |

---

## 6. Data Model

### 6.1 `documents` table changes

Add one field:

| Column    | Type      | Null | Default | Purpose                       |
| --------- | --------- | ---- | ------- | ----------------------------- |
| `version` | `integer` | No   | `1`     | Monotonic head version number |

Semantics:

| State                                       | Meaning                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `documents.version = 1` and no history rows | Newly created document; no historical versions yet                          |
| Save from head version `v` to new state     | Create history row for version `v`, then update `documents.version = v + 1` |

### 6.2 New table: `document_histories`

| Column         | Type          | Null | Purpose                                           |
| -------------- | ------------- | ---- | ------------------------------------------------- |
| `id`           | `varchar`     | No   | Primary key                                       |
| `document_id`  | `varchar`     | No   | FK to `documents.id`, `ON DELETE CASCADE`         |
| `user_id`      | `text`        | No   | Permission scope and query index                  |
| `version`      | `integer`     | No   | Historical version number represented by this row |
| `storage_kind` | `text` enum   | No   | `snapshot` or `patch`                             |
| `payload`      | `jsonb`       | No   | Full `editorData` or patch delta                  |
| `base_version` | `integer`     | Yes  | Snapshot base used by a patch row                 |
| `save_source`  | `text` enum   | No   | `autosave`, `manual`, `restore`, `system`         |
| `saved_at`     | `timestamptz` | No   | User-facing version timestamp                     |
| `created_at`   | `timestamptz` | No   | Physical row creation time                        |

Indexes and constraints:

| Name   | Shape                          | Purpose                        |
| ------ | ------------------------------ | ------------------------------ |
| PK     | `id`                           | Primary key                    |
| Unique | `(document_id, version)`       | One row per historical version |
| Index  | `(document_id, saved_at desc)` | History listing                |
| Index  | `(user_id, saved_at desc)`     | Scoped cleanup and audit       |

Deliberate exclusions:

| Excluded field                           | Reason                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `ref_version`                            | Not needed when only `editorData` participates in version identity |
| `title`, `content`, `metadata` snapshots | Out of scope for v1                                                |

---

## 7. Version Semantics

### 7.1 Head versus history

```text
┌─────────────────────┐
│ documents           │
│ current head only   │
│ editorData = v11    │
│ version    = 11     │
└──────────┬──────────┘
           │ previous heads only
           ▼
┌─────────────────────┐
│ document_histories  │
│ v10                 │
│ v9                  │
│ v8                  │
│ ...                 │
└─────────────────────┘
```

### 7.2 Version creation rule

A new version is created only when incoming `editorData` is semantically different from current `documents.editorData`.

Implications:

| Change type                   | Creates history version |
| ----------------------------- | ----------------------- |
| `editorData` changed          | Yes                     |
| Only `title` changed          | No                      |
| Only `metadata` changed       | No                      |
| Same `editorData` resubmitted | No-op                   |

---

## 8. Encoding Strategy

### 8.1 Storage kinds

| `storage_kind` | `payload` content                                         |
| -------------- | --------------------------------------------------------- |
| `snapshot`     | Full `editorData` JSON                                    |
| `patch`        | JSON delta from `base_version` snapshot to target version |

### 8.2 Snapshot policy

Use the following constants:

| Constant                             | Default | Meaning                                                                                |
| ------------------------------------ | ------- | -------------------------------------------------------------------------------------- |
| `DOCUMENT_HISTORY_LIMIT`             | `100`   | Maximum retained historical versions                                                   |
| `DOCUMENT_HISTORY_SNAPSHOT_INTERVAL` | `5`     | Force a new full snapshot every `5` versions                                           |
| `DOCUMENT_HISTORY_PATCH_THRESHOLD`   | `0.7`   | If patch payload size exceeds `70%` of full snapshot size, store full snapshot instead |

### 8.3 Why `refVersion` is omitted

`mx-core` uses `refVersion` because additional fields may change without changing the primary content representation. In this design, version identity is defined exclusively by `editorData`. Therefore:

| Case                   | Action                  |
| ---------------------- | ----------------------- |
| `editorData` unchanged | No new version          |
| `editorData` changed   | Store snapshot or patch |

No third state is required.

---

## 9. Save Flow

### 9.1 High-level flow

```text
┌─────────────────────┐
│ incoming save       │
│ editorData + source │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ lock document row   │
│ and history rows    │
└──────────┬──────────┘
           ▼
◆ editorData changed? ◆
     │ No
     └──────────────> return current head
     │ Yes
     ▼
┌──────────────────────────────┐
│ encode previous head version │
│ as snapshot or patch         │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│ write history row for old v  │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│ update documents.editorData  │
│ version = version + 1        │
└──────────┬───────────────────┘
           ▼
◆ history count > limit? ◆
     │ No
     └──────────────> commit
     │ Yes
     ▼
┌──────────────────────────────┐
│ compact retained window      │
│ then delete old rows         │
└──────────────────────────────┘
```

### 9.2 Transaction requirements

All of the following must occur in one transaction:

| Step                               |
| ---------------------------------- |
| Read current head                  |
| Compare incoming `editorData`      |
| Insert historical row for old head |
| Update current head row            |
| Compact history if needed          |

Rationale:

| Risk                                             | Mitigation                                                    |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Concurrent autosaves racing on the same document | Row-level lock on `documents`                                 |
| History row inserted but head not updated        | Single transaction                                            |
| Compaction deletes a needed base snapshot        | Compaction inside same transaction using resolved window data |

---

## 10. Safe Compaction and Trimming

### 10.1 Problem statement

Naive deletion is invalid:

```text
v21 snapshot
v22 patch(base=v21)
v23 patch(base=v21)
v24 snapshot

delete oldest one row
=> v21 removed
=> v22 and v23 can no longer be restored
```

### 10.2 Final compaction strategy

Compaction is not "delete oldest rows".\
Compaction is "rebuild retained window, then re-encode it safely".

Algorithm:

| Step | Action                                                                                   |
| ---- | ---------------------------------------------------------------------------------------- |
| 1    | Collect candidate retained versions: newest `DOCUMENT_HISTORY_LIMIT` historical versions |
| 2    | Resolve every retained version into full `editorData` in memory                          |
| 3    | Delete all existing history rows for the document                                        |
| 4    | Reinsert only retained versions, re-encoded as a fresh sequence of snapshots and patches |
| 5    | Ensure every patch references a snapshot that remains in the retained set                |

### 10.3 Re-encoding rules

Within the retained window:

| Condition                                                      | Storage decision                          |
| -------------------------------------------------------------- | ----------------------------------------- |
| Oldest retained version                                        | Always `snapshot`                         |
| Every `DOCUMENT_HISTORY_SNAPSHOT_INTERVAL` versions after that | `snapshot`                                |
| Oversized patch                                                | `snapshot`                                |
| Otherwise                                                      | `patch` against nearest retained snapshot |

### 10.4 Why this strategy is preferred

| Option                       | Decision                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Keep dependency closure only | Rejected; retained count becomes non-deterministic                          |
| Delete whole segments only   | Rejected for v1; simpler but less precise                                   |
| Rebuild retained window      | Accepted; precise, easy to reason about, correct under bounded history size |

---

## 11. Read and Restore Semantics

### 11.1 History list

History list API should return:

| Field         | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `version`     | Historical version number                                              |
| `savedAt`     | Timestamp shown in UI                                                  |
| `saveSource`  | Autosave/manual/restore/system                                         |
| `storageKind` | Snapshot/patch                                                         |
| `isCurrent`   | Synthetic flag for current head, not persisted in `document_histories` |

The API may prepend a synthetic current-head record from `documents`.

### 11.2 Retrieve a historical version

The API must return resolved full `editorData`, not raw patch rows.

Contract:

| Input                   | Output                                                 |
| ----------------------- | ------------------------------------------------------ |
| `documentId`, `version` | Full resolved `editorData` for that historical version |

### 11.3 Restore flow

Initial restore will be client-driven:

```text
┌─────────────────────┐
│ user selects v37    │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ fetch resolved      │
│ editorData for v37  │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ hydrate editor with │
│ historical data     │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ perform normal save │
│ saveSource=restore  │
└─────────────────────┘
```

This is preferred because the current server path does not yet expose a dedicated server-side serializer for rebuilding compatibility fields from `editorData` alone.

Benefits:

| Benefit                                     | Explanation                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reuses current editor save path             | Existing save already materializes the current row correctly                                |
| Avoids stale `content` compatibility fields | Client normal save can continue to submit both existing compatibility data and `editorData` |
| Defers server-side serializer work          | Keeps first implementation bounded                                                          |

---

## 12. API Surface

### 12.1 Server mutations and queries

| API                                       | Type     | Purpose                                                             |
| ----------------------------------------- | -------- | ------------------------------------------------------------------- |
| `document.listDocumentHistory`            | Query    | List retained versions, optionally including synthetic current head |
| `document.getDocumentHistoryVersion`      | Query    | Resolve and return full `editorData` for one historical version     |
| `document.compareDocumentHistoryVersions` | Query    | Return two resolved versions for diff view                          |
| `document.updateDocument`                 | Mutation | Unified save path; adds history logic internally                    |

Optional later API:

| API                              | Type     | Notes                                                       |
| -------------------------------- | -------- | ----------------------------------------------------------- |
| `document.restoreHistoryVersion` | Mutation | Phase 2 only if server-side serialization becomes available |

### 12.2 Save mutation extension

`document.updateDocument` should accept:

| Field                | Type        | Required             | Purpose                                          |
| -------------------- | ----------- | -------------------- | ------------------------------------------------ |
| `editorData`         | JSON string | Yes for editor saves | Version identity                                 |
| `saveSource`         | enum        | No                   | Defaults to `autosave`                           |
| `restoreFromVersion` | integer     | No                   | Optional audit field for restore-triggered saves |

Notebook must not bypass this path.

### 12.3 Detailed contracts

#### `document.listDocumentHistory`

Purpose:

| Item          | Description                           |
| ------------- | ------------------------------------- |
| Primary use   | Render history sidebar / timeline     |
| Ordering      | Newest first                          |
| Includes head | Optional synthetic current head entry |

Input:

```ts
interface ListHistoryInput {
  documentId: string;
  includeCurrent?: boolean; // default true
  limit?: number; // default 50, max 100
  beforeVersion?: number; // pagination anchor, exclusive
}
```

Output:

```ts
interface DocumentHistoryListItem {
  version: number;
  savedAt: string;
  saveSource: 'autosave' | 'manual' | 'restore' | 'system';
  storageKind: 'snapshot' | 'patch' | 'head';
  isCurrent: boolean;
}

interface ListHistoryOutput {
  items: DocumentHistoryListItem[];
  nextBeforeVersion?: number;
  headVersion: number;
}
```

Behavior:

| Case                             | Result                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `includeCurrent = true`          | Prepend a synthetic `isCurrent=true` item with `version = documents.version` |
| `beforeVersion` provided         | Return versions strictly less than `beforeVersion`                           |
| History empty and current exists | Return current head item only                                                |

#### `document.getDocumentHistoryVersion`

Purpose:

| Item         | Description                                       |
| ------------ | ------------------------------------------------- |
| Primary use  | Preview one historical version or prepare restore |
| Return shape | Fully resolved `editorData`, never raw patch      |

Input:

```ts
interface GetHistoryVersionInput {
  documentId: string;
  version: number;
}
```

Output:

```ts
interface GetHistoryVersionOutput {
  version: number;
  savedAt: string;
  saveSource: 'autosave' | 'manual' | 'restore' | 'system';
  isCurrent: boolean;
  editorData: Record<string, any>;
}
```

Behavior:

| Case                            | Result                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `version === documents.version` | Return current head state directly from `documents`            |
| `version < documents.version`   | Resolve from `document_histories` and return full `editorData` |
| Version not found               | Return `NOT_FOUND` style TRPC error                            |

#### `document.compareDocumentHistoryVersions`

Purpose:

| Item                  | Description                                       |
| --------------------- | ------------------------------------------------- |
| Primary use           | Feed existing diff view                           |
| Server responsibility | Resolve both sides to full `editorData` only      |
| Diff computation      | Remains on client, unless later moved server-side |

Input:

```ts
interface CompareHistoryVersionsInput {
  documentId: string;
  fromVersion: number;
  toVersion: number;
}
```

Output:

```ts
interface CompareHistoryVersionsOutput {
  from: {
    version: number;
    savedAt: string;
    isCurrent: boolean;
    editorData: Record<string, any>;
  };
  to: {
    version: number;
    savedAt: string;
    isCurrent: boolean;
    editorData: Record<string, any>;
  };
}
```

Rationale:

| Decision                                        | Reason                                        |
| ----------------------------------------------- | --------------------------------------------- |
| Return two full versions instead of raw patches | Diff UI should not depend on storage encoding |
| Do not expose `baseVersion` / patch internals   | Storage details remain server-private         |

#### `document.updateDocument`

Purpose:

| Item        | Description                                  |
| ----------- | -------------------------------------------- |
| Primary use | Normal save entrypoint for current head      |
| Side effect | May append one history row for previous head |

Input:

```ts
interface UpdateDocumentInput {
  id: string;
  editorData?: string; // JSON string
  content?: string;
  title?: string;
  metadata?: Record<string, any>;
  parentId?: string | null;
  fileType?: string;
  saveSource?: 'autosave' | 'manual' | 'restore' | 'system';
  restoreFromVersion?: number;
}
```

Output:

```ts
interface UpdateDocumentOutput {
  id: string;
  version: number;
  historyAppended: boolean;
}
```

Behavior:

| Case                            | Result                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| `editorData` unchanged          | `historyAppended = false`; no version increment                            |
| `editorData` changed            | Previous head recorded; `documents.version += 1`; `historyAppended = true` |
| Non-history fields changed only | Current row updates allowed, but no version increment                      |

#### Phase 2: `document.restoreHistoryVersion`

This is intentionally deferred. If introduced later, the contract should remain thin:

```ts
interface RestoreHistoryVersionInput {
  documentId: string;
  version: number;
}

interface RestoreHistoryVersionOutput {
  id: string;
  version: number; // new head version after restore
  restoredFromVersion: number;
}
```

For v1, the client should instead call:

```text
listDocumentHistory -> getDocumentHistoryVersion / compareDocumentHistoryVersions -> hydrate editor -> updateDocument(saveSource='restore')
```

### 12.4 Error semantics

| API                              | Error case                                   | Expected behavior                     |
| -------------------------------- | -------------------------------------------- | ------------------------------------- |
| `listHistory`                    | Document missing or unauthorized             | `NOT_FOUND`                           |
| `getDocumentHistoryVersion`      | Version missing                              | `NOT_FOUND`                           |
| `compareDocumentHistoryVersions` | Either side missing                          | `NOT_FOUND`                           |
| `updateDocument`                 | Concurrent write conflict after retry budget | `CONFLICT` or equivalent server error |

### 12.5 API design notes

| Decision                                         | Reason                                         |
| ------------------------------------------------ | ---------------------------------------------- |
| Version numbers are public API values            | UI needs stable restore targets                |
| Head version can be queried through history APIs | Diff and restore flows become uniform          |
| History APIs return resolved states only         | UI remains decoupled from patch implementation |

### 12.6 LobeHub TRPC Layer Convergence

#### 12.6.1 Router-level design

Target file:

| File                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- |
| [src/server/routers/lambda/document.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/server/routers/lambda/document.ts) |

Recommended public procedures:

| Procedure                        | Type     | Input                         | Output                         |
| -------------------------------- | -------- | ----------------------------- | ------------------------------ |
| `createDocument`                 | Mutation | existing shape                | `DocumentItem`                 |
| `createDocuments`                | Mutation | existing shape                | `DocumentItem[]`               |
| `deleteDocument`                 | Mutation | existing shape                | `void`                         |
| `deleteDocuments`                | Mutation | existing shape                | `void`                         |
| `getDocumentById`                | Query    | existing shape                | `DocumentItem \| undefined`    |
| `listDocumentHistory`            | Query    | `ListHistoryInput`            | `ListHistoryOutput`            |
| `getDocumentHistoryVersion`      | Query    | `GetHistoryVersionInput`      | `GetHistoryVersionOutput`      |
| `compareDocumentHistoryVersions` | Query    | `CompareHistoryVersionsInput` | `CompareHistoryVersionsOutput` |
| `updateDocument`                 | Mutation | `UpdateDocumentInput`         | `UpdateDocumentOutput`         |

Ordering principle:

| Rule                                                                                                  |
| ----------------------------------------------------------------------------------------------------- |
| Keep existing CRUD procedures intact                                                                  |
| Add history procedures adjacent to `getDocumentById` / `updateDocument`                               |
| Do not create a separate `documentHistoryRouter` in v1; keep history colocated under `documentRouter` |

Context injection:

| `ctx` field            | Responsibility                                                     |
| ---------------------- | ------------------------------------------------------------------ |
| `documentModel`        | Current head document queries                                      |
| `documentHistoryModel` | History row persistence and listing                                |
| `documentService`      | Orchestration entrypoint for all document writes and history reads |

#### 12.6.2 Server service boundary

Recommended structure:

```text
src/server/services/document/
├── index.ts              # DocumentService public orchestration surface
├── history.ts            # DocumentHistoryService internal history logic
├── diff/
│   └── json.ts           # JSON patch strategy
└── types.ts              # shared DTOs for server service layer
```

Service responsibility split:

| Service                  | Visibility                    | Responsibility                                                             |
| ------------------------ | ----------------------------- | -------------------------------------------------------------------------- |
| `DocumentService`        | Public to router              | CRUD orchestration, version-aware save, unified read API                   |
| `DocumentHistoryService` | Internal to `DocumentService` | Encode snapshot/patch, resolve historical version, compact retained window |

Recommended `DocumentService` public interface:

```ts
export interface DocumentHistoryListParams {
  beforeVersion?: number;
  documentId: string;
  includeCurrent?: boolean;
  limit?: number;
}

export interface DocumentHistoryVersionParams {
  documentId: string;
  version: number;
}

export interface CompareDocumentHistoryVersionsParams {
  documentId: string;
  fromVersion: number;
  toVersion: number;
}

export interface VersionedUpdateDocumentParams {
  content?: string;
  editorData?: Record<string, any>;
  fileType?: string;
  metadata?: Record<string, any>;
  parentId?: string | null;
  restoreFromVersion?: number;
  saveSource?: 'autosave' | 'manual' | 'restore' | 'system';
  title?: string;
}

export interface VersionedUpdateDocumentResult {
  historyAppended: boolean;
  id: string;
  version: number;
}
```

```ts
class DocumentService {
  createDocument(params): Promise<DocumentItem>;
  createDocuments(params): Promise<DocumentItem[]>;
  deleteDocument(id: string): Promise<void>;
  deleteDocuments(ids: string[]): Promise<void>;
  getDocumentById(id: string): Promise<DocumentItem | undefined>;
  listDocumentHistory(params: DocumentHistoryListParams): Promise<ListHistoryOutput>;
  getDocumentHistoryVersion(params: DocumentHistoryVersionParams): Promise<GetHistoryVersionOutput>;
  compareDocumentHistoryVersions(
    params: CompareDocumentHistoryVersionsParams,
  ): Promise<CompareHistoryVersionsOutput>;
  updateDocument(
    id: string,
    params: VersionedUpdateDocumentParams,
  ): Promise<VersionedUpdateDocumentResult>;
}
```

Recommended `DocumentHistoryService` internal interface:

```ts
class DocumentHistoryService {
  encodePreviousHead(input: {
    currentVersion: number;
    nextEditorData: Record<string, any>;
    previousEditorData: Record<string, any>;
    saveSource: 'autosave' | 'manual' | 'restore' | 'system';
  }): Promise<EncodedHistoryEntry | null>;

  resolveVersion(input: { documentId: string; version: number }): Promise<Record<string, any>>;

  listHistory(input: {
    beforeVersion?: number;
    documentId: string;
    includeCurrent: boolean;
    limit: number;
  }): Promise<ListHistoryOutput>;

  compareVersions(input: {
    documentId: string;
    fromVersion: number;
    toVersion: number;
  }): Promise<CompareHistoryVersionsOutput>;

  compactIfNeeded(input: { documentId: string; headVersion: number }): Promise<void>;
}
```

Design rule:

| Rule                                                                      | Reason                               |
| ------------------------------------------------------------------------- | ------------------------------------ |
| Router never manipulates patch encoding directly                          | Preserve thin router layer           |
| `DocumentService` remains the only write façade                           | Page and Notebook must converge here |
| `DocumentHistoryService` owns all compaction and restore resolution rules | Prevent duplicated history logic     |

#### 12.6.3 Client service design

Target file:

| File                                                                                                          |
| ------------------------------------------------------------------------------------------------------------- |
| [src/services/document/index.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/services/document/index.ts) |

Recommended client interface:

```ts
export interface ListDocumentHistoryParams {
  beforeVersion?: number;
  documentId: string;
  includeCurrent?: boolean;
  limit?: number;
}

export interface GetDocumentHistoryVersionParams {
  documentId: string;
  version: number;
}

export interface CompareDocumentHistoryVersionsParams {
  documentId: string;
  fromVersion: number;
  toVersion: number;
}

export interface UpdateDocumentParams {
  content?: string;
  editorData?: string;
  fileType?: string;
  id: string;
  metadata?: Record<string, any>;
  parentId?: string | null;
  restoreFromVersion?: number;
  saveSource?: 'autosave' | 'manual' | 'restore' | 'system';
  title?: string;
}
```

```ts
class DocumentService {
  createDocument(params: CreateDocumentParams): Promise<DocumentItem>;
  createDocuments(documents: CreateDocumentParams[]): Promise<DocumentItem[]>;
  queryDocuments(params?): Promise<{ items: DocumentItem[]; total: number }>;
  getDocumentById(id: string, uniqueKey?: string): Promise<DocumentItem | undefined>;
  listDocumentHistory(params: ListDocumentHistoryParams): Promise<ListHistoryOutput>;
  getDocumentHistoryVersion(
    params: GetDocumentHistoryVersionParams,
    uniqueKey?: string,
  ): Promise<GetHistoryVersionOutput>;
  compareDocumentHistoryVersions(
    params: CompareDocumentHistoryVersionsParams,
  ): Promise<CompareHistoryVersionsOutput>;
  deleteDocument(id: string): Promise<void>;
  deleteDocuments(ids: string[]): Promise<void>;
  updateDocument(params: UpdateDocumentParams): Promise<UpdateDocumentOutput>;
}
```

Client-side design notes:

| Decision                                                    | Reason                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `updateDocument` should no longer return `void`             | UI needs new head version and whether history was appended                         |
| `getDocumentHistoryVersion` may use `abortableRequest`      | History panel switching has the same stale-response risk as current document fetch |
| `compareDocumentHistoryVersions` should be a single request | Avoid sequential history hydration on the client                                   |

#### 12.6.4 Notebook boundary

Target file:

| File                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- |
| [src/server/routers/lambda/notebook.ts](/Users/innei/.codex/worktrees/4c13/lobe-chat/src/server/routers/lambda/notebook.ts) |

Decision:

| Notebook operation                                             | v1 rule                                   |
| -------------------------------------------------------------- | ----------------------------------------- |
| Rich editor document save                                      | Must call `document.updateDocument`       |
| History list / version fetch / compare                         | Must call `document.*History*` procedures |
| Notebook-specific `description` update for plain notebook docs | May remain in `notebookRouter`            |

Practical consequence:

| Item                                                                       | Recommendation                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Keep `notebook.updateDocument` only for notebook-domain metadata semantics | Avoid duplicate versioning logic                                            |
| Do not add history APIs under `notebookRouter`                             | Document history belongs to the document head object, not topic association |

---

## 13. Integration Boundaries

### 13.1 Unified write path

All editor-backed document mutations must converge on one version-aware service method.

Required integration changes:

| Area                          | Change                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Page save                     | Route through version-aware `DocumentService.updateDocument` |
| Portal / Notebook editor save | Same path                                                    |
| Notebook direct router update | Remove direct `DocumentModel.update` overwrite path          |

### 13.2 Compatibility fields

This specification versions only `editorData`, but existing current-row fields remain in use:

| Field            | Status                                    |
| ---------------- | ----------------------------------------- |
| `content`        | Compatibility field; not version identity |
| `totalCharCount` | Compatibility field                       |
| `totalLineCount` | Compatibility field                       |

Rule:

| Rule                                                                                                |
| --------------------------------------------------------------------------------------------------- |
| History comparison, patching, restore payload, and trimming logic must ignore these fields entirely |

---

## 14. Migration Strategy

| Step | Action                                                                             |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | Add `documents.version` with default `1`                                           |
| 2    | Create `document_histories` table and indexes                                      |
| 3    | Backfill nothing; existing documents remain at head version `1` with empty history |
| 4    | Release unified save path                                                          |
| 5    | Release read APIs and UI history panel                                             |

No retroactive reconstruction is required.

---

## 15. Testing Strategy

The tests should be behavior-oriented. Do not snapshot static tables or migration metadata.

### 15.1 Database / model tests

| Scenario                         | Expected result                                                          |
| -------------------------------- | ------------------------------------------------------------------------ |
| First save after creation        | Previous head version `1` inserted as snapshot, current head becomes `2` |
| Save with unchanged `editorData` | No history row inserted                                                  |
| Small delta save                 | Patch row inserted                                                       |
| Oversized delta save             | Snapshot row inserted                                                    |
| Periodic interval save           | Snapshot row inserted                                                    |
| Compaction after exceeding limit | All retained versions remain restorable                                  |
| Restore candidate fetch          | Returned `editorData` equals original historical state                   |

### 15.2 Service tests

| Scenario                       | Expected result                                                         |
| ------------------------------ | ----------------------------------------------------------------------- |
| Concurrent saves               | Version numbers remain monotonic; no duplicate `(document_id, version)` |
| Notebook save path             | Produces history identically to Page save path                          |
| Synthetic current history item | Correctly reflects head version                                         |

### 15.3 Regression tests for compaction

This is the highest-risk area and must be explicit:

```text
Create:
v1 snapshot
v2 patch
v3 patch
v4 snapshot
...
exceed limit

After compaction:
every retained version must still resolve to its original editorData
```

---

## 16. Affected Modules

| Area             | Likely files                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| Database schema  | `packages/database/src/schemas/*`, migrations                                    |
| Database model   | `packages/database/src/models/document*`                                         |
| Document service | `src/server/services/document/*`                                                 |
| Routers          | `src/server/routers/lambda/document.ts`, `src/server/routers/lambda/notebook.ts` |
| Client service   | `src/services/document/index.ts`                                                 |
| Editor save path | `src/store/document/slices/editor/action.ts`                                     |
| History UI       | Page / Portal document history panel and restore entry points                    |

---

## 17. Risks and Mitigations

| Risk                                                                    | Impact                             | Mitigation                                                                                      |
| ----------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Patch algorithm produces unstable diffs on editor node arrays           | Broken restore or large patches    | Use stable object hash keyed by node `id` where available; fall back conservatively to snapshot |
| Notebook bypass remains in place                                        | Missing history for some documents | Hard requirement: all saves go through one service                                              |
| Compaction bug invalidates retained history                             | Severe data integrity issue        | Resolve-before-delete strategy; dedicated compaction tests                                      |
| Restore updates only `editorData` but leaves compatibility fields stale | Inconsistent current row           | Client-driven restore via normal save in v1                                                     |

---

## 18. Open Questions

Current proposal answers the core history problem. The following are intentionally deferred:

| Question                                                   | Deferred decision                              |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Should current head be stored physically in history table? | No for v1                                      |
| Should metadata changes create versions later?             | Possibly in v2                                 |
| Should restore become a server mutation later?             | Yes, if a server-side serializer is introduced |

---

## 19. Final Recommendation

Adopt an `editorData`-only history model with:

| Item            | Recommendation                                |
| --------------- | --------------------------------------------- |
| Head storage    | `documents`                                   |
| History storage | `document_histories`                          |
| Encoding        | `snapshot` + JSON `patch`                     |
| Retention       | `100` historical versions                     |
| Trimming        | Rebuild retained window, then delete old rows |
| Restore         | Client-driven fetch-and-save                  |

This keeps the first implementation small enough to ship, preserves correctness under trimming, and remains directly compatible with a future expansion to richer document version semantics.
