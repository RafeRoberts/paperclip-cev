import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toolRegistryApi } from "../api/tool-registry";
import type { Tool } from "../api/tool-registry";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, Trash2, Pencil } from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  low: "bg-green-500/20 text-green-600",
  medium: "bg-yellow-500/20 text-yellow-600",
  high: "bg-red-500/20 text-red-600",
};

function ToolCard({
  tool,
  onDelete,
  onUpdateRisk,
  isDeleting,
}: {
  tool: Tool;
  onDelete: () => void;
  onUpdateRisk: (riskTier: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{tool.name}</span>
            <Badge variant="outline" className="text-[10px]">{tool.adapterType}</Badge>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${RISK_COLORS[tool.riskTier] ?? ""}`}>
              {tool.riskTier}
            </span>
          </div>
          {tool.description && (
            <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
            {tool.endpointOrCmd}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <select
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
            value={tool.riskTier}
            onChange={(e) => onUpdateRisk(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ToolRegistry() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTool, setNewTool] = useState({
    name: "",
    description: "",
    adapterType: "http_agent",
    endpointOrCmd: "",
    riskTier: "medium",
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Tool Registry" }]);
  }, [setBreadcrumbs]);

  const { data: tools, isLoading } = useQuery({
    queryKey: queryKeys.toolRegistry.list(selectedCompanyId!),
    queryFn: () => toolRegistryApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newTool) => toolRegistryApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolRegistry.list(selectedCompanyId!) });
      setShowCreate(false);
      setNewTool({ name: "", description: "", adapterType: "http_agent", endpointOrCmd: "", riskTier: "medium" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (toolId: string) => toolRegistryApi.delete(selectedCompanyId!, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolRegistry.list(selectedCompanyId!) });
    },
  });

  const updateRiskMutation = useMutation({
    mutationFn: ({ toolId, riskTier }: { toolId: string; riskTier: string }) =>
      toolRegistryApi.update(selectedCompanyId!, toolId, { riskTier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolRegistry.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tool Registry</h2>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Register Tool
        </Button>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground"
              placeholder="Tool name"
              value={newTool.name}
              onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
            />
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              value={newTool.adapterType}
              onChange={(e) => setNewTool({ ...newTool, adapterType: e.target.value })}
            >
              <option value="http_agent">HTTP Agent</option>
              <option value="process_agent">Process Agent</option>
            </select>
            <input
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground col-span-2"
              placeholder="Endpoint URL or command"
              value={newTool.endpointOrCmd}
              onChange={(e) => setNewTool({ ...newTool, endpointOrCmd: e.target.value })}
            />
            <input
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground"
              placeholder="Description (optional)"
              value={newTool.description}
              onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
            />
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              value={newTool.riskTier}
              onChange={(e) => setNewTool({ ...newTool, riskTier: e.target.value })}
            >
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate(newTool)}
              disabled={!newTool.name || !newTool.endpointOrCmd || createMutation.isPending}
            >
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(tools ?? []).length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wrench className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No tools registered yet.</p>
        </div>
      )}

      {(tools ?? []).length > 0 && (
        <div className="grid gap-3">
          {(tools ?? []).map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onDelete={() => deleteMutation.mutate(tool.id)}
              onUpdateRisk={(riskTier) => updateRiskMutation.mutate({ toolId: tool.id, riskTier })}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
