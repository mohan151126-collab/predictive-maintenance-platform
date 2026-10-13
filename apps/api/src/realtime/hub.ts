import type { AlertPayload, MachineHealthPayload } from "./dto.js";
import type { ReadingEvent } from "./events.js";

export interface Hub {
  healthChanged(orgId: string, payload: MachineHealthPayload): void;
  alertChanged(orgId: string, payload: AlertPayload): void;
  reading(reading: ReadingEvent): void;
}

export const silentHub: Hub = {
  healthChanged() {},
  alertChanged() {},
  reading() {},
};
