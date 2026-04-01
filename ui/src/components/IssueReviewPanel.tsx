import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { hitlApprovalsApi } from "../api/hitl-approvals";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import type { Issue } from "@paperclipai/shared";

const APPROVAL_TYPE_LABELS: Record<string, string> = {
  plan_approval: "Plan requires approval before execution begins",
  output_review: "Completed work requires review before acceptance",
  tool_use: "Tool use requires approval",
  build_tool: "New tool creation requires board approval",
  add_agent: "New agent creation requires board approval",
  none: "",
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
  medium: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400",
  high: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
};

export function IssueReviewPanel({ issue }: { issue: Issue }) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [pendingAction, setPendingAction] = useState<"rejected" | "rework" | null>(null);

  // Don't render if no approval is pending
  if (!issue.approvalStatus || issue.approvalStatus === "approved" || issue.approvalStatus === "auto_approved") {
    if (issue.approvalType === "none") return null;
    if (!issue.approvalStatus) return null;
  }

  const isPending = issue.approvalStatus === "pending";
  const isEscalated = issue.approvalStatus === "escalated";
  const isRework = issue.approvalStatus === "rework";

  const decideMutation = useMutation({
    mutationFn: ({ action, fb }: { action: "approved" | "rejected" | "rework"; fb?: string }) =>
      hitlApprovalsApi.decide(selectedCompanyId!, issue.id, action, fb),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.hitlApprovals.list(selectedCompanyId!) });
      setShowFeedback(false);
      setFeedback("");
      setPendingAction(null);
    },
  });

  const handleActionWithFeedback = (action: "rejected" | "rework") => {
    if (!showFeedback) {
      setPendingAction(action);
      setShowFeedback(true);
      return;
    }
    decideMutation.mutate({ action, fb: feedback || undefined });
  };

  const riskStyle = issue.riskTier ? RISK_STYLES[issue.riskTier] : "";
  const panelStyle = isEscalated
    ? "border-red-500/50 bg-red-500/5"
    : isPending
      ? "border-yellow-500/50 bg-yellow-500/5"
      : isRework
        ? "border-amber-500/50 bg-amber-500/5"
        : "border-border";

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${panelStyle}`}>
      <div className="flex items-center gap-2">
        {isEscalated ? (
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-yellow-600 shrink-0" />
        )}
        <span className="text-sm font-medium">
          {isEscalated ? "Escalated — Human intervention required" : "Review Required"}
        </span>
        {issue.riskTier && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${riskStyle}`}>
            {issue.riskTier} risk
          </span>
        )}
        {issue.reworkCount > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <RotateCcw className="h-3 w-3" />
            Rework #{issue.reworkCount} of {issue.maxRework}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {APPROVAL_TYPE_LABELS[issue.approvalType] ?? `Approval required: ${issue.approvalType}`}
      </p>

      {issue.feedback && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium">Previous feedback: </span>
          {issue.feedback}
        </div>
      )}

      {issue.actionPayload && Object.keys(issue.actionPayload).length > 0 && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
            View action payload
          </summary>
          <pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto max-h-40">
            {JSON.stringify(issue.actionPayload, null, 2)}
          </pre>
        </details>
      )}

      {showFeedback && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={
              pendingAction === "rework"
                ? "What needs to be changed..."
                : "Reason for rejection..."
            }
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={pendingAction === "rework" ? "default" : "destructive"}
              onClick={() => handleActionWithFeedback(pendingAction!)}
              disabled={decideMutation.isPending}
            >
              {pendingAction === "rework" ? "Send for Rework" : "Confirm Reject"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowFeedback(false);
                setPendingAction(null);
                setFeedback("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(isPending || isRework) && !showFeedback && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="bg-green-700 hover:bg-green-600 text-white"
            onClick={() => decideMutation.mutate({ action: "approved" })}
            disabled={decideMutation.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {issue.approvalType === "output_review" ? "Accept Output" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleActionWithFeedback("rework")}
            disabled={decideMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Rework
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleActionWithFeedback("rejected")}
            disabled={decideMutation.isPending}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
