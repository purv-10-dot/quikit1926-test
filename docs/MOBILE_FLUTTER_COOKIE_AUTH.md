# QuikInfra Mobile App — Cookie-Based Authentication Guide

**Audience:** Flutter / Dart mobile team  
**Goal:** Replace JWT/Bearer-token auth with the **same NextAuth session cookie** the QuikInfra web app uses.  
**Backend changes required:** **None.** This uses existing auth endpoints only.

---

## TL;DR

| Old (wrong for QuikInfra) | New (correct) |
|---------------------------|---------------|
| `POST /api/login` → `{ token: "eyJ..." }` | NextAuth credentials flow on **central auth** |
| `Authorization: Bearer <jwt>` on every request | `Cookie: next-auth.session-token=<value>` on **QuikInfra** domain |
| `SecureTokenStorage` saves JWT string | `PersistCookieJar` + `dio_cookie_manager` on QuikInfra `Dio` |
| One `ApiClient` / one `baseUrl` | Two `Dio` instances: **auth** (login only) + **quikinfra** (all APIs) |

The cookie value is a **NextAuth JWE** (encrypted session token). It is **not** the OAuth `id_token` from `/api/oauth/token`.

---

## Packages to install

Add to `pubspec.yaml`:

```yaml
dependencies:
  dio: ^5.7.0
  cookie_jar: ^4.0.8
  dio_cookie_manager: ^3.1.1
  path_provider: ^2.1.4
```

Run:

```bash
flutter pub get
```

**Optional** (only if you want a manual backup of the session token string):

```yaml
  flutter_secure_storage: ^9.2.2
```

With `PersistCookieJar`, secure storage is usually **not** needed for the session cookie.

---

## Environment URLs

Configure per build flavor / `.env`:

| Key | Local dev | Production (example) |
|-----|-----------|----------------------|
| `AUTH_BASE_URL` | `http://localhost:3001` | `https://authn.quikit.ai` |
| `QUIKINFRA_BASE_URL` | `http://localhost:3006` | `https://infra.quikit.ai` |

**Android emulator:** replace `localhost` with `10.0.2.2`  
**iOS simulator:** `localhost` works if the API runs on the same machine  
**Physical device:** use your machine's LAN IP (e.g. `http://192.168.1.10:3006`)

Ports match `apps/quikinfra/.env.local` and `docs/13-app-ports-and-env.md`.

---

## Cookie names

| Environment | Cookie name |
|-------------|-------------|
| Development (`NODE_ENV != production`) | `next-auth.session-token` |
| Production | `__Secure-next-auth.session-token` |

`dio_cookie_manager` stores and sends these automatically — **do not hardcode the value**, only be aware of the name when debugging.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Flutter App                                                │
│                                                             │
│  ┌──────────────┐         ┌────────────────────────────┐   │
│  │  authDio     │         │  quikInfraDio              │   │
│  │  + authJar   │         │  + PersistCookieJar        │   │
│  │              │         │  + CookieManager           │   │
│  │  Used ONLY   │         │  Used for ALL QuikInfra    │   │
│  │  during login│         │  API calls after login     │   │
│  └──────┬───────┘         └─────────────┬──────────────┘   │
│         │                               │                   │
└─────────┼───────────────────────────────┼───────────────────┘
          │                               │
          ▼                               ▼
   AUTH_BASE_URL                  QUIKINFRA_BASE_URL
   (central auth)                 (all /api/* routes)
```

**Rules:**

1. **Never** send `Authorization: Bearer` to QuikInfra APIs (unless a specific route documents it — e.g. `/api/metrics` uses a separate cron token).
2. **Never** use one cookie jar for both domains — cookies are host-scoped.
3. Set `followRedirects: false` on both Dio instances during login/handoff steps.
4. After login succeeds, **all feature API calls** go through `quikInfraDio` only.

---

## Login flow (matches web browser)

Reference implementation in monorepo: `QuikIT/scripts/_verify-handoff.mjs`

```
1. GET  {AUTH}/api/auth/csrf
2. POST {AUTH}/api/auth/callback/credentials   (email + password + csrfToken)
3. GET  {AUTH}/api/post-login?callbackUrl={QUIKINFRA}/
4. GET  {QUIKINFRA}/auth-handoff?token=...     (from Location header in step 3)
5. GET  {QUIKINFRA}/api/auth/session           (verify — optional)
```

Step 4 sets the QuikInfra session cookie. Step 5 confirms it works.

---

## Implementation

### 1. `lib/core/network/dio_factory.dart`

```dart
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

class DioFactory {
  /// Ephemeral jar — only needed during login bridge.
  static CookieJar createAuthJar() => CookieJar();

  /// Persists across app restarts — attach to quikInfraDio.
  static Future<PersistCookieJar> createQuikInfraJar() async {
    final dir = await getApplicationDocumentsDirectory();
    return PersistCookieJar(
      storage: FileStorage('${dir.path}/quikinfra_cookies'),
    );
  }

  static Dio create({
    required String baseUrl,
    required CookieJar cookieJar,
    bool followRedirects = false,
  }) {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      followRedirects: followRedirects,
      validateStatus: (status) => status != null && status < 500,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    ));
    dio.interceptors.add(CookieManager(cookieJar));
    dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
    ));
    return dio;
  }
}
```

### 2. `lib/core/api/api_constants.dart`

```dart
class ApiConstants {
  // --- Base URLs (override per flavor) ---
  static const authBaseUrl = String.fromEnvironment(
    'AUTH_BASE_URL',
    defaultValue: 'http://localhost:3001',
  );
  static const quikInfraBaseUrl = String.fromEnvironment(
    'QUIKINFRA_BASE_URL',
    defaultValue: 'http://localhost:3006',
  );

  // --- Auth (central) — login bridge only ---
  static const authCsrf = '/api/auth/csrf';
  static const authCredentials = '/api/auth/callback/credentials';
  static const authPostLogin = '/api/post-login';
  static const authMemberships = '/api/org/memberships';
  static const authSelectOrg = '/api/auth/select-org';
  static const authSession = '/api/auth/session';

  // --- QuikInfra ---
  static const quikInfraHandoff = '/auth-handoff';
  static const quikInfraSession = '/api/auth/session';
  static const quikInfraMe = '/api/me';
  static const quikInfraMePermissions = '/api/me/permissions';
  static const quikInfraSignout = '/api/auth/signout';
  static const quikInfraCsrf = '/api/auth/csrf';

  // REMOVE old JWT endpoints if present:
  // static const login = '/api/login';  // ❌ does not exist on QuikInfra
  // static const me = '/api/me';        // ✅ keep path but change client (no Bearer)
}
```

### 3. `lib/core/network/api_client.dart` — migrate from Bearer to cookie

**Before (JWT — remove):**

```dart
Future<Map<String, dynamic>> get(String path, {String? token}) async {
  final response = await _dio.get(
    path,
    options: Options(headers: {
      if (token != null) 'Authorization': 'Bearer $token',
    }),
  );
  return response.data;
}
```

**After (cookie — `CookieManager` handles auth automatically):**

```dart
import 'package:dio/dio.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) async {
    final response = await _dio.get(path, queryParameters: query);
    return _parse(response);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    Object? rawBody,
    Options? options,
  }) async {
    final response = await _dio.post(
      path,
      data: rawBody ?? body,
      options: options,
    );
    return _parse(response);
  }

  Future<Map<String, dynamic>> patch(String path, {Map<String, dynamic>? body}) async {
    final response = await _dio.patch(path, data: body);
    return _parse(response);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final response = await _dio.delete(path);
    return _parse(response);
  }

  Map<String, dynamic> _parse(Response response) {
    if (response.statusCode == 401) {
      throw ApiException('Not authenticated', statusCode: 401);
    }
    if (response.statusCode == 403) {
      throw ApiException('Forbidden', statusCode: 403);
    }
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {'data': data};
  }
}
```

**Important:** Inject `quikInfraDio` into `ApiClient`. Remove every `token:` parameter from method signatures across the codebase.

### 4. `lib/features/auth/auth_repository.dart` — full replacement

```dart
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';

import '../../core/api/api_constants.dart';
import '../../core/network/api_exception.dart';
import '../../shared/models/me_model.dart';

class AuthRepository {
  AuthRepository({
    required Dio authDio,
    required Dio quikInfraDio,
    required CookieJar quikInfraJar,
    required ApiClient quikInfraApi,
  })  : _authDio = authDio,
        _quikInfraDio = quikInfraDio,
        _quikInfraJar = quikInfraJar,
        _api = quikInfraApi;

  final Dio _authDio;
  final Dio _quikInfraDio;
  final CookieJar _quikInfraJar;
  final ApiClient _api;

  /// Login → bridge → QuikInfra session cookie. Returns bootstrap user context.
  Future<MeResponse> login(String email, String password) async {
    // 1. CSRF
    final csrfRes = await _authDio.get(ApiConstants.authCsrf);
    final csrfToken = csrfRes.data['csrfToken'] as String?;

    if (csrfToken == null || csrfToken.isEmpty) {
      throw ApiException('Failed to obtain CSRF token');
    }

    // 2. Credentials (sets auth-domain cookie in auth jar)
    final loginRes = await _authDio.post(
      ApiConstants.authCredentials,
      data: {
        'csrfToken': csrfToken,
        'email': email,
        'password': password,
        'callbackUrl': ApiConstants.authBaseUrl,
        'json': 'true',
      },
      options: Options(
        contentType: Headers.formUrlEncodedContentType,
        followRedirects: false,
      ),
    );

    _assertNoLoginError(loginRes);

    // 3. Cross-domain bridge
    final bridgeRes = await _authDio.get(
      ApiConstants.authPostLogin,
      queryParameters: {
        'callbackUrl': '${ApiConstants.quikInfraBaseUrl}/',
      },
      options: Options(followRedirects: false),
    );

    final handoffUrl = bridgeRes.headers.value('location');
    if (handoffUrl == null || !handoffUrl.contains('token=')) {
      throw ApiException(
        'Login bridge failed — no handoff URL. '
        'Check AUTH_BASE_URL / QUIKINFRA_BASE_URL and that post-login allow-list includes QuikInfra.',
      );
    }

    // 4. Exchange handoff token for QuikInfra session cookie
    final uri = Uri.parse(handoffUrl);
    final handoffRes = await _quikInfraDio.get(
      '${uri.path}?${uri.query}',
      options: Options(followRedirects: false),
    );

    if (handoffRes.statusCode != null && handoffRes.statusCode! >= 400) {
      throw ApiException('Handoff failed (${handoffRes.statusCode})');
    }

    return fetchMe();
  }

  /// QuikInfra bootstrap — permissions, org, role.
  Future<MeResponse> fetchMe() async {
    final body = await _api.get(ApiConstants.quikInfraMe);
  return MeResponse.fromQuikInfraMe(body);
  }

  /// NextAuth session (lighter than /api/me).
  Future<Map<String, dynamic>?> fetchSession() async {
    final res = await _quikInfraDio.get(ApiConstants.quikInfraSession);
    final data = res.data;
    if (data is Map && data['user'] != null) {
      return Map<String, dynamic>.from(data as Map);
    }
    return null;
  }

  Future<bool> isLoggedIn() async {
    try {
      final session = await fetchSession();
      return session?['user'] != null;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    try {
      final csrfRes = await _quikInfraDio.get(ApiConstants.quikInfraCsrf);
      final csrfToken = csrfRes.data['csrfToken'] as String?;
      if (csrfToken != null) {
        await _quikInfraDio.post(
          ApiConstants.quikInfraSignout,
          data: {
            'csrfToken': csrfToken,
            'callbackUrl': ApiConstants.quikInfraBaseUrl,
            'json': 'true',
          },
          options: Options(
            contentType: Headers.formUrlEncodedContentType,
            followRedirects: false,
          ),
        );
      }
    } finally {
      await _quikInfraJar.deleteAll();
    }
  }

  void _assertNoLoginError(Response response) {
    final location = response.headers.value('location') ?? '';
    final body = response.data;
    final bodyStr = body?.toString() ?? '';
    if (location.contains('error=') || bodyStr.contains('error')) {
      throw ApiException('Invalid login credentials.');
    }
  }
}
```

### 5. `lib/core/di/service_locator.dart` (or provider setup)

```dart
// Pseudocode — adapt to your DI (get_it, riverpod, etc.)
late final CookieJar authJar;
late final PersistCookieJar quikInfraJar;
late final Dio authDio;
late final Dio quikInfraDio;
late final ApiClient quikInfraApi;
late final AuthRepository authRepository;

Future<void> setupNetwork() async {
  authJar = DioFactory.createAuthJar();
  quikInfraJar = await DioFactory.createQuikInfraJar();

  authDio = DioFactory.create(
    baseUrl: ApiConstants.authBaseUrl,
    cookieJar: authJar,
  );
  quikInfraDio = DioFactory.create(
    baseUrl: ApiConstants.quikInfraBaseUrl,
    cookieJar: quikInfraJar,
  );
  quikInfraApi = ApiClient(quikInfraDio);

  authRepository = AuthRepository(
    authDio: authDio,
    quikInfraDio: quikInfraDio,
    quikInfraJar: quikInfraJar,
    quikInfraApi: quikInfraApi,
  );
}
```

### 6. Update `MeResponse` model

QuikInfra `GET /api/me` returns:

```json
{
  "userId": "usr_...",
  "userEmail": "user@example.com",
  "userName": "Jane Doe",
  "orgId": "org_...",
  "roleKey": "org_admin",
  "userType": "internal",
  "permissions": ["construction.boq.view", "..."],
  "projectIds": null,
  "modulesAssigned": ["masters", "construction"],
  "permissionMatrix": { }
}
```

**Not** `{ "success": true, "token": "...", "user": { "id": ... } }`.

Add a factory:

```dart
factory MeResponse.fromQuikInfraMe(Map<String, dynamic> json) {
  return MeResponse(
    userId: json['userId'] as String,
    email: json['userEmail'] as String? ?? '',
    name: json['userName'] as String? ?? '',
    orgId: json['orgId'] as String? ?? '',
    roleKey: json['roleKey'] as String? ?? 'member',
    permissions: (json['permissions'] as List?)?.cast<String>() ?? [],
  );
}
```

Remove `AuthResponse` with a `token` field unless you keep it as an internal alias with no `token` property.

---

## All other API repositories

Every repository that currently does:

```dart
final token = await _tokenStorage.getToken();
await _api.get('/api/some-endpoint', token: token);
```

Must become:

```dart
await _api.get('/api/some-endpoint');
// Cookie attached automatically by quikInfraDio + CookieManager
```

### Search-and-replace checklist

| Find | Action |
|------|--------|
| `token: token` / `token: await` on API calls | Remove parameter |
| `Authorization: Bearer` | Remove for QuikInfra calls |
| `SecureTokenStorage` / `getToken()` / `saveSession(token:` | Remove or limit to non-auth secrets |
| `AuthResponse` with `.token` | Remove token field |
| `ApiConstants.login` custom endpoint | Delete — use `AuthRepository.login()` |
| `_requireToken()` before each call | Replace with `isLoggedIn()` at app start or handle 401 globally |

### Global 401 handler (recommended)

Add a Dio interceptor on `quikInfraDio`:

```dart
quikInfraDio.interceptors.add(InterceptorsWrapper(
  onError: (error, handler) async {
    if (error.response?.statusCode == 401) {
      await quikInfraJar.deleteAll();
      // Navigate to login screen via your auth state manager
    }
    handler.next(error);
  },
));
```

This preserves existing "redirect to login on session expiry" behaviour.

---

## Multi-org users (optional)

If `GET {AUTH}/api/org/memberships` returns more than one org:

```
1. login() as above (post-login picks first org by default)
2. GET  {AUTH}/api/org/memberships        (with authDio + auth cookie)
3. User picks org in UI
4. POST {AUTH}/api/auth/select-org        body: { "orgId": "..." }
5. POST {AUTH}/api/auth/session           body: { "orgId": "...", "membershipRole": "..." }
6. Re-run post-login → auth-handoff (steps 3–4 of login) to refresh QuikInfra cookie
```

Skip steps 2–6 if the user has only one org.

---

## Endpoints reference

### Used by mobile auth layer

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `{AUTH}/api/auth/csrf` | CSRF token for login/signout |
| POST | `{AUTH}/api/auth/callback/credentials` | Email/password login |
| GET | `{AUTH}/api/post-login?callbackUrl=...` | Mint handoff token → redirect |
| GET | `{QUIKINFRA}/auth-handoff?token=...` | Set QuikInfra session cookie |
| GET | `{QUIKINFRA}/api/auth/session` | Light session check |
| GET | `{QUIKINFRA}/api/me` | Full bootstrap (permissions, org, role) |
| GET | `{QUIKINFRA}/api/me/permissions` | Permission refresh |
| POST | `{QUIKINFRA}/api/auth/signout` | Logout |

### All other QuikInfra feature APIs

Any route under `{QUIKINFRA}/api/**` (projects, store, purchase, finance, etc.) uses the **same QuikInfra session cookie**. No per-route auth changes on mobile — only remove Bearer headers.

Server-side guard: `getServerSession(authOptions)` in `lib/api/withOrgAuth.ts`.

---

## What NOT to use

| Token / approach | Why it fails |
|------------------|--------------|
| OAuth `id_token` from `{QUIKIT}/api/oauth/token` | RSA JWT for OIDC — not the NextAuth session |
| Custom `POST /api/login` returning JWT | Endpoint does not exist on QuikInfra |
| `Authorization: Bearer <nextauth-jwe>` only | `getServerSession` reads **cookies** primarily; use cookie jar |
| Auth-domain cookie on QuikInfra calls | Wrong host — cookie is not sent cross-domain |
| Minting your own JWT | Signature won't match `NEXTAUTH_SECRET` |

---

## Migration checklist (do not break functionality)

Use this order so the app keeps working throughout the migration:

- [ ] **1.** Add `dio`, `cookie_jar`, `dio_cookie_manager`, `path_provider` to `pubspec.yaml`
- [ ] **2.** Create `DioFactory` with two jars (auth ephemeral, quikinfra persistent)
- [ ] **3.** Wire DI: `authDio`, `quikInfraDio`, `quikInfraApi = ApiClient(quikInfraDio)`
- [ ] **4.** Rewrite `AuthRepository.login()` to cookie bridge flow
- [ ] **5.** Update `MeResponse.fromQuikInfraMe()` for `/api/me` shape
- [ ] **6.** Remove `token` parameter from `ApiClient` get/post/patch/delete
- [ ] **7.** Grep entire project: remove all `Bearer`, `getToken()`, `saveSession(token`
- [ ] **8.** Point every feature repository at `quikInfraApi` (not auth dio)
- [ ] **9.** Add global 401 interceptor → clear jar + login screen
- [ ] **10.** Update `logout()` to signout + `jar.deleteAll()`
- [ ] **11.** Test login → `/api/me` → one feature API (e.g. projects list) → logout → 401 on retry
- [ ] **12.** Test cold start (kill app, reopen) — `PersistCookieJar` should keep session

### Behaviour that must stay the same

| Feature | How to preserve |
|---------|-----------------|
| Login screen | Same UI; only `AuthRepository.login()` implementation changes |
| Auto-login on app open | `isLoggedIn()` → `fetchSession()` or `fetchMe()` |
| Logout button | `authRepository.logout()` |
| Permission-gated UI | Still driven by `GET /api/me` permissions array |
| API error handling | 401 → login, 403 → forbidden message, 422 → validation errors |

---

## Testing

### Manual smoke test

1. Start QuikInfra stack locally (`auth` on :3001, `quikinfra` on :3006)
2. Login with valid test credentials
3. Confirm `GET /api/me` returns `userId`, `orgId`, `permissions`
4. Call any existing feature endpoint your app already uses — must return 200
5. Kill app, reopen — session should persist
6. Logout — next API call returns 401

### Debug tips

- Enable `LogInterceptor` on both Dio instances temporarily
- Verify `Set-Cookie` appears on `/auth-handoff` response
- If bridge fails with no `token=` in Location: check `callbackUrl` origin is in auth allow-list (`quikinfra.quikit.ai`, `localhost:3006`, etc.)
- If 401 on all APIs after login: confirm requests go to `quikInfraDio`, not `authDio`

---

## Cursor agent instructions

When implementing this in the Flutter project:

1. Read this document fully before editing auth or network code.
2. Do **not** add new backend endpoints or change QuikInfra web auth.
3. Replace JWT/Bearer pattern globally — grep for `Bearer`, `getToken`, `token:` on API calls.
4. Keep all existing feature API **paths** unchanged; only change how auth is attached (cookie via `CookieManager`).
5. Preserve existing UI flows (login screen, splash auto-login, logout, permission gates).
6. Use `quikInfraDio` + `PersistCookieJar` for every `/api/*` call on QuikInfra domain.
7. Run `flutter analyze` after changes.

---

## Related monorepo docs

- `QuikIT/scripts/_verify-handoff.mjs` — working HTTP handoff script
- `QuikIT/scripts/_login-lifecycle.mjs` — credentials login + session validation
- `QuikIT/apps/quikinfra/app/auth-handoff/route.ts` — server handoff implementation
- `QuikIT/apps/quikinfra/lib/api/withOrgAuth.ts` — how APIs validate session
- `QuikIT/docs/12-auth-service-integration-response.md` — verify-token contract (server-to-server only)

---

*Last updated: 2026-06-22 — QuikInfra mobile cookie auth integration*
