# TNMD v1.4.0 — Customer API Contract

**Status:** DRAFT → implementation baseline
**Layer:** Customer API
**Data source:** Frozen Customer Index V2
**Mode:** Read-only

## 1. Purpose

This contract defines the stable interface between the TNMD Customer API and the future UI/UX layer. The UI must not depend on SID Retail SQL, pagination internals, checkpoints, or Script Properties.

## 2. Transport

Google Apps Script Web App using `doGet(e)`.

All requests use HTTP GET and return JSON.

Base pattern:

```text
?action=<action>
```

## 3. Actions

### 3.1 Summary

Request:

```text
?action=summary
```

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.0",
  "action": "summary",
  "data": {
    "jumlah_customer": 14,
    "jumlah_page": 21,
    "total_raw": 945,
    "jumlah_transaksi_aktif": 281,
    "total_piutang": 241442000,
    "kategori": {},
    "checkpoint": {}
  },
  "meta": {}
}
```

### 3.2 Customer List

Request:

```text
?action=customers
```

Optional pagination is intentionally deferred until the API contract is needed by the UI. The initial contract returns the indexed customer collection.

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.0",
  "action": "customers",
  "data": {
    "items": [],
    "total": 14
  },
  "meta": {}
}
```

### 3.3 Customer Detail

Request:

```text
?action=customer&kode=FBR
```

The `kode` parameter represents the customer code stored in the Customer Index V2.

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.0",
  "action": "customer",
  "data": {
    "pelanggan": "FBR",
    "kategori": "CABANG",
    "jumlah_page": 4,
    "total_raw": 347,
    "jumlah_transaksi_aktif": 238,
    "total_piutang": 203200000,
    "duplicate_count": 0,
    "complete": true,
    "stopped_by_max_pages": false,
    "status": "PASS"
  },
  "meta": {}
}
```

### 3.4 Ranking

Request:

```text
?action=ranking
```

Optional parameter:

```text
?action=ranking&limit=10
```

Ranking is descending by `total_piutang`. Ties are resolved by customer code/name in ascending order.

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.0",
  "action": "ranking",
  "data": {
    "items": [],
    "limit": 10
  },
  "meta": {}
}
```

### 3.5 Branch Summary

Request:

```text
?action=branch&kategori=CABANG
```

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.0",
  "action": "branch",
  "data": {
    "kategori": "CABANG",
    "jumlah_customer": 14,
    "jumlah_page": 21,
    "total_raw": 945,
    "jumlah_transaksi_aktif": 281,
    "total_piutang": 241442000,
    "customers": []
  },
  "meta": {}
}
```

## 4. Error Contract

Every failed request must still return JSON.

Example:

```json
{
  "success": false,
  "api_version": "1.4.0",
  "action": "customer",
  "error": {
    "code": "CUSTOMER_NOT_FOUND",
    "message": "Customer tidak ditemukan."
  },
  "meta": {}
}
```

Reserved error codes:

- `INVALID_ACTION`
- `MISSING_PARAMETER`
- `CUSTOMER_NOT_FOUND`
- `INVALID_PARAMETER`
- `INDEX_UNAVAILABLE`
- `INTERNAL_ERROR`

## 5. Common Response Envelope

Every endpoint follows this conceptual envelope:

```text
success
api_version
action
data | error
meta
```

`meta` may contain non-business metadata such as request timestamp, duration, or API mode. The UI must rely on `data`, not diagnostic fields.

## 6. Read-only Rule

The Customer API must never:

- execute SQL against SID Retail;
- modify Customer Index V2;
- modify checkpoint state;
- rebuild the index;
- mutate business data.

The API is an application/read layer over the frozen index.

## 7. Versioning

The public contract version is `1.4.0`.

Breaking response changes require a new API version. Internal implementation changes that preserve the contract do not require a version change.

## 8. Implementation Order

1. Implement `doGet(e)` router.
2. Map each action to the existing Customer API functions.
3. Normalize the common JSON envelope.
4. Add contract tests for every action.
5. Test Web App responses from an external HTTP request.
6. Freeze the API contract.
7. Begin UI/UX implementation.

## 9. Current Baseline

The current Customer API internal test suite has passed:

- Customer List
- Customer Summary
- Customer Detail
- Customer Ranking
- Branch Summary

The current verified Customer Index V2 baseline is:

- 14 customers
- 21 pages
- 945 raw transactions
- 281 active transactions
- Rp241,442,000 total receivables

These values are test baselines, not hard-coded production totals.
