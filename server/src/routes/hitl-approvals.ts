import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { approvalService as hitlApprovalService } from "../services/approval-service.js";
import { feedbackLoop } from "../services/feedback-loop.js";
import { notificationService } from "../services/notification-service.js";
import { issueService, heartbeatService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function hitlApprovalRoutes(db: Db) {
  const router = Router();
  const svc = hitlApprovalService(db);
  const feedback = feedbackLoop(db);
  const notifications = notificationService(db);
  const issueSvc = issueService(db);
  const heartbeat = heartbeatService(db);

  // List pending HITL approvals for a company
  router.get("/companies/:companyId/hitl-approvals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const filters: { approvalType?: string; riskTier?: string } = {};
    if (req.query.approvalType) filters.approvalType = req.query.approvalType as string;
    if (req.query.riskTier) filters.riskTier = req.query.riskTier as string;
    const result = await svc.getPendingApprovals(companyId, filters);
    res.json(result);
  });

  // Get approval details + history for a specific issue
  router.get("/companies/:companyId/hitl-approvals/:issueId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertCompanyAccess(req, companyId);
    const history = await svc.getApprovalHistory(issueId);
    res.json({ issueId, history });
  });

  // Process a human decision (approve / reject / rework)
  router.post("/companies/:companyId/hitl-approvals/:issueId/decide", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const { action, feedback: feedbackText } = req.body as {
      action: "approved" | "rejected" | "rework";
      feedback?: string;
    };

    if (!action || !["approved", "rejected", "rework"].includes(action)) {
      res.status(400).json({ error: "action must be one of: approved, rejected, rework" });
      return;
    }

    const actor = getActorInfo(req);
    const decidedBy = actor.actorId ?? "board";

    if (action === "approved") {
      const updated = await svc.processDecision(issueId, "approved", feedbackText ?? null, decidedBy);
      if (!updated) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }

      // Transition the issue based on approval type
      if (updated.approvalType === "plan_approval") {
        await issueSvc.update(issueId, { status: "in_progress" });
      } else if (updated.approvalType === "output_review") {
        await issueSvc.update(issueId, { status: "done" });
      } else if (updated.approvalType === "tool_use" || updated.approvalType === "build_tool" || updated.approvalType === "add_agent") {
        await issueSvc.update(issueId, { status: "in_progress" });
      }

      // Wake the assigned agent if applicable
      if (updated.assigneeAgentId) {
        try {
          await heartbeat.wakeup(updated.assigneeAgentId, {
            source: "automation",
            triggerDetail: "system",
            reason: "hitl_approved",
            payload: {
              issueId,
              approvalType: updated.approvalType,
              approvalStatus: "approved",
            },
            requestedByActorType: "user",
            requestedByActorId: decidedBy,
            contextSnapshot: {
              source: "hitl.approved",
              issueId,
              taskId: issueId,
              wakeReason: "hitl_approved",
            },
          });
        } catch {
          // Non-fatal — agent will pick up on next heartbeat
        }
      }

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: decidedBy,
        action: "hitl.approved",
        entityType: "issue",
        entityId: issueId,
        details: { approvalType: updated.approvalType },
      });

      res.json(updated);
      return;
    }

    if (action === "rework") {
      await svc.processDecision(issueId, "rework", feedbackText ?? null, decidedBy);
      const reworkResult = await feedback.createReworkTask(issueId, feedbackText ?? "Rework requested", decidedBy);

      if (reworkResult.escalated) {
        await notifications.notify("escalation_triggered", {
          companyId,
          issueId,
          message: `Max rework cycles reached for issue. Escalation required.`,
        });
      } else {
        await notifications.notify("rework_created", {
          companyId,
          issueId: reworkResult.issueId,
          message: `Rework task created from issue ${issueId}`,
        });
      }

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: decidedBy,
        action: reworkResult.escalated ? "hitl.escalated" : "hitl.rework",
        entityType: "issue",
        entityId: issueId,
        details: { newIssueId: reworkResult.issueId, escalated: reworkResult.escalated },
      });

      res.json(reworkResult);
      return;
    }

    if (action === "rejected") {
      const updated = await svc.processDecision(issueId, "rejected", feedbackText ?? null, decidedBy);
      await issueSvc.update(issueId, { status: "cancelled" });

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: decidedBy,
        action: "hitl.rejected",
        entityType: "issue",
        entityId: issueId,
        details: { approvalType: updated?.approvalType },
      });

      res.json(updated);
      return;
    }
  });

  // Get approval stats for dashboard
  router.get("/companies/:companyId/hitl-approvals/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const stats = await svc.getApprovalStats(companyId);
    res.json(stats);
  });

  // Get rework chain for an issue
  router.get("/companies/:companyId/hitl-approvals/:issueId/rework-chain", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertCompanyAccess(req, companyId);
    const chain = await feedback.getReworkChain(issueId);
    res.json(chain);
  });

  return router;
}
