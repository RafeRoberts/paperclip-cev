import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hitlApprovalsApi } from "../api/hitl-approvals";
import type { HitlApproval } from "../api/hitl-approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { timeAgo } from "../lib/timeAgo";

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-500/20 text-green-600",
  medium: "bg-yellow-500/20 text-yellow-600",
  high: "bg-red-500/20 text-red-600",
};

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  plan_approval: "Plan Approval",
  output_review: "Output Review",
  tool_use: "Tool Use",
  build_tool: "Build Tool",
  add_agent: "Add Agent",
};

function RiskBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RISK_COLORS[tier] ?? ""}`}>
      {tier}
    </span>
  );
}

function ApprovalTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="secondary" className="text-[10px]">
      {APPROVAL_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

function HitlApprovalCard({
  approval,
  agentName,
  onDecide,
  isPending,
}: {
  approval: HitlApproval;
  agentName: string | null;
  onDecide: (action: "approved" | "rejected" | "rework", feedback?: string) => void;
  isPending: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingAction, setPendingAction] = useState<"rejected" | "rework" | null>(null);

  const handleActionWithFeedback = (action: "rejected" | "rework") => {
    if (!showFeedback) {
      setPendingAction(action);
      setShowFeedback(true);
      return;
    }
    onDecide(action, feedback || undefined);
    setShowFeedback(false);
    setFeedback("");
    setPendingAction(null);
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{approval.title}</span>
            <ApprovalTypeBadge type={approval.approvalType} />
            <RiskBadge tier={approval.riskTier} />
            {approval.reworkCount > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <RotateCcw className="h-3 w-3" />
                Rework #{approval.reworkCount}
              </span>
            )}
          </div>
          {agentName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Requested by {agentName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Clock className="h-3.5 w-3.5 text-yellow-600" />
          <span className="text-xs text-muted-foreground">{timeAgo(approval.createdAt)}</span>
        </div>
      </div>

      {approval.description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{approval.description}</p>
      )}

      {approval.actionPayload && Object.keys(approval.actionPayload).length > 0 && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
            View payload
          </summary>
          <pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto max-h-40">
            {JSON.stringify(approval.actionPayload, null, 2)}
          </pre>
        </details>
      )}

      {showFeedback && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={pendingAction === "rework" ? "What needs to be changed..." : "Reason for rejection..."}
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={pendingAction === "rework" ? "default" : "destructive"}
              onClick={() => handleActionWithFeedback(pendingAction!)}
              disabled={isPending}
            >
              {pendingAction === "rework" ? "Send for Rework" : "Confirm Reject"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowFeedback(false); setPendingAction(null); setFeedback(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showFeedback && approval.approvalStatus === "pending" && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            size="sm"
            className="bg-green-700 hover:bg-green-600 text-white"
            onClick={() => onDecide("approved")}
            disabled={isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleActionWithFeedback("rework")}
            disabled={isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Rework
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleActionWithFeedback("rejected")}
            disabled={isPending}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function HitlApprovals() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [riskFilter, setRiskFilter] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([{ label: "HITL Approvals" }]);
  }, [setBreadcrumbs]);

  const { data: approvals, isLoading } = useQuery({
    queryKey: queryKeys.hitlApprovals.list(selectedCompanyId!),
    queryFn: () => hitlApprovalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: stats } = useQuery({
    queryKey: queryKeys.hitlApprovals.stats(selectedCompanyId!),
    queryFn: () => hitlApprovalsApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const decideMutation = useMutation({
    mutationFn: ({ issueId, action, feedback }: { issueId: string; action: "approved" | "rejected" | "rework"; feedback?: string }) =>
      hitlApprovalsApi.decide(selectedCompanyId!, issueId, action, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hitlApprovals.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hitlApprovals.stats(selectedCompanyId!) });
    },
  });

  const agentMap = new Map((agents ?? []).map((a) => [a.id, a.name]));

  const filtered = (approvals ?? []).filter((a) => {
    if (typeFilter && a.approvalType !== typeFilter) return false;
    if (riskFilter && a.riskTier !== riskFilter) return false;
    return true;
  });

  const pendingCount = stats?.reduce((sum, s) => s.approvalStatus === "pending" ? sum + s.count : sum, 0) ?? 0;

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">HITL Approvals</h2>
          {pendingCount > 0 && (
            <span className="rounded-full bg-yellow-500/20 text-yellow-500 px-2 py-0.5 text-[10px] font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="plan_approval">Plan Approval</option>
          <option value="output_review">Output Review</option>
          <option value="tool_use">Tool Use</option>
          <option value="build_tool">Build Tool</option>
          <option value="add_agent">Add Agent</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
        >
          <option value="">All risk tiers</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {/* Stats summary */}
      {stats && stats.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(
            stats.reduce<Record<string, number>>((acc, s) => {
              if (s.approvalStatus === "pending") {
                acc[s.approvalType] = (acc[s.approvalType] ?? 0) + s.count;
              }
              return acc;
            }, {}),
          ).map(([type, count]) => (
            <div key={type} className="rounded-md border border-border px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{APPROVAL_TYPE_LABELS[type] ?? type}:</span>{" "}
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No pending approvals.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((approval) => (
            <HitlApprovalCard
              key={approval.id}
              approval={approval}
              agentName={approval.assigneeAgentId ? agentMap.get(approval.assigneeAgentId) ?? null : null}
              onDecide={(action, feedback) =>
                decideMutation.mutate({ issueId: approval.id, action, feedback })
              }
              isPending={decideMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
