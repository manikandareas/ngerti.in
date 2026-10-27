# Google account setup

The initial connection supports personal Gmail and Google Workspace accounts through standard Google APIs. Ngertiin supplies a private MCP transport in the owner partition. No external MCP deployment or server URL is required. Hermes owns browser OAuth, PKCE, refresh and private token storage. The bridge forwards the active access token to fixed Google API endpoints and never exchanges, refreshes or persists it.

## One-time application registration

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable Gmail API, Google Drive API, Google Calendar API, Google Docs API and Google Sheets API. Their service IDs are `gmail.googleapis.com`, `drive.googleapis.com`, `calendar-json.googleapis.com`, `docs.googleapis.com` and `sheets.googleapis.com`.
3. Configure Google Auth Platform branding and an **External** audience for personal Gmail. While the app is in Testing, add the intended Google account as a test user. Organization accounts may also require administrator permission.
4. Under Clients, create an OAuth client of type **Web application**. Add the exact redirect URI shown in Connections. The current isolated preview uses `http://localhost:3033/connections`; ordinary local development uses `http://localhost:3000/connections`. Production uses its own HTTPS origin. Do not use a desktop client or an out-of-band callback.
5. Enter the Client ID and Client Secret in the Google connection's fields. These identify the registered application and are not the Google account's password. Alternatively, an operator may set server-only `NMA_GOOGLE_OAUTH_CLIENT_ID` and `NMA_GOOGLE_OAUTH_CLIENT_SECRET`, then restart the partition supervisor. These defaults apply to subsequent configuration; saved private connection registrations remain explicit.
6. Save, choose **Login / hubungkan kembali**, follow Google consent, then inspect the discovered tools. Assign the named connection to the intended agent separately.

Requested scopes are Gmail read and compose, Drive, Calendar, Docs and Sheets. The UI shows the five service families before consent. These are not a `drive.file`-only connection: searching existing account files needs Drive access. Use a suitable test account and follow Google's verification requirements before offering a public deployment. External Testing refresh tokens with these scopes expire after seven days. See [Google's web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## Delivered operation surface

The bridge exposes twelve typed MCP tools: Gmail search/get/create draft/send draft; Drive search/get metadata; Calendar list/create event; Docs read/create; Sheets read/update values. Results retain provider IDs, source metadata and pagination. A Drive metadata read is not document-content extraction; use Docs or Sheets for supported native content. Docs creation currently creates a titled empty document. Unsupported operations are not advertised. Tool selection and ordinary Ngertiin capability fences still apply.

Each Google API write makes one HTTP request, without retries or redirects. A lost write acknowledgement must be reconciled against Google before another write. Disconnect blocks future dispatch immediately; it does not claim to revoke the Google account's remote grant. Removing the app from the Google account remains a separate action.

The official Google remote MCP services are a separate Developer Preview integration, not a prerequisite of this connection. See [Google's remote MCP setup](https://developers.google.com/workspace/guides/configure-mcp-servers).

## Acceptance still required

Controlled tests cover the real native MCP transport with simulated Google API responses. They do not establish that a real account has granted scopes or that an external operation succeeded. Register the client, complete consent, then verify the enabled services against the authorized test account and retain returned IDs. NMA-033 was subsequently closed for the initial package under the user-requested minimal Notion/Linear acceptance. That closure does not establish Google account consent or service-operation acceptance.
