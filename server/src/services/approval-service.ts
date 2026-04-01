import type { Db } from "@paperclipai/db";
import { issues, approvalLog } from "@paperclipai/db";
import { eq, and, desc, sql } from "drizzle-orm";

export function approvalService(db: Db) {
  return {
    /**
     * Submit an issue for HITL approval.
     */
    submitForApproval: async (
      issueId: string,
      approvalType: string,
      actionPayload: Record<string, unknown> | null,
      riskTier: string | null,
    ) => {
      const [updated] = await db
        .update(issues)
        .set({
          approvalType,
          approvalStatus: "pending",
          riskTier,
          actionPayload,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, issueId))
        .returning();

      if (updated) {
        await db.insert(approvalLog).values({
          companyId: updated.companyId,
          issueId,
          approvalType,
          action: "submitted",
          riskTier,
          reworkCount: updated.reworkCount,
        });
      }

      return updated ?? null;
    },

    /**
     * Process a human decision on a pending approval.
     */
    processDecision: async (
      issueId: string,
      action: "approved" | "rejected" | "rework",
      feedback: string | null,
      decidedBy: string,
    ) => {
      const issue = await db
        .select()
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0] ?? null);

      if (!issue) throw new Error(`Issue ${issueId} not found`);

      const now = new Date();
      const statusMap: Record<string, string> = {
        approved: "approved",
        rejected: "rejected",
        rework: "rework",
      };

      const [updated] = await db
        .update(issues)
        .set({
          approvalStatus: statusMap[action],
          feedback: feedback ?? issue.feedback,
          decidedBy,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(issues.id, issueId))
        .returning();

      await db.insert(approvalLog).values({
        companyId: issue.companyId,
        issueId,
        approvalType: issue.approvalType,
        action,
        decidedBy,
        feedback,
        riskTier: issue.riskTier,
        reworkCount: issue.reworkCount,
      });

      return updated ?? null;
    },

    /**
     * Auto-approve low-risk tool use without human intervention.
     */
    autoApproveIfEligible: async (issueId: string): Promise<boolean> => {
      const issue = await db
        .select()
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0] ?? null);

      if (!issue) return false;
      if (issue.riskTier !== "low") return false;
      if (issue.approvalType !== "tool_use") return false;

      await db
        .update(issues)
        .set({
          approvalStatus: "auto_approved",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issues.id, issueId));

      await db.insert(approvalLog).values({
        companyId: issue.companyId,
        issueId,
        approvalType: issue.approvalType,
        action: "auto_approved",
        riskTier: issue.riskTier,
        reworkCount: issue.reworkCount,
      });

      return true;
    },

    /**
     * Check if max rework cycles have been exceeded (triggers escalation).
     */
    checkEscalation: async (issueId: string): Promise<boolean> => {
      const issue = await db
        .select()
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0] ?? null);

      if (!issue) return false;
      return issue.reworkCount >= issue.maxRework;
    },

    /**
     * Get all pending approvals for a company, with optional filters.
     */
    getPendingApprovals: async (
      companyId: string,
      filters?: { approvalType?: string; riskTier?: string },
    ) => {
      const conditions = [
        eq(issues.companyId, companyId),
        eq(issues.approvalStatus, "pending"),
      ];

      if (filters?.approvalType) {
        conditions.push(eq(issues.approvalType, filters.approvalType));
      }
      if (filters?.riskTier) {
        conditions.push(eq(issues.riskTier, filters.riskTier));
      }

      return db
        .select()
        .from(issues)
        .where(and(...conditions))
        .orderBy(desc(issues.createdAt));
    },

    /**
     * Get approval history for a specific issue.
     */
    getApprovalHistory: async (issueId: string) => {
      return db
        .select()
        .from(approvalLog)
        .where(eq(approvalLog.issueId, issueId))
        .orderBy(desc(approvalLog.createdAt));
    },

    /**
     * Get approval stats for a company.
     */
    getApprovalStats: async (companyId: string) => {
      const rows = await db
        .select({
          approvalType: issues.approvalType,
          approvalStatus: issues.approvalStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            sql`${issues.approvalType} != 'none'`,
          ),
        )
        .groupBy(issues.approvalType, issues.approvalStatus);

      return rows;
    },
  };
}
