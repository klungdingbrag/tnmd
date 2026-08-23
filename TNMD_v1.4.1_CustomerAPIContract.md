# TNMD v1.4.1 — UI Customer Query Contract

**Status:** Implementation baseline
**Branch:** `v1.4.1`
**Base:** Frozen TNMD v1.4.0 backend
**Mode:** Read-only

## Purpose

TNMD v1.4.1 extends the stable v1.4.0 Web API with a UI-ready customer collection query. The frozen Customer Index V2 and v1.4.0 API remain the source of truth.

No endpoint in this version may query SID Retail or mutate the Customer Index.

## Customer Collection

### Basic

```text
?action=customers&page=1&page_size=20
```

### Search

```text
?action=customers&search=FBR
```

Search is case-insensitive and performs a partial match against the customer code/name (`pelanggan`).

### Category filter

```text
?action=customers&kategori=CABANG
```

Category matching is case-insensitive and exact.

### Sorting

Supported values:

```text
piutang_desc
piutang_asc
transaksi_desc
nama_asc
```

Example:

```text
?action=customers&sort=piutang_desc
```

### Pagination

Parameters:

```text
page       = 1-based page number
page_size  = 1..100
```

Default:

```text
page=1
page_size=20
```

Response shape:

```json
{
  "success": true,
  "api_version": "1.4.1",
  "layer": "web-api",
  "read_only": true,
  "action": "customers",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 14,
      "total_page": 1,
      "has_previous": false,
      "has_next": false
    },
    "filters": {
      "search": "",
      "kategori": "",
      "sort": "piutang_desc"
    }
  },
  "meta": {}
}
```

## Existing v1.4.0 Actions

The following actions remain available and retain their v1.4.0 behavior:

```text
?action=summary
?action=customer&kode=FBR
?action=ranking&limit=10
?action=branch&kategori=CABANG
```

## Error Contract

Errors remain JSON envelopes. Important codes:

- `MISSING_CUSTOMER`
- `CUSTOMER_NOT_FOUND`
- `QUERY_LAYER_UNAVAILABLE`
- `UNKNOWN_ACTION`
- `INTERNAL_ERROR`

## UI Rules

The UI may rely on:

- `data.items`
- `data.pagination`
- `data.filters`
- documented business fields

The UI must not depend on:

- SQL
- SID Retail response structure
- Script Properties
- Customer Index V2 internals
- checkpoint implementation

## Compatibility

v1.4.0 remains frozen and is not modified by this enhancement. v1.4.1 is a new branch/version intended for UI integration.
