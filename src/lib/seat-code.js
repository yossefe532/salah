export const parseTableOrWaveFromSeatCode = (barcode, seatClass) => {
  const value = String(barcode || '');
  if (seatClass === 'C') {
    const wMatch = value.match(/-[WR]?([A-Za-z0-9_]+)-S/i);
    if (wMatch) return wMatch[1];
    return '-';
  }
  const tMatch = value.match(/-T([A-Za-z0-9_]+)-S/i);
  if (tMatch) return tMatch[1];
  return '-';
};

export const parseSeatNumberFromSeatCode = (barcode) => {
  const value = String(barcode || '');
  const sMatch = value.match(/-S(\d+)$/i);
  if (sMatch) return Number(sMatch[1]);
  const compact = value.match(/-(\d{1,4})$/);
  if (compact) return Number(compact[1]);
  return null;
};
