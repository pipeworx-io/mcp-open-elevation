interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Open-Elevation MCP — terrain elevation by lat/lon (no auth)
 *
 * Free, no key. Pairs with `weather`, `nws`, `overpass`, `nominatim` for
 * terrain-aware queries: hillclimb routing, watershed analysis, slope.
 *
 * API: https://open-elevation.com
 *
 * Tools:
 * - get_elevation:  single-point lookup (metres above sea level)
 * - get_elevations: batch lookup for multiple lat/lons
 */


const BASE_URL = 'https://api.open-elevation.com/api/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_elevation',
    description: 'Elevation in metres above mean sea level for a single lat/lon.',
    inputSchema: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: 'Latitude' },
        longitude: { type: 'number', description: 'Longitude' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'get_elevations',
    description:
      'Batch elevation lookup. Pass an array of {latitude, longitude} points (up to 1,000 per call recommended). Returns each with elevation in metres.',
    inputSchema: {
      type: 'object',
      properties: {
        locations: {
          type: 'array',
          description: 'Array of {latitude, longitude} objects',
        },
      },
      required: ['locations'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_elevation':
      return getElevation(args.latitude as number, args.longitude as number);
    case 'get_elevations':
      return getElevations(args.locations as { latitude: number; longitude: number }[]);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface ElevationResult {
  latitude?: number;
  longitude?: number;
  elevation?: number;
}

async function getElevation(lat: number, lon: number) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('latitude and longitude (numbers) are required');
  }
  const url = `${BASE_URL}/lookup?locations=${lat},${lon}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Open-Elevation error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: ElevationResult[] };
  const r = data.results?.[0];
  return {
    latitude: r?.latitude ?? lat,
    longitude: r?.longitude ?? lon,
    elevation_m: r?.elevation ?? null,
  };
}

async function getElevations(locations: { latitude: number; longitude: number }[]) {
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new Error('locations must be a non-empty array of {latitude, longitude}');
  }
  const res = await fetch(`${BASE_URL}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ locations }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Open-Elevation error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: ElevationResult[] };
  return {
    count: data.results?.length ?? 0,
    results: (data.results ?? []).map((r) => ({
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      elevation_m: r.elevation ?? null,
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
