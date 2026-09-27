// «Войти как владелец»: the admin's own session waits here until they come back.
const ADMIN_TOKEN_KEY = "adminToken";

export function startImpersonation(ownerToken: string) {
  const adminToken = localStorage.getItem("token");
  if (adminToken) localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  localStorage.setItem("token", ownerToken);
  // A full reload: every screen starts from the owner's data.
  window.location.assign("/dashboard");
}

export function stopImpersonation() {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  if (adminToken) localStorage.setItem("token", adminToken);
  else localStorage.removeItem("token");
  window.location.assign(adminToken ? "/admin/owners" : "/login");
}
