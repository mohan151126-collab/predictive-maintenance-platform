import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { api } from "./client";
import type { Machine, Plant, Sensor, SensorType } from "./types";

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
