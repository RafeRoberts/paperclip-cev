import type { Db } from "@paperclipai/db";
import { toolRegistry } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";

const DANGEROUS_KEYWORDS = ["delete", "send", "transfer", "execute", "drop", "remove", "destroy", "kill", "force"];

export type RiskTier = "low" | "medium" | "high";

export function riskClassifier(db: Db) {
  return {
    /**
     * Classify the risk tier for a tool use action.
     *
     * Rules:
     * 1. If tool exists in tool_registry → use stored risk_tier
     * 2. If tool is unknown → default to "high"
     * 3. If action_payload.params contains dangerous keywords → bump up one tier
     * 4. If agent's remaining budget is <20% → bump up one tier
     */
    classifyToolRisk: async (
      companyId: string,
      toolName: string,
      params?: Record<string, unknown>,
      budgetRemainingPct?: number,
    ): Promise<RiskTier> => {
      // 1. Look up tool in registry
      const tool = await db
        .select()
        .from(toolRegistry)
        .where(and(eq(toolRegistry.companyId, companyId), eq(toolRegistry.name, toolName)))
        .then((rows) => rows[0] ?? null);

      let tier: RiskTier = tool ? (tool.riskTier as RiskTier) : "high";

      // 3. Check for dangerous keywords in params
      if (params) {
        const paramsStr = JSON.stringify(params).toLowerCase();
        const hasDangerous = DANGEROUS_KEYWORDS.some((kw) => paramsStr.includes(kw));
        if (hasDangerous) {
          tier = bumpTier(tier);
        }
      }

      // 4. Check budget remaining
      if (budgetRemainingPct != null && budgetRemainingPct < 20) {
        tier = bumpTier(tier);
      }

      return tier;
    },
  };
}

function bumpTier(tier: RiskTier): RiskTier {
  if (tier === "low") return "medium";
  return "high";
}
