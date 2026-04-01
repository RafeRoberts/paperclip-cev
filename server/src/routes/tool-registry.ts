import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { toolRegistry } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";

export function toolRegistryRoutes(db: Db) {
  const router = Router();

  // List all tools for a company
  router.get("/companies/:companyId/tools", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const tools = await db
      .select()
      .from(toolRegistry)
      .where(eq(toolRegistry.companyId, companyId));
    res.json(tools);
  });

  // Register a new tool
  router.post("/companies/:companyId/tools", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { name, description, adapterType, endpointOrCmd, riskTier, paramsSchema, createdByAgentId } = req.body;

    if (!name || !adapterType || !endpointOrCmd || !riskTier) {
      res.status(400).json({ error: "name, adapterType, endpointOrCmd, and riskTier are required" });
      return;
    }

    if (!["low", "medium", "high"].includes(riskTier)) {
      res.status(400).json({ error: "riskTier must be low, medium, or high" });
      return;
    }

    const [tool] = await db
      .insert(toolRegistry)
      .values({
        companyId,
        name,
        description: description ?? null,
        adapterType,
        endpointOrCmd,
        riskTier,
        paramsSchema: paramsSchema ?? null,
        createdByAgentId: createdByAgentId ?? null,
      })
      .returning();

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "tool.registered",
      entityType: "tool",
      entityId: tool.id,
      details: { name, adapterType, riskTier },
    });

    res.status(201).json(tool);
  });

  // Get tool details
  router.get("/companies/:companyId/tools/:toolId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const toolId = req.params.toolId as string;
    assertCompanyAccess(req, companyId);

    const tool = await db
      .select()
      .from(toolRegistry)
      .where(and(eq(toolRegistry.id, toolId), eq(toolRegistry.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!tool) {
      res.status(404).json({ error: "Tool not found" });
      return;
    }

    res.json(tool);
  });

  // Update tool config/risk tier
  router.patch("/companies/:companyId/tools/:toolId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const toolId = req.params.toolId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const { name, description, riskTier, endpointOrCmd, paramsSchema } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (riskTier !== undefined) {
      if (!["low", "medium", "high"].includes(riskTier)) {
        res.status(400).json({ error: "riskTier must be low, medium, or high" });
        return;
      }
      updates.riskTier = riskTier;
    }
    if (endpointOrCmd !== undefined) updates.endpointOrCmd = endpointOrCmd;
    if (paramsSchema !== undefined) updates.paramsSchema = paramsSchema;

    const [updated] = await db
      .update(toolRegistry)
      .set(updates)
      .where(and(eq(toolRegistry.id, toolId), eq(toolRegistry.companyId, companyId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Tool not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "tool.updated",
      entityType: "tool",
      entityId: toolId,
      details: { updates: Object.keys(updates).filter((k) => k !== "updatedAt") },
    });

    res.json(updated);
  });

  // Deregister tool (board only)
  router.delete("/companies/:companyId/tools/:toolId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const toolId = req.params.toolId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const [deleted] = await db
      .delete(toolRegistry)
      .where(and(eq(toolRegistry.id, toolId), eq(toolRegistry.companyId, companyId)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Tool not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "tool.deregistered",
      entityType: "tool",
      entityId: toolId,
      details: { name: deleted.name },
    });

    res.json({ deleted: true });
  });

  return router;
}
