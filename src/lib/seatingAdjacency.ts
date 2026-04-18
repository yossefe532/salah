export type SeatLike = {
  id: string;
  seat_class?: string | null;
  seat_number?: number | null;
  row_number?: number | null;
  table_id?: string | null;
};

export const isAdjacentSeat = (a?: SeatLike | null, b?: SeatLike | null): boolean => {
  if (!a || !b) return false;
  if (!a.id || !b.id || a.id === b.id) return false;
  if (String(a.seat_class || '') !== String(b.seat_class || '')) return false;
  const an = Number(a.seat_number || 0);
  const bn = Number(b.seat_number || 0);
  if (!Number.isInteger(an) || !Number.isInteger(bn) || an <= 0 || bn <= 0) return false;

  const sameTable = Boolean(a.table_id && b.table_id && String(a.table_id) === String(b.table_id));
  if (sameTable) return Math.abs(an - bn) === 1;

  const ar = Number(a.row_number || 0);
  const br = Number(b.row_number || 0);
  return ar > 0 && br > 0 && ar === br && Math.abs(an - bn) === 1;
};

export const areSeatsConsecutive = (seats: SeatLike[]): boolean => {
  if (!Array.isArray(seats) || seats.length <= 1) return seats.length === 1;
  const sorted = [...seats].sort((a, b) => Number(a.seat_number || 0) - Number(b.seat_number || 0));
  for (let i = 1; i < sorted.length; i += 1) {
    if (!isAdjacentSeat(sorted[i - 1], sorted[i])) return false;
  }
  return true;
};

export const sortSeatsForPlacement = <T extends SeatLike>(seats: T[]): T[] => {
  return [...(seats || [])].sort((a, b) => {
    const clsA = String(a.seat_class || '');
    const clsB = String(b.seat_class || '');
    if (clsA !== clsB) return clsA.localeCompare(clsB);
    const rowA = Number(a.row_number || 9999);
    const rowB = Number(b.row_number || 9999);
    if (rowA !== rowB) return rowA - rowB;
    const tableA = String(a.table_id || '');
    const tableB = String(b.table_id || '');
    if (tableA !== tableB) return tableA.localeCompare(tableB);
    return Number(a.seat_number || 9999) - Number(b.seat_number || 9999);
  });
};

export const findConsecutiveBlock = <T extends SeatLike>(pool: T[], size: number): T[] | null => {
  if (!Array.isArray(pool) || size <= 0) return [];
  if (pool.length < size) return null;
  if (size === 1) return [sortSeatsForPlacement(pool)[0]];

  const sorted = sortSeatsForPlacement(pool);
  for (let i = 0; i + size <= sorted.length; i += 1) {
    const slice = sorted.slice(i, i + size);
    if (areSeatsConsecutive(slice)) return slice;
  }
  return null;
};
