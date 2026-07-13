export type UserStatus = "Active" | "Inactive";

export type User = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  contact?: string | null;
  department?: string | null;
  designation?: string | null;
  joiningDate?: string | null;
  status: UserStatus;
};
