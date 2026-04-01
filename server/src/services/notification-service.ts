import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Notification event types
// ---------------------------------------------------------------------------

export type NotificationEventType =
  | "plan_pending_approval"
  | "output_pending_review"
  | "high_risk_tool_pending"
  | "build_tool_pending"
  | "add_agent_pending"
  | "medium_risk_tool_used"
  | "rework_created"
  | "escalation_triggered"
  | "budget_warning"
  | "agent_promotion_eligible";

export interface NotificationPayload {
  companyId: string;
  issueId?: string;
  agentId?: string;
  agentName?: string;
  title?: string;
  message: string;
  riskTier?: string;
  approvalType?: string;
  metadata?: Record<string, unknown>;
}

type ChannelType = "dashboard" | "slack" | "email" | "n8n";

interface NotificationConfig {
  slack_webhook_url?: string;
  email_recipients?: string[];
  n8n_webhook_url?: string;
  channels?: Partial<Record<NotificationEventType, ChannelType[]>>;
}

const DEFAULT_CHANNELS: Record<NotificationEventType, ChannelType[]> = {
  plan_pending_approval: ["dashboard", "slack"],
  output_pending_review: ["dashboard", "slack"],
  high_risk_tool_pending: ["dashboard", "slack", "email"],
  build_tool_pending: ["dashboard", "slack"],
  add_agent_pending: ["dashboard", "slack"],
  medium_risk_tool_used: ["dashboard"],
  rework_created: ["dashboard", "slack"],
  escalation_triggered: ["dashboard", "slack", "email"],
  budget_warning: ["dashboard", "slack"],
  agent_promotion_eligible: ["dashboard"],
};

// ---------------------------------------------------------------------------
// In-memory dashboard notification store (per company)
// ---------------------------------------------------------------------------

const dashboardNotifications = new Map<string, NotificationPayload[]>();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function notificationService(db: Db) {
  async function getNotificationConfig(companyId: string): Promise<NotificationConfig> {
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);

    if (!company) return {};

    // Notification config is stored in company metadata (settings JSON)
    const meta = (company as unknown as Record<string, unknown>).metadata as Record<string, unknown> | null;
    return (meta?.notifications as NotificationConfig) ?? {};
  }

  function getChannels(eventType: NotificationEventType, config: NotificationConfig): ChannelType[] {
    return config.channels?.[eventType] ?? DEFAULT_CHANNELS[eventType] ?? ["dashboard"];
  }

  async function sendSlack(webhookUrl: string, payload: NotificationPayload, eventType: NotificationEventType): Promise<void> {
    try {
      const riskEmoji = payload.riskTier === "high" ? "🔴" : payload.riskTier === "medium" ? "🟡" : "🟢";
      const text = [
        `${riskEmoji} *${eventType.replace(/_/g, " ").toUpperCase()}*`,
        payload.title ? `*${payload.title}*` : null,
        payload.message,
        payload.agentName ? `Agent: ${payload.agentName}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      // Slack delivery failures are non-fatal
    }
  }

  async function sendN8n(webhookUrl: string, payload: NotificationPayload, eventType: NotificationEventType): Promise<void> {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType, ...payload }),
      });
    } catch {
      // n8n delivery failures are non-fatal
    }
  }

  function pushDashboard(companyId: string, payload: NotificationPayload): void {
    const existing = dashboardNotifications.get(companyId) ?? [];
    existing.push(payload);
    // Keep last 100 notifications per company
    if (existing.length > 100) existing.shift();
    dashboardNotifications.set(companyId, existing);
  }

  return {
    /**
     * Send a notification across all configured channels for the event type.
     */
    notify: async (eventType: NotificationEventType, payload: NotificationPayload): Promise<void> => {
      const config = await getNotificationConfig(payload.companyId);
      const channels = getChannels(eventType, config);

      const promises: Promise<void>[] = [];

      for (const channel of channels) {
        switch (channel) {
          case "dashboard":
            pushDashboard(payload.companyId, payload);
            break;
          case "slack":
            if (config.slack_webhook_url) {
              promises.push(sendSlack(config.slack_webhook_url, payload, eventType));
            }
            break;
          case "n8n":
            if (config.n8n_webhook_url) {
              promises.push(sendN8n(config.n8n_webhook_url, payload, eventType));
            }
            break;
          case "email":
            // Email channel is a placeholder — integrators configure via n8n or external service
            break;
        }
      }

      await Promise.allSettled(promises);
    },

    /**
     * Get pending dashboard notifications for a company.
     */
    getDashboardNotifications: (companyId: string): NotificationPayload[] => {
      return dashboardNotifications.get(companyId) ?? [];
    },

    /**
     * Clear dashboard notifications for a company.
     */
    clearDashboardNotifications: (companyId: string): void => {
      dashboardNotifications.delete(companyId);
    },
  };
}
