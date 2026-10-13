import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  Alert,
  Machine,
  Plant,
  Role,
  Sensor,
  SensorType,
  TeamUser,
  TelemetrySeries,
  WorkOrder,
  WorkOrderPriority,
} from "./types";

export interface PlantInput {
  name: string;
  location: string;
  timezone: string;
}

export interface MachineInput {
  plantId: string;
  name: string;
  type: string;
  modelNumber: string;
  installedAt?: string;
  downtimeCostPerHour: number;
}

export interface ThresholdsInput {
  min?: number;
  max?: number;
  rateOfChange?: number;
}

export interface SensorInput {
  machineId: string;
  name: string;
  type: SensorType;
  unit: string;
  samplingHz: number;
  thresholds: ThresholdsInput;
}

function useInvalidating<TVars, TData>(
  run: (vars: TVars) => Promise<TData>,
  key: QueryKey,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export const usePlants = () =>
  useQuery({ queryKey: ["plants"], queryFn: () => api<Plant[]>("/api/plants") });

export const usePlant = (id: string) =>
  useQuery({
    queryKey: ["plants", id],
    queryFn: () => api<Plant>(`/api/plants/${id}`),
    enabled: id !== "",
  });

export const useCreatePlant = () =>
  useInvalidating(
    (input: PlantInput) =>
      api<Plant>("/api/plants", { method: "POST", body: input }),
    ["plants"],
  );

export const useUpdatePlant = () =>
  useInvalidating(
    ({ id, input }: { id: string; input: Partial<PlantInput> }) =>
      api<Plant>(`/api/plants/${id}`, { method: "PATCH", body: input }),
    ["plants"],
  );

export const useDeletePlant = () =>
  useInvalidating(
    (id: string) => api<void>(`/api/plants/${id}`, { method: "DELETE" }),
    ["plants"],
  );

export const useMachines = (plantId: string) =>
  useQuery({
    queryKey: ["machines", "list", plantId],
    queryFn: () => api<Machine[]>(`/api/machines?plantId=${plantId}`),
    enabled: plantId !== "",
  });

export const useMachine = (id: string) =>
  useQuery({
    queryKey: ["machines", "detail", id],
    queryFn: () => api<Machine>(`/api/machines/${id}`),
    enabled: id !== "",
  });

export const useCreateMachine = () =>
  useInvalidating(
    (input: MachineInput) =>
      api<Machine>("/api/machines", { method: "POST", body: input }),
    ["machines"],
  );

export const useUpdateMachine = () =>
  useInvalidating(
    ({ id, input }: { id: string; input: Partial<Omit<MachineInput, "plantId">> }) =>
      api<Machine>(`/api/machines/${id}`, { method: "PATCH", body: input }),
    ["machines"],
  );

export const useDeleteMachine = () =>
  useInvalidating(
    (id: string) => api<void>(`/api/machines/${id}`, { method: "DELETE" }),
    ["machines"],
  );

export const useSensors = (machineId: string) =>
  useQuery({
    queryKey: ["sensors", "list", machineId],
    queryFn: () => api<Sensor[]>(`/api/sensors?machineId=${machineId}`),
    enabled: machineId !== "",
  });

export const useCreateSensor = () =>
  useInvalidating(
    (input: SensorInput) =>
      api<Sensor>("/api/sensors", { method: "POST", body: input }),
    ["sensors"],
  );

export const useUpdateSensor = () =>
  useInvalidating(
    ({ id, input }: { id: string; input: Partial<Omit<SensorInput, "machineId">> }) =>
      api<Sensor>(`/api/sensors/${id}`, { method: "PATCH", body: input }),
    ["sensors"],
  );

export const useDeleteSensor = () =>
  useInvalidating(
    (id: string) => api<void>(`/api/sensors/${id}`, { method: "DELETE" }),
    ["sensors"],
  );

export const useAlerts = (options: { status?: string; machineId?: string } = {}) => {
  const status = options.status ?? "active";
  const params = new URLSearchParams({ status });
  if (options.machineId) params.set("machineId", options.machineId);
  return useQuery({
    queryKey: ["alerts", status, options.machineId ?? null],
    queryFn: () => api<Alert[]>(`/api/alerts?${params.toString()}`),
  });
};

export const useTelemetry = (machineId: string, minutes: number) =>
  useQuery({
    queryKey: ["telemetry", machineId, minutes],
    queryFn: () =>
      api<{ sensors: TelemetrySeries[] }>(`/api/machines/${machineId}/telemetry?minutes=${minutes}`),
    enabled: machineId !== "",
    staleTime: 0,
    refetchOnMount: "always",
  });

function useInvalidatingMany<TVars, TData>(
  run: (vars: TVars) => Promise<TData>,
  keys: QueryKey[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useAllMachines = () =>
  useQuery({
    queryKey: ["machines", "list", "all"],
    queryFn: () => api<Machine[]>("/api/machines"),
  });

export const useAcknowledgeAlert = () =>
  useInvalidating(
    (id: string) => api<Alert>(`/api/alerts/${id}/acknowledge`, { method: "POST" }),
    ["alerts"],
  );

export const useDismissAlert = () =>
  useInvalidating(
    ({ id, reason }: { id: string; reason: string }) =>
      api<Alert>(`/api/alerts/${id}/dismiss`, { method: "POST", body: { reason } }),
    ["alerts"],
  );

export const useWorkOrders = (
  options: { status?: string; machineId?: string; mine?: boolean } = {},
) => {
  const status = options.status ?? "active";
  const params = new URLSearchParams({ status });
  if (options.machineId) params.set("machineId", options.machineId);
  if (options.mine) params.set("mine", "true");
  return useQuery({
    queryKey: ["workOrders", status, options.machineId ?? null, options.mine ?? false],
    queryFn: () => api<WorkOrder[]>(`/api/work-orders?${params.toString()}`),
    staleTime: 0,
    refetchOnMount: "always",
  });
};

export interface WorkOrderInput {
  machineId: string;
  alertId?: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  assigneeId?: string;
  dueAt?: string;
}

export interface CompletionInput {
  actionTaken: string;
  partsReplaced?: string;
  downtimeMinutes?: number;
}

export const useCreateWorkOrder = () =>
  useInvalidatingMany(
    (input: WorkOrderInput) =>
      api<WorkOrder>("/api/work-orders", { method: "POST", body: input }),
    [["workOrders"], ["alerts"]],
  );

export const useStartWorkOrder = () =>
  useInvalidating(
    (id: string) => api<WorkOrder>(`/api/work-orders/${id}/start`, { method: "POST" }),
    ["workOrders"],
  );

export const useCompleteWorkOrder = () =>
  useInvalidating(
    ({ id, input }: { id: string; input: CompletionInput }) =>
      api<WorkOrder>(`/api/work-orders/${id}/complete`, { method: "POST", body: input }),
    ["workOrders"],
  );

export const useCancelWorkOrder = () =>
  useInvalidatingMany(
    (id: string) => api<WorkOrder>(`/api/work-orders/${id}/cancel`, { method: "POST" }),
    [["workOrders"], ["alerts"]],
  );

export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: () => api<TeamUser[]>("/api/users"), enabled });

export const useCreateUser = () =>
  useInvalidating(
    (input: { email: string; role: Role; password: string }) =>
      api<TeamUser>("/api/users", { method: "POST", body: input }),
    ["users"],
  );

export const useUpdateUserRole = () =>
  useInvalidating(
    ({ id, role }: { id: string; role: Role }) =>
      api<TeamUser>(`/api/users/${id}`, { method: "PATCH", body: { role } }),
    ["users"],
  );
