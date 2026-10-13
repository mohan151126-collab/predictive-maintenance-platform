import { silentHub, type Hub } from "./hub.js";

let current: Hub = silentHub;

export function setHub(hub: Hub) {
  current = hub;
}

export function getHub(): Hub {
  return current;
}
