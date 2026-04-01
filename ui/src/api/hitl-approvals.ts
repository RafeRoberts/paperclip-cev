import { api } from "./client";

export interface HitlApproval {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  status: string;
  approvalType: string;
  approvalStatus: string;
  riskTier: string | null;
  actionType: string | null;
  actionPayload: Record<string, unknown> | null;
  feedback: string | null;
  reworkCount: number;
  maxRework: number;
  parentIssueId: string | null;
  assigneeAgentId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  goalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalLogEntry {
  id: string;
  issueId: string;
  approvalType: string;
  action: string;
  decidedBy: string | null;
  feedback: string | null;
  riskTier: string | null;
  reworkCount: number | null;
  createdAt: string;
}

export interface ApprovalStats {
  approvalType: string;
  approvalStatus: string;
  count: number;
}

export interface ReworkResult {
  escalated: boolean;
  issueId: string;
}

export const hitlApprovalsApi = {
  list: (companyId: string, filters?: { approvalType?: string; riskTier?: string }) => {
    const params = new URLSearchParams();
    if (filters?.approvalType) params.set("approvalType", filters.approvalType);
    if (filters?.riskTier) params.set("riskTier", filters.riskTier);
    const qs = params.toString();
    return api.get<HitlApproval[]>(`/companies/${companyId}/hitl-approvals${qs ? `?${qs}` : ""}`);
  },
  getHistory: (companyId: string, issueId: string) =>
    api.get<{ issueId: string; history: ApprovalLogEntry[] }>(
      `/companies/${companyId}/hitl-approvals/${issueId}`,
    ),
  decide: (companyId: string, issueId: string, action: "approved" | "rejected" | "rework", feedback?: string) =>
    api.post<HitlApproval | ReworkResult>(
      `/companies/${companyId}/hitl-approvals/${issueId}/decide`,
      { action, feedback },
    ),
  stats: (companyId: string) =>
    api.get<ApprovalStats[]>(`/companies/${companyId}/hitl-approvals/stats`),
  reworkChain: (companyId: string, issueId: string) =>
    api.get<HitlApproval[]>(`/companies/${companyId}/hitl-approvals/${issueId}/rework-chain`),
};
