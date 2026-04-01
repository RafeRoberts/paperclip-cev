import type { Db } from "@paperclipai/db";
import { issues, approvalLog } from "@paperclipai/db";
import { eq } from "drizzle-orm";

export function feedbackLoop(db: Db) {
  return {
    /**
     * Create a rework task from a rejected/rework issue.
     *
     * 1. Creates new issue with parent_issue_id pointing to original
     * 2. rework_count = original.rework_count + 1
     * 3. Description includes original objective + feedback + corrections needed
     * 4. If rework_count >= max_rework → escalate instead of creating new task
     */
    createReworkTask: async (
      originalIssueId: string,
      feedback: string,
      decidedBy: string,
    ) => {
      const original = await db
        .select()
        .from(issues)
        .where(eq(issues.id, originalIssueId))
        .then((rows) => rows[0] ?? null);

      if (!original) throw new Error(`Issue ${originalIssueId} not found`);

      const newReworkCount = original.reworkCount + 1;

      // Check for escalation
      if (newReworkCount >= original.maxRework) {
        // Escalate — update original issue, do NOT create new task
        await db
          .update(issues)
          .set({
            approvalStatus: "escalated",
            feedback,
            decidedBy,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(issues.id, originalIssueId));

        await db.insert(approvalLog).values({
          companyId: original.companyId,
          issueId: originalIssueId,
          approvalType: original.approvalType,
          action: "escalated",
          decidedBy,
          feedback,
          riskTier: original.riskTier,
          reworkCount: newReworkCount,
        });

        return { escalated: true, issueId: originalIssueId };
      }

      // Create rework task
      const reworkDescription = [
        `## Rework Task (Attempt ${newReworkCount + 1})`,
        "",
        "### Original Objective",
        original.title,
        original.description ?? "",
        "",
        "### Feedback / Corrections Needed",
        feedback,
      ].join("\n");

      const [reworkIssue] = await db
        .insert(issues)
        .values({
          companyId: original.companyId,
          projectId: original.projectId,
          goalId: original.goalId,
          parentIssueId: originalIssueId,
          title: `[Rework] ${original.title}`,
          description: reworkDescription,
          status: "backlog",
          priority: original.priority,
          approvalType: original.approvalType,
          approvalStatus: "pending",
          riskTier: original.riskTier,
          actionType: original.actionType,
          actionPayload: original.actionPayload,
          reworkCount: newReworkCount,
          maxRework: original.maxRework,
          originKind: "rework",
          originId: originalIssueId,
          requestDepth: original.requestDepth,
        })
        .returning();

      await db.insert(approvalLog).values({
        companyId: original.companyId,
        issueId: reworkIssue.id,
        approvalType: original.approvalType,
        action: "rework",
        decidedBy,
        feedback,
        riskTier: original.riskTier,
        reworkCount: newReworkCount,
      });

      return { escalated: false, issueId: reworkIssue.id };
    },

    /**
     * Get the full rework chain for an issue.
     * Follows parentIssueId links back to the original.
     */
    getReworkChain: async (issueId: string) => {
      type IssueRow = typeof issues.$inferSelect;
      const chain: IssueRow[] = [];
      let currentId: string | null = issueId;

      while (currentId) {
        const row: IssueRow | null = await db
          .select()
          .from(issues)
          .where(eq(issues.id, currentId))
          .then((rows) => rows[0] ?? null);

        if (!row) break;
        chain.unshift(row);
        currentId = row.parentIssueId;
      }

      return chain;
    },
  };
}
