import { api } from "./client";

export interface Tool {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  adapterType: string;
  endpointOrCmd: string;
  riskTier: string;
  paramsSchema: Record<string, unknown> | null;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toolRegistryApi = {
  list: (companyId: string) =>
    api.get<Tool[]>(`/companies/${companyId}/tools`),
  get: (companyId: string, toolId: string) =>
    api.get<Tool>(`/companies/${companyId}/tools/${toolId}`),
  create: (companyId: string, data: {
    name: string;
    description?: string;
    adapterType: string;
    endpointOrCmd: string;
    riskTier: string;
    paramsSchema?: Record<string, unknown>;
    createdByAgentId?: string;
  }) => api.post<Tool>(`/companies/${companyId}/tools`, data),
  update: (companyId: string, toolId: string, data: Partial<{
    name: string;
    description: string;
    riskTier: string;
    endpointOrCmd: string;
    paramsSchema: Record<string, unknown>;
  }>) => api.patch<Tool>(`/companies/${companyId}/tools/${toolId}`, data),
  delete: (companyId: string, toolId: string) =>
    api.delete<{ deleted: boolean }>(`/companies/${companyId}/tools/${toolId}`),
};
