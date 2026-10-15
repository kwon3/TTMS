export type Role = "admin" | "manager" | "customer";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  company_id: number | null;
  company_name: string | null;
  phone: string | null;
  active: boolean;
};

export type IncidentStatus = "received" | "in_progress" | "resolved" | "closed";

export type Incident = {
  id: number;
  code: string;
  company_id: number;
  company_name: string;
  customer_id: string;
  customer_name: string;
  manager_id: string | null;
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
  // 누가 처리완료를 눌렀는지
  customer_confirmed_by: string | null;
  customer_confirmed_by_name: string | null;
  manager_confirmed_by: string | null;
  manager_confirmed_by_name: string | null;
  manager_confirmed_by_role: Role | null; // 'admin'이면 관리자 대리 확인
  closed_by: string | null;
  closed_by_name: string | null;
  close_type: "confirmed" | "admin" | null; // admin = 관리자 강제 종결
  action_by: string | null; // 원인분석·조치내역 등록자
  action_by_name: string | null;
};

export type Comment = {
  id: number;
  incident_id: number;
  user_id: string;
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
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};

export type IncidentEvent = {
  id: number;
  incident_id: number;
  user_id: string | null;
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
