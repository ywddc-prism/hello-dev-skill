# API Design Document Template

---

## Basic Information

| Field | Value |
|------|-----|
| Name | [API name] |
| Version | v1.0 |
| Author | [Author] |
| Date | [YYYY-MM-DD] |
| Status | Draft/Review/Released |

---

## API Overview

```
[Brief description of this API's purpose]
```

---

## Endpoint List

| Method | Path | Description | Status |
|------|------|------|------|
| GET | /users | Get user list | Done |
| POST | /users | Create user | Done |
| GET | /users/{id} | Get single user | Done |

---

## Detailed Design

### [Endpoint Name]

**Request**

```
[HTTP method] [path]
Headers:
  Content-Type: application/json
  Authorization: Bearer [token]

[Request body]
```

**Response**

```
[HTTP status code] [status description]
Headers:
  Content-Type: application/json

{
  "code": 0,
  "message": "success",
  "data": {
    // Response data
  }
}
```

### Error Codes

| Error Code | Description | Handling Suggestion |
|--------|------|----------|
| 400 | Parameter error | Check request parameters |
| 401 | Unauthorized | Re-login |
| 404 | Resource not found | Check ID |
| 500 | Server error | Contact backend |

---

## Data Model

### [Model Name]

| Field | Type | Required | Description |
|------|------|------|------|
| id | string | Yes | Unique identifier |
| name | string | Yes | Name |
| email | string | Yes | Email |
| created_at | timestamp | Yes | Creation time |

---

## Security Considerations

- [ ] Authentication method
- [ ] Permission control
- [ ] Sensitive data handling
- [ ] Rate limiting strategy

---

## Change History

| Version | Date | Changes |
|------|------|----------|
| v1.0 | 2026-09-10 | Initial version |
