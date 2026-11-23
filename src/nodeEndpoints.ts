export function normalizeNodeEndpoints(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1000) {
    throw new Error("Node endpoints must be a list of at most 1000 addresses.");
  }
  const addresses = value.map(address => {
    if (typeof address !== "string" || !address.trim() || address.length > 4096 ||
        /[\u0000-\u001f\u007f]/.test(address)) {
      throw new Error("Each node endpoint must be nonblank text of at most 4096 characters, without control characters.");
    }
    return address.trim();
  });
  return [...new Set(addresses)];
}

export interface EndpointImportRow {
  address: string;
  typeId?: string;
  nodeAdded: boolean;
}

export interface EndpointImportResults {
  rows: EndpointImportRow[];
  unknownName?: string;
  warnings: string[];
}
