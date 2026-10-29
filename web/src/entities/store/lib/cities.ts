import type { Store } from '../model/schemas';
import { matchesWords, words } from './words';

// A store's point as `[longitude, latitude]`, the map's order.
export type CityPoint = readonly [lng: number, lat: number];

export interface City {
  name: string;
  points: readonly CityPoint[];
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

const FIRST_CITIES = ['Москва', 'Санкт-Петербург'];
const EARTH_RADIUS_KM = 6371;

// The table's `city` without the leading «г. » and without what follows the first comma
// (spec 0026 C1): «г. Видное, пос. совхоза им. Ленина» → «Видное».
export function cityName(raw: string): string {
  return raw
    .split(',')[0]!
    .replace(/^\s*г\.\s+/iu, '')
    .trim();
}

function cityOrder(a: City, b: City): number {
  const first = (city: City) => {
    const index = FIRST_CITIES.indexOf(city.name);
    return index === -1 ? FIRST_CITIES.length : index;
  };
  return first(a) - first(b) || a.name.localeCompare(b.name, 'ru');
}

// One city per distinct name with its stores' points, Москва and Санкт-Петербург first, the rest
// alphabetical (C4).
export function storeCities(stores: readonly Store[]): City[] {
  const byName = new Map<string, CityPoint[]>();
  for (const store of stores) {
    const name = cityName(store.city);
    const points = byName.get(name) ?? [];
    points.push([store.longitude, store.latitude]);
    byName.set(name, points);
  }
  return [...byName].map(([name, points]) => ({ name, points })).sort(cityOrder);
}

// The stores of one city, in the api's order.
export function storesOfCity(stores: readonly Store[], name: string): Store[] {
  return stores.filter((store) => cityName(store.city) === name);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// The great-circle distance between a position and a point, in kilometres.
function distanceKm(position: GeoPosition, [lng, lat]: CityPoint): number {
  const dLat = radians(lat - position.latitude);
  const dLng = radians(lng - position.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(position.latitude)) * Math.cos(radians(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The city of the nearest store, or `null` when no store is within `maxKm` (C0, C2). Nothing of
// `position` is kept.
export function nearestCity(
  cities: readonly City[],
  position: GeoPosition,
  maxKm = 100,
): string | null {
  let nearest: string | null = null;
  let best = maxKm;
  for (const city of cities) {
    for (const point of city.points) {
      const km = distanceKm(position, point);
      if (km <= best) {
        best = km;
        nearest = city.name;
      }
    }
  }
  return nearest;
}

// The city window's search, with the stores' word rule; an empty text keeps every city.
export function matchCities(cities: readonly City[], text: string): City[] {
  const query = words(text);
  if (query.length === 0) return [...cities];
  return cities.filter((city) => matchesWords(query, words(city.name)));
}
