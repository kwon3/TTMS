export type Role = "admin" | "manager" | "customer";

export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  company_id: number | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  active: number;
};

export type IncidentStatus = "received" | "in_progress" | "resolved" | "closed";

export type Incident = {
  id: number;
  code: string;
  company_id: number;
  company_name: string;
  customer_id: number;
  customer_name: string;
  manager_id: number | null;
  manager_name: string | null;
  title: string;
  description: string;
  severity: string;
  category: string;
  target_system: string | null;
  occurred_at: string | null;
  status: IncidentStatus;
  cause: string | null;
  action_taken: string | null;
  acknowledged_at: string | null;
  action_at: string | null;
  customer_confirmed_at: string | null;
  manager_confirmed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: number;
  incident_id: number;
  user_id: number;
  user_name: string;
  user_role: Role;
  body: string;
  created_at: string;
};

export type Attachment = {
  id: number;
  incident_id: number;
  comment_id: number | null;
  original_name: string;
  mime_type: string | null;
  size: number;
  uploaded_by: number;
  created_at: string;
};

export type IncidentEvent = {
  id: number;
  incident_id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: Role | null;
  type: string;
  detail: string | null;
  created_at: string;
};

export type Notification = {
  id: number;
  incident_id: number | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "관리자",
  manager: "담당자",
  customer: "고객",
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  received: "접수",
  in_progress: "처리중",
  resolved: "조치완료",
  closed: "처리완료",
};

export const SEVERITIES = ["긴급", "높음", "보통", "낮음"] as const;
export const CATEGORIES = ["서버", "네트워크", "애플리케이션", "데이터베이스", "보안", "기타"] as const;
