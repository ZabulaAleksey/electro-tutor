import process from "node:process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const EXPECTED_KEYCLOAK_URL = "http://127.0.0.1:58081";
export const KEYCLOAK_URL = process.env.ET_KEYCLOAK_URL || EXPECTED_KEYCLOAK_URL;
export const REALM = "electro-tutor-dev";
export const CLIENT_ID = "electro-tutor-web-dev";
export const TEST_USERNAME = "et-dev-acceptance";
export const TEST_IDENTITY_GROUP = "electro-tutor-et09-3-managed";
export const PROVISION_TIMEOUT_MS = 5_000;
export const REDIRECT_URIS = ["http://127.0.0.1:8000/api/v1/auth/callback"];
export const WEB_ORIGINS = ["http://127.0.0.1:4321", "http://127.0.0.1:4322"];
export const POST_LOGOUT_REDIRECT_URIS = WEB_ORIGINS.map((origin) => `${origin}/`);

function emitSafeSummary(summary) {
  const serialized = JSON.stringify(summary);
  console.log(`${serialized}\ncontract_sha256=${createHash("sha256").update(serialized).digest("hex")}`);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required and must be supplied through the local environment`);
  return value;
}

export function validateProvisioningEnvironment(environment = process.env) {
  if ((environment.ET_KEYCLOAK_URL || EXPECTED_KEYCLOAK_URL) !== EXPECTED_KEYCLOAK_URL) {
    throw new Error(`ET_KEYCLOAK_URL must be exactly ${EXPECTED_KEYCLOAK_URL}`);
  }
  if (environment.ET_DEV_TEST_USERNAME && environment.ET_DEV_TEST_USERNAME !== TEST_USERNAME) {
    throw new Error(`ET_DEV_TEST_USERNAME must be exactly ${TEST_USERNAME}`);
  }
}

function exactValues(actual = [], expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

async function request(path, options = {}) {
  const response = await fetch(`${KEYCLOAK_URL}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(PROVISION_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Keycloak ${options.method || "GET"} ${path} returned ${response.status}`);
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}

async function adminToken() {
  const body = new URLSearchParams({
    grant_type: "password", client_id: "admin-cli",
    username: process.env.ET_KEYCLOAK_ADMIN_USERNAME || "admin",
    password: required("ET_KEYCLOAK_ADMIN_PASSWORD"),
  });
  const result = await request("/realms/master/protocol/openid-connect/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return result.access_token;
}

async function admin(path, token, options = {}) {
  return request(`/admin/realms${path}`, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
}

export async function provision() {
  validateProvisioningEnvironment();
  const token = await adminToken();
  let realm;
  try { realm = await admin(`/${REALM}`, token); } catch (error) { if (!String(error).includes("returned 404")) throw error; }
  const realmRepresentation = {
    ...(realm || {}),
    realm: REALM,
    enabled: true,
    registrationAllowed: false,
    loginWithEmailAllowed: true,
    resetPasswordAllowed: false,
    duplicateEmailsAllowed: false,
    editUsernameAllowed: false,
  };
  if (realm) await admin(`/${REALM}`, token, { method: "PUT", body: JSON.stringify(realmRepresentation) });
  else await admin("", token, { method: "POST", body: JSON.stringify(realmRepresentation) });
  const clients = await admin(`/${REALM}/clients?clientId=${encodeURIComponent(CLIENT_ID)}`, token);
  const client = clients[0];
  const representation = { clientId: CLIENT_ID, name: "Electro Tutor DEV web", enabled: true, publicClient: true, protocol: "openid-connect", standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false, serviceAccountsEnabled: false, fullScopeAllowed: false, redirectUris: REDIRECT_URIS, webOrigins: WEB_ORIGINS, attributes: { "pkce.code.challenge.method": "S256", "post.logout.redirect.uris": POST_LOGOUT_REDIRECT_URIS.join("##") }, defaultClientScopes: ["profile", "email"], optionalClientScopes: [] };
  if (client) await admin(`/${REALM}/clients/${client.id}`, token, { method: "PUT", body: JSON.stringify(representation) });
  else await admin(`/${REALM}/clients`, token, { method: "POST", body: JSON.stringify(representation) });
  let groups = await admin(`/${REALM}/groups?search=${encodeURIComponent(TEST_IDENTITY_GROUP)}&exact=true`, token);
  if (groups.length === 0) {
    await admin(`/${REALM}/groups`, token, { method: "POST", body: JSON.stringify({ name: TEST_IDENTITY_GROUP }) });
    groups = await admin(`/${REALM}/groups?search=${encodeURIComponent(TEST_IDENTITY_GROUP)}&exact=true`, token);
  }
  if (groups.length !== 1 || groups[0].name !== TEST_IDENTITY_GROUP) throw new Error("Keycloak test identity ownership group did not reconcile");
  const ownershipGroup = groups[0];
  const username = TEST_USERNAME;
  const users = await admin(`/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`, token);
  const user = users[0] ? await admin(`/${REALM}/users/${users[0].id}`, token) : null;
  const userGroups = user ? await admin(`/${REALM}/users/${user.id}/groups`, token) : [];
  if (user && !userGroups.some((group) => group.id === ownershipGroup.id)) {
    throw new Error("Refusing to mutate an existing Keycloak user not owned by ET-09.3 provisioning");
  }
  const userRepresentation = { ...(user || {}), username, email: process.env.ET_DEV_TEST_EMAIL || "et-dev-acceptance@invalid.example", enabled: true, emailVerified: true, firstName: "Electro", lastName: "Tutor", requiredActions: [] };
  if (user) await admin(`/${REALM}/users/${user.id}`, token, { method: "PUT", body: JSON.stringify(userRepresentation) });
  else { await admin(`/${REALM}/users`, token, { method: "POST", body: JSON.stringify(userRepresentation) }); }
  const refreshedMatch = (await admin(`/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`, token))[0];
  const refreshed = refreshedMatch ? await admin(`/${REALM}/users/${refreshedMatch.id}`, token) : null;
  if (!refreshed) throw new Error("Keycloak test identity was not created");
  await admin(`/${REALM}/users/${refreshed.id}/groups/${ownershipGroup.id}`, token, { method: "PUT" });
  await admin(`/${REALM}/users/${refreshed.id}/reset-password`, token, { method: "PUT", body: JSON.stringify({ type: "password", value: required("ET_DEV_TEST_PASSWORD"), temporary: false }) });
  const reconciledClients = await admin(`/${REALM}/clients?clientId=${encodeURIComponent(CLIENT_ID)}`, token);
  const reconciledUserMatches = await admin(`/${REALM}/users?username=${encodeURIComponent(username)}&exact=true`, token);
  const reconciledUsers = reconciledUserMatches.length === 1
    ? [await admin(`/${REALM}/users/${reconciledUserMatches[0].id}`, token)]
    : reconciledUserMatches;
  if (reconciledClients.length !== 1 || reconciledUsers.length !== 1) throw new Error("Keycloak reconciliation did not produce exactly one client and test identity");
  const reconciledUserGroups = reconciledUsers.length === 1
    ? await admin(`/${REALM}/users/${reconciledUsers[0].id}/groups`, token)
    : [];
  const reconciledRealm = await admin(`/${REALM}`, token);
  const realmManagementClients = await admin(
    `/${REALM}/clients?clientId=${encodeURIComponent("realm-management")}`,
    token,
  );
  if (realmManagementClients.length !== 1) {
    throw new Error("Keycloak realm-management boundary is unavailable");
  }
  const testAdminRoles = await admin(
    `/${REALM}/users/${reconciledUsers[0].id}/role-mappings/clients/${realmManagementClients[0].id}/composite`,
    token,
  );
  const reconciled = reconciledClients[0];
  const safeSummary = {
    realm: REALM,
    clientId: CLIENT_ID,
    publicClient: reconciled.publicClient,
    standardFlowEnabled: reconciled.standardFlowEnabled,
    implicitFlowEnabled: reconciled.implicitFlowEnabled,
    directAccessGrantsEnabled: reconciled.directAccessGrantsEnabled,
    pkceMethod: reconciled.attributes?.["pkce.code.challenge.method"],
    redirectUris: reconciled.redirectUris,
    webOrigins: reconciled.webOrigins,
    postLogoutRedirectUris: POST_LOGOUT_REDIRECT_URIS,
    testIdentity: username,
    testIdentityOwner: TEST_IDENTITY_GROUP,
  };
  const actualPostLogout = (reconciled.attributes?.["post.logout.redirect.uris"] || "").split("##").filter(Boolean);
  if (!reconciledRealm.enabled || reconciledRealm.registrationAllowed || reconciledRealm.resetPasswordAllowed || reconciledRealm.duplicateEmailsAllowed || reconciledRealm.editUsernameAllowed) throw new Error("Keycloak realm security contract did not reconcile");
  if (!safeSummary.publicClient || !safeSummary.standardFlowEnabled || safeSummary.implicitFlowEnabled || safeSummary.directAccessGrantsEnabled || reconciled.serviceAccountsEnabled || reconciled.fullScopeAllowed || safeSummary.pkceMethod !== "S256") throw new Error("Keycloak client security contract did not reconcile");
  if (!exactValues(reconciled.defaultClientScopes, ["profile", "email"]) || !exactValues(reconciled.optionalClientScopes, [])) throw new Error("Keycloak client scope contract did not reconcile exactly");
  if (!exactValues(reconciled.redirectUris, REDIRECT_URIS) || !exactValues(reconciled.webOrigins, WEB_ORIGINS) || !exactValues(actualPostLogout, POST_LOGOUT_REDIRECT_URIS)) throw new Error("Keycloak redirect/origin contract did not reconcile exactly");
  if (!reconciledUserGroups.some((group) => group.id === ownershipGroup.id)) throw new Error("Keycloak test identity ownership group is missing");
  if (testAdminRoles.length !== 0) throw new Error("Keycloak test identity must not have realm-management roles");
  emitSafeSummary(safeSummary);
}

export async function cleanupTestIdentity() {
  validateProvisioningEnvironment();
  const token = await adminToken();
  const users = await admin(
    `/${REALM}/users?username=${encodeURIComponent(TEST_USERNAME)}&exact=true`,
    token,
  );
  if (users.length === 0) {
    emitSafeSummary({
      realm: REALM,
      testIdentity: TEST_USERNAME,
      testIdentityOwner: TEST_IDENTITY_GROUP,
      deleted: false,
    });
    return;
  }
  if (users.length !== 1) throw new Error("Keycloak cleanup found duplicate test identities");
  const groups = await admin(`/${REALM}/users/${users[0].id}/groups`, token);
  if (!groups.some((group) => group.name === TEST_IDENTITY_GROUP)) {
    throw new Error("Refusing to delete a Keycloak user not owned by ET-09.3 provisioning");
  }
  await admin(`/${REALM}/users/${users[0].id}`, token, { method: "DELETE" });
  const remaining = await admin(
    `/${REALM}/users?username=${encodeURIComponent(TEST_USERNAME)}&exact=true`,
    token,
  );
  if (remaining.length !== 0) throw new Error("Keycloak test identity cleanup did not converge");
  emitSafeSummary({
    realm: REALM,
    testIdentity: TEST_USERNAME,
    testIdentityOwner: TEST_IDENTITY_GROUP,
    deleted: true,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv[2] || "provision";
  if (operation === "provision") await provision();
  else if (operation === "cleanup") await cleanupTestIdentity();
  else throw new Error(`Unknown Keycloak provisioning operation: ${operation}`);
}
