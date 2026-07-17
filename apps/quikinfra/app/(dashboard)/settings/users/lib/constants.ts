/** Constants for the User Management page. Extracted from page.tsx. */

export const USER_TYPE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700 border-red-200",
  ADMIN: "bg-purple-50 text-purple-700 border-purple-200",
  HO_USER: "bg-orange-50 text-orange-700 border-orange-200",
  SITE_ADMIN: "bg-green-50 text-green-700 border-green-200",
  USER: "bg-gray-50 text-gray-700 border-gray-200",
};

export const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  mobile: "",
  userType: "user",
  modulesAssigned: [] as string[],
  projectsAssigned: [] as string[],
  department: "",
  isHoUser: false,
  appAllow: true,
  password: "",
  retypePassword: "",
  status: "active",
  // When userType === "ADMIN" (company_admin), this checkbox controls
  // whether the user also gets access to the Settings module. Default
  // unchecked = sub-admins can't invite / manage roles, blocking the
  // "admin sprawl" loophole. Wired to /api/settings/users (invite) as
  // `enableSettings`.
  enableSettings: false,
  // How the invitee signs in. Default = native (temporary password
  // emailed). SSO is for orgs that have Google / Microsoft workspace SSO
  // configured at the central auth level — the invitee then signs in
  // with their existing provider, no password needed.
  invitationMethod: "native" as "native" | "sso",
  // Set when the admin picks an existing org member from the email
  // typeahead. Switches the create call to the "link existing user →
  // grant QuikInfra access" path: no new account, no invite email.
  linkExistingUserId: null as string | null,
};

export type UserForm = typeof emptyForm;
